import { type Response as ExpressResponse } from "express";
import { type ValidatedRequest } from "../middleware/validation.js";
import type { CreateResponseParams, McpServerParams, McpApprovalRequestParams } from "../schemas.js";
import { generateUniqueId } from "../lib/generateUniqueId.js";
import { OpenAI } from "openai";
import { context, propagation, SpanStatusCode, trace, type Attributes, type Context, type Span } from "@opentelemetry/api";
import type { Logger } from "pino";
import type {
	Response,
	ResponseContentPartAddedEvent,
	ResponseOutputMessage,
	ResponseFunctionToolCall,
	ResponseOutputItem,
} from "openai/resources/responses/responses";
import type {
	PatchedResponseContentPart,
	PatchedResponseReasoningItem,
	PatchedResponseStreamEvent,
	ReasoningTextContent,
	PatchedDeltaWithReasoning,
} from "../openai_patch";
import type {
	ChatCompletionCreateParamsStreaming,
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources/chat/completions.js";
import type { FunctionParameters } from "openai/resources/shared.js";
import { callMcpTool, connectMcpServer } from "../mcp.js";

class StreamingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StreamingError";
	}
}

type IncompleteResponse = Omit<Response, "incomplete_details" | "output_text" | "parallel_tool_calls">;
const SEQUENCE_NUMBER_PLACEHOLDER = -1;
const tracer = trace.getTracer("responses.js.routes.responses");

const OTEL_GENAI_CAPTURE_TOOL_CONTENT =
	process.env.OTEL_GENAI_CAPTURE_TOOL_CONTENT === "1" ||
	process.env.OTEL_GENAI_CAPTURE_TOOL_CONTENT?.toLowerCase() === "true";

// All headers are forwarded by default, except these ones.
const NOT_FORWARDED_HEADERS = new Set([
	"accept",
	"accept-encoding",
	"authorization",
	"connection",
	"content-length",
	"content-type",
	"host",
	"keep-alive",
	"te",
	"trailer",
	"trailers",
	"transfer-encoding",
	"upgrade",
]);

const buildJsonAttribute = (value: unknown): string => {
	if (typeof value === "string") {
		return value;
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
};

const getRequestTraceContext = (req: ValidatedRequest<CreateResponseParams>): Context => {
	const carrier: Record<string, string> = {};
	for (const [key, value] of Object.entries(req.headers)) {
		if (typeof value === "string") {
			carrier[key] = value;
		} else if (Array.isArray(value)) {
			carrier[key] = value.join(",");
		}
	}

	return propagation.extract(context.active(), carrier);
};

const recordError = (span: Span, error: unknown): void => {
	span.recordException(error instanceof Error ? error : new Error(String(error)));
	span.setStatus({
		code: SpanStatusCode.ERROR,
		message: error instanceof Error ? error.message : String(error),
	});
};

export const postCreateResponse = async (
	req: ValidatedRequest<CreateResponseParams>,
	res: ExpressResponse
): Promise<void> => {
	const log: Logger = req.log;
	// To avoid duplicated code, we run all requests as stream.
	const events = runCreateResponseStream(req, res, log);

	// Then we return in the correct format depending on the user 'stream' flag.
	if (req.body.stream) {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Connection", "keep-alive");
		log.debug("Processing streaming response");
		for await (const event of events) {
			log.debug({ event_type: event.type, seq: event.sequence_number }, "Stream event");
			res.write(`data: ${JSON.stringify(event)}\n\n`);
		}
		res.end();
	} else {
		log.debug("Processing non-streaming response");
		for await (const event of events) {
			if (event.type === "response.completed" || event.type === "response.failed") {
				log.debug({ event_type: event.type }, "Response completed");
				res.json(event.response);
			}
		}
	}
};

/*
 * Top-level stream.
 *
 * Handles response lifecycle + execute inner logic (MCP list tools, MCP tool calls, LLM call, etc.).
 * Handles sequenceNumber by overwriting it in the events.
 */
async function* runCreateResponseStream(
	req: ValidatedRequest<CreateResponseParams>,
	res: ExpressResponse,
	log: Logger
): AsyncGenerator<PatchedResponseStreamEvent> {
	const requestContext = getRequestTraceContext(req);
	const requestSpan = tracer.startSpan(
		"responses.create",
		{
			attributes: {
				"gen_ai.operation.name": "chat",
				"gen_ai.request.model": req.body.model,
				"gen_ai.request.max_tokens": req.body.max_output_tokens ?? undefined,
				"gen_ai.request.temperature": req.body.temperature ?? undefined,
				"gen_ai.request.top_p": req.body.top_p ?? undefined,
				"gen_ai.response.id": undefined,
			},
		},
		requestContext
	);
	const traceContext = trace.setSpan(requestContext, requestSpan);

	let sequenceNumber = 0;
	// Prepare response object that will be iteratively populated
	const responseObject: IncompleteResponse = {
		created_at: Math.floor(new Date().getTime() / 1000),
		error: null,
		id: generateUniqueId("resp"),
		instructions: req.body.instructions,
		max_output_tokens: req.body.max_output_tokens,
		metadata: req.body.metadata,
		model: req.body.model,
		object: "response",
		output: [],
		// parallel_tool_calls: req.body.parallel_tool_calls,
		status: "in_progress",
		text: req.body.text,
		tool_choice: req.body.tool_choice ?? "auto",
		tools: req.body.tools ?? [],
		temperature: req.body.temperature,
		top_p: req.body.top_p,
		usage: {
			input_tokens: 0,
			input_tokens_details: { cached_tokens: 0 },
			output_tokens: 0,
			output_tokens_details: { reasoning_tokens: 0 },
			total_tokens: 0,
		},
	};
	requestSpan.setAttribute("gen_ai.response.id", responseObject.id);
	// if (req.body.instructions) {
	// 	requestSpan.setAttribute(
	// 		"gen_ai.system_instructions",
	// 		buildJsonAttribute([{ type: "text", content: req.body.instructions }])
	// 	);
	// }

	// Response created event
	yield {
		type: "response.created",
		response: responseObject as Response,
		sequence_number: sequenceNumber++,
	};

	// Response in progress event
	yield {
		type: "response.in_progress",
		response: responseObject as Response,
		sequence_number: sequenceNumber++,
	};

	try {
		// Any events (LLM call, MCP call, list tools, etc.)
		try {
			for await (const event of innerRunStream(req, res, responseObject, traceContext, log)) {
				yield { ...event, sequence_number: sequenceNumber++ };
			}
		} catch (error) {
			// Error event => stop
			log.error({ err: error }, "Stream error");

			const message =
				typeof error === "object" &&
					error &&
					"message" in error &&
					typeof (error as { message: unknown }).message === "string"
					? (error as { message: string }).message
					: "An error occurred in stream";

			responseObject.status = "failed";
			responseObject.error = {
				code: "server_error",
				message,
			};
			recordError(requestSpan, error);
			yield {
				type: "response.failed",
				response: responseObject as Response,
				sequence_number: sequenceNumber++,
			};
			return;
		}

		// Response completed event
		responseObject.status = "completed";
		if (responseObject.usage) {
			requestSpan.setAttributes({
				"gen_ai.usage.input_tokens": responseObject.usage.input_tokens,
				"gen_ai.usage.output_tokens": responseObject.usage.output_tokens,
			});
		}
		requestSpan.setAttributes({
			"gen_ai.response.model": responseObject.model,
			"response.status": responseObject.status,
		});
		yield {
			type: "response.completed",
			response: responseObject as Response,
			sequence_number: sequenceNumber++,
		};
	} finally {
		requestSpan.end();
	}
}

async function* innerRunStream(
	req: ValidatedRequest<CreateResponseParams>,
	res: ExpressResponse,
	responseObject: IncompleteResponse,
	traceContext: Context,
	log: Logger
): AsyncGenerator<PatchedResponseStreamEvent> {
	// Retrieve API key from headers
	const apiKey = req.headers.authorization?.split(" ")[1];
	if (!apiKey) {
		res.status(401).json({
			success: false,
			error: "Unauthorized",
		});
		return;
	}

	// Forward headers (except authorization handled separately)
	const defaultHeaders = Object.fromEntries(
		Object.entries(req.headers).filter(([key]) => !NOT_FORWARDED_HEADERS.has(key.toLowerCase()))
	) as Record<string, string>;

	// Return early if not supported param
	if (req.body.reasoning?.summary && req.body.reasoning?.summary !== "auto") {
		throw new Error(`Not implemented: only 'auto' summary is supported. Got '${req.body.reasoning?.summary}'`);
	}

	// Trace function tool calls provided by the client in input history
	if (Array.isArray(req.body.input)) {
		for (const item of req.body.input) {
			if (item.type !== "function_call") {
				continue;
			}

			const matchingOutput = req.body.input.find(
				inputItem => inputItem.type === "function_call_output" && inputItem.call_id === item.call_id
			) as Extract<NonNullable<CreateResponseParams["input"]>[number], { type: "function_call_output" }> | undefined;

			const functionCallSpanAttributes: Attributes = {
				"gen_ai.operation.name": "execute_tool",
				"gen_ai.tool.type": "function",
				"gen_ai.tool.call.id": item.call_id,
				"gen_ai.tool.name": item.name ?? "unknown_function",
			};

			if (OTEL_GENAI_CAPTURE_TOOL_CONTENT) {
				if (item.arguments) {
					functionCallSpanAttributes["gen_ai.tool.call.arguments"] = buildJsonAttribute(item.arguments);
				}
				if (matchingOutput?.output) {
					functionCallSpanAttributes["gen_ai.tool.call.result"] = buildJsonAttribute(matchingOutput.output);
				}
			}

			const functionCallSpan = tracer.startSpan(
				"gen_ai.execute_tool",
				{ attributes: functionCallSpanAttributes },
				traceContext
			);
			functionCallSpan.setAttribute("tool.status", matchingOutput ? "ok" : "requested");
			functionCallSpan.end();
		}
	}

	// List MCP tools from server (if required) + prepare tools for the LLM
	let tools: ChatCompletionTool[] | undefined = [];
	const mcpToolsMapping: Record<string, McpServerParams> = {};
	if (req.body.tools) {
		for (const tool of req.body.tools) {
			switch (tool.type) {
				case "function":
					tools?.push({
						type: tool.type,
						function: {
							name: tool.name,
							parameters: tool.parameters,
							description: tool.description,
							strict: tool.strict,
						},
					});
					break;
				case "mcp": {
					let mcpListTools: ResponseOutputItem.McpListTools | undefined;

					// If MCP list tools is already in the input, use it
					if (Array.isArray(req.body.input)) {
						for (const item of req.body.input) {
							if (item.type === "mcp_list_tools" && item.server_label === tool.server_label) {
								mcpListTools = item;
								log.debug({ server_label: tool.server_label }, "Using MCP list tools from input");
								break;
							}
						}
					}
					// Otherwise, list tools from MCP server
					if (!mcpListTools) {
						for await (const event of listMcpToolsStream(tool, responseObject, traceContext, log)) {
							yield event;
						}
						mcpListTools = responseObject.output.at(-1) as ResponseOutputItem.McpListTools;
					}

					// Only allowed tools are forwarded to the LLM
					const allowedTools = tool.allowed_tools
						? Array.isArray(tool.allowed_tools)
							? tool.allowed_tools
							: tool.allowed_tools.tool_names
						: [];
					if (mcpListTools?.tools) {
						for (const mcpTool of mcpListTools.tools) {
							if (allowedTools.length === 0 || allowedTools.includes(mcpTool.name)) {
								tools?.push({
									type: "function" as const,
									function: {
										name: mcpTool.name,
										parameters: mcpTool.input_schema as FunctionParameters,
										description: mcpTool.description ?? undefined,
									},
								});
							}
							mcpToolsMapping[mcpTool.name] = tool;
						}
						break;
					}
				}
			}
		}
	}
	if (tools.length === 0) {
		tools = undefined;
	}

	// Prepare payload for the LLM

	// Format input to Chat Completion format
	const messages: ChatCompletionMessageParam[] = req.body.instructions
		? [{ role: "system", content: req.body.instructions }]
		: [];
	if (Array.isArray(req.body.input)) {
		messages.push(
			...req.body.input
				.map((item) => {
					switch (item.type) {
						case "function_call":
							return {
								role: "tool" as const,
								content: item.arguments,
								tool_call_id: item.call_id,
							};
						case "function_call_output":
							return {
								role: "tool" as const,
								content: item.output,
								tool_call_id: item.call_id,
							};
						case "message":
						case undefined:
							if (item.role === "assistant" || item.role === "user" || item.role === "system") {
								const content =
									typeof item.content === "string"
										? item.content
										: item.content
											.map((content) => {
												switch (content.type) {
													case "input_image":
														return {
															type: "image_url" as const,
															image_url: {
																url: content.image_url,
															},
														};
													case "output_text":
														return content.text
															? {
																type: "text" as const,
																text: content.text,
															}
															: undefined;
													case "refusal":
														return undefined;
													case "input_text":
														return {
															type: "text" as const,
															text: content.text,
														};
												}
											})
											.filter((item) => {
												return item !== undefined;
											});
								const maybeFlatContent =
									content.length === 1 &&
										typeof content[0] === "object" &&
										"type" in content[0] &&
										content[0].type === "text"
										? content[0].text
										: content;
								return {
									role: item.role,
									content: maybeFlatContent,
								} as ChatCompletionMessageParam;
							}
							return undefined;
						case "mcp_list_tools": {
							return {
								role: "tool" as const,
								content: "MCP list tools. Server: '${item.server_label}'.",
								tool_call_id: "mcp_list_tools",
							};
						}
						case "mcp_call": {
							return {
								role: "tool" as const,
								content: `MCP call (${item.id}). Server: '${item.server_label}'. Tool: '${item.name}'. Arguments: '${item.arguments}'.`,
								tool_call_id: "mcp_call",
							};
						}
						case "mcp_approval_request": {
							return {
								role: "tool" as const,
								content: `MCP approval request (${item.id}). Server: '${item.server_label}'. Tool: '${item.name}'. Arguments: '${item.arguments}'.`,
								tool_call_id: "mcp_approval_request",
							};
						}
						case "mcp_approval_response": {
							return {
								role: "tool" as const,
								content: `MCP approval response (${item.id}). Approved: ${item.approve}. Reason: ${item.reason}.`,
								tool_call_id: "mcp_approval_response",
							};
						}
					}
				})
				.filter(
					(message): message is NonNullable<typeof message> =>
						message !== undefined &&
						(typeof message.content === "string" || (Array.isArray(message.content) && message.content.length !== 0))
				)
		);
	} else {
		messages.push({ role: "user", content: req.body.input } as const);
	}

	// Prepare payload for the LLM
	const payload: ChatCompletionCreateParamsStreaming = {
		// main params
		model: req.body.model,
		messages,
		stream: true,
		// options
		max_tokens: req.body.max_output_tokens === null ? undefined : req.body.max_output_tokens,
		response_format: req.body.text?.format
			? req.body.text.format.type === "json_schema"
				? {
					type: "json_schema",
					json_schema: {
						description: req.body.text.format.description,
						name: req.body.text.format.name,
						schema: req.body.text.format.schema,
						strict: false, // req.body.text.format.strict,
					},
				}
				: { type: req.body.text.format.type }
			: undefined,
		reasoning_effort: req.body.reasoning?.effort,
		temperature: req.body.temperature,
		tool_choice:
			typeof req.body.tool_choice === "string"
				? req.body.tool_choice
				: req.body.tool_choice
					? {
						type: "function",
						function: {
							name: req.body.tool_choice.name,
						},
					}
					: undefined,
		tools,
		top_p: req.body.top_p,
	};

	// If MCP approval requests => execute them and return (no LLM call)
	if (Array.isArray(req.body.input)) {
		for (const item of req.body.input) {
			if (item.type === "mcp_approval_response" && item.approve) {
				const approvalRequest = req.body.input.find(
					(i) => i.type === "mcp_approval_request" && i.id === item.approval_request_id
				) as McpApprovalRequestParams | undefined;
				const mcpCallId = "mcp_" + item.approval_request_id.split("_")[1];
				const mcpCall = req.body.input.find((i) => i.type === "mcp_call" && i.id === mcpCallId);
				if (mcpCall) {
					// MCP call for that approval request has already been made, so we can skip it
					continue;
				}

				for await (const event of callApprovedMCPToolStream(
					item.approval_request_id,
					mcpCallId,
					approvalRequest,
					mcpToolsMapping,
					responseObject,
					payload,
					traceContext,
					log
				)) {
					yield event;
				}
			}
		}
	}

	// Call the LLM until no new message is added to the payload.
	// New messages can be added if the LLM calls an MCP tool that is automatically run.
	// A maximum number of iterations is set to avoid infinite loops.
	let previousMessageCount: number;
	let currentMessageCount = payload.messages.length;
	const MAX_ITERATIONS = 5; // hard-coded
	let iterations = 0;
	do {
		previousMessageCount = currentMessageCount;

		for await (const event of handleOneTurnStream(apiKey, payload, responseObject, mcpToolsMapping, defaultHeaders, traceContext, log)) {
			yield event;
		}

		currentMessageCount = payload.messages.length;
		iterations++;
	} while (currentMessageCount > previousMessageCount && iterations < MAX_ITERATIONS);
}

async function* listMcpToolsStream(
	tool: McpServerParams,
	responseObject: IncompleteResponse,
	traceContext: Context,
	log: Logger
): AsyncGenerator<PatchedResponseStreamEvent> {
	const span = tracer.startSpan(
		"gen_ai.execute_tool",
		{
			attributes: {
				"gen_ai.operation.name": "execute_tool",
				"gen_ai.tool.name": "mcp.list_tools",
				"gen_ai.tool.type": "extension",
				"mcp.server_label": tool.server_label,
			},
		},
		traceContext
	);
	const outputObject: ResponseOutputItem.McpListTools = {
		id: generateUniqueId("mcpl"),
		type: "mcp_list_tools",
		server_label: tool.server_label,
		tools: [],
	};
	responseObject.output.push(outputObject);

	yield {
		type: "response.output_item.added",
		output_index: responseObject.output.length - 1,
		item: outputObject,
		sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
	};

	yield {
		type: "response.mcp_list_tools.in_progress",
		item_id: outputObject.id,
		output_index: responseObject.output.length - 1,
		sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
	};

	try {
		const mcp = await connectMcpServer(tool, log);
		const mcpTools = await mcp.listTools();
		yield {
			type: "response.mcp_list_tools.completed",
			item_id: outputObject.id,
			output_index: responseObject.output.length - 1,
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
		outputObject.tools = mcpTools.tools.map((mcpTool) => ({
			input_schema: mcpTool.inputSchema,
			name: mcpTool.name,
			annotations: mcpTool.annotations,
			description: mcpTool.description,
		}));
		span.setAttribute("mcp.tools.count", outputObject.tools.length);
		yield {
			type: "response.output_item.done",
			output_index: responseObject.output.length - 1,
			item: outputObject,
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
	} catch (error) {
		const errorMessage = `Failed to list tools from MCP server '${tool.server_label}': ${error instanceof Error ? error.message : "Unknown error"}`;
		log.error({ err: error, server_label: tool.server_label }, "Failed to list MCP tools");
		recordError(span, error);
		yield {
			type: "response.mcp_list_tools.failed",
			item_id: outputObject.id,
			output_index: responseObject.output.length - 1,
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
		throw new Error(errorMessage);
	} finally {
		span.end();
	}
}

/*
 * Call LLM and stream the response.
 */
async function* handleOneTurnStream(
	apiKey: string | undefined,
	payload: ChatCompletionCreateParamsStreaming,
	responseObject: IncompleteResponse,
	mcpToolsMapping: Record<string, McpServerParams>,
	defaultHeaders: Record<string, string>,
	traceContext: Context,
	log: Logger
): AsyncGenerator<PatchedResponseStreamEvent> {
	const llmSpan = tracer.startSpan(
		"gen_ai.chat",
		{
			attributes: {
				"gen_ai.operation.name": "chat",
				"gen_ai.request.model": payload.model,
				"gen_ai.request.max_tokens": payload.max_tokens ?? undefined,
				"gen_ai.request.temperature": payload.temperature ?? undefined,
				"gen_ai.request.top_p": payload.top_p ?? undefined,
			},
		},
		traceContext
	);

	const client = new OpenAI({
		baseURL: process.env.OPENAI_BASE_URL ?? "https://router.huggingface.co/v1",
		apiKey: apiKey,
		defaultHeaders,
	});
	const stream = await client.chat.completions.create(payload);
	let previousInputTokens = responseObject.usage?.input_tokens ?? 0;
	let previousOutputTokens = responseObject.usage?.output_tokens ?? 0;
	let previousTotalTokens = responseObject.usage?.total_tokens ?? 0;
	let currentTextMode: "text" | "reasoning" = "text";

	try {
		for await (const chunk of stream) {
			if (chunk.usage) {
				// Overwrite usage with the latest chunk's usage
				responseObject.usage = {
					input_tokens: previousInputTokens + chunk.usage.prompt_tokens,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens: previousOutputTokens + chunk.usage.completion_tokens,
					output_tokens_details: { reasoning_tokens: 0 },
					total_tokens: previousTotalTokens + chunk.usage.total_tokens,
				};
			}

			if (!chunk.choices[0]) {
				continue;
			}

			const delta = chunk.choices[0].delta as PatchedDeltaWithReasoning;
			const reasoningText = delta.reasoning ?? delta.reasoning_content;

			if (delta.content || reasoningText) {
				let currentOutputItem = responseObject.output.at(-1);

				// If start or end of reasoning, skip token and update the current text mode
				if (reasoningText) {
					if (currentTextMode === "text") {
						for await (const event of closeLastOutputItem(responseObject, payload, mcpToolsMapping, traceContext, log)) {
							yield event;
						}
					}
					currentTextMode = "reasoning";
				} else if (delta.content) {
					if (currentTextMode === "reasoning") {
						for await (const event of closeLastOutputItem(responseObject, payload, mcpToolsMapping, traceContext, log)) {
							yield event;
						}
					}
					currentTextMode = "text";
				}

				// If start of a new message, create it
				if (currentTextMode === "text") {
					if (currentOutputItem?.type !== "message" || currentOutputItem?.status !== "in_progress") {
						const outputObject: ResponseOutputMessage = {
							id: generateUniqueId("msg"),
							type: "message",
							role: "assistant",
							status: "in_progress",
							content: [],
						};
						responseObject.output.push(outputObject);

						// Response output item added event
						yield {
							type: "response.output_item.added",
							output_index: 0,
							item: outputObject,
							sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
						};
					}
				} else if (currentTextMode === "reasoning") {
					if (currentOutputItem?.type !== "reasoning" || currentOutputItem?.status !== "in_progress") {
						const outputObject: PatchedResponseReasoningItem = {
							id: generateUniqueId("rs"),
							type: "reasoning",
							status: "in_progress",
							content: [],
							summary: [],
						};
						responseObject.output.push(outputObject);

						// Response output item added event
						yield {
							type: "response.output_item.added",
							output_index: 0,
							item: outputObject,
							sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
						};
					}
				}

				// If start of a new content part, create it
				if (currentTextMode === "text") {
					const currentOutputMessage = responseObject.output.at(-1) as ResponseOutputMessage;
					if (currentOutputMessage.content.length === 0) {
						// Response content part added event
						const contentPart: ResponseContentPartAddedEvent["part"] = {
							type: "output_text",
							text: "",
							annotations: [],
						};
						currentOutputMessage.content.push(contentPart);

						yield {
							type: "response.content_part.added",
							item_id: currentOutputMessage.id,
							output_index: responseObject.output.length - 1,
							content_index: currentOutputMessage.content.length - 1,
							part: contentPart,
							sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
						};
					}

					const contentPart = currentOutputMessage.content.at(-1);
					if (!contentPart || contentPart.type !== "output_text") {
						throw new StreamingError(
							`Not implemented: only output_text is supported in response.output[].content[].type. Got ${contentPart?.type}`
						);
					}

					// Add text delta
					contentPart.text += delta.content;
					yield {
						type: "response.output_text.delta",
						item_id: currentOutputMessage.id,
						output_index: responseObject.output.length - 1,
						content_index: currentOutputMessage.content.length - 1,
						delta: delta.content as string,
						logprobs: [],
						sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
					};
				} else if (currentTextMode === "reasoning") {
					const currentReasoningItem = responseObject.output.at(-1) as PatchedResponseReasoningItem;
					if (currentReasoningItem.content.length === 0) {
						// Response content part added event
						const contentPart: ReasoningTextContent = {
							type: "reasoning_text",
							text: "",
						};
						currentReasoningItem.content.push(contentPart);

						yield {
							type: "response.content_part.added",
							item_id: currentReasoningItem.id,
							output_index: responseObject.output.length - 1,
							content_index: currentReasoningItem.content.length - 1,
							part: contentPart as unknown as PatchedResponseContentPart, // TODO: adapt once openai-node is updated
							sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
						};
					}

					// Add text delta
					const contentPart = currentReasoningItem.content.at(-1) as ReasoningTextContent;
					contentPart.text += reasoningText;
					yield {
						type: "response.reasoning_text.delta",
						item_id: currentReasoningItem.id,
						output_index: responseObject.output.length - 1,
						content_index: currentReasoningItem.content.length - 1,
						delta: reasoningText as string,
						sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
					};
				}
			} else if (delta.tool_calls && delta.tool_calls.length > 0) {
				if (delta.tool_calls.length > 1) {
					log.warn("Multiple tool calls not supported, only the first will be processed");
				}

				let currentOutputItem = responseObject.output.at(-1);
				if (delta.tool_calls[0].function?.name) {
					const functionName = delta.tool_calls[0].function.name;
					// Tool call with a name => new tool call
					let newOutputObject:
						| ResponseOutputItem.McpCall
						| ResponseFunctionToolCall
						| ResponseOutputItem.McpApprovalRequest;
					if (functionName in mcpToolsMapping) {
						if (requiresApproval(functionName, mcpToolsMapping)) {
							newOutputObject = {
								id: generateUniqueId("mcpr"),
								type: "mcp_approval_request",
								name: functionName,
								server_label: mcpToolsMapping[functionName].server_label,
								arguments: "",
							};
						} else {
							newOutputObject = {
								type: "mcp_call",
								id: generateUniqueId("mcp"),
								name: functionName,
								server_label: mcpToolsMapping[functionName].server_label,
								arguments: "",
							};
						}
					} else {
						newOutputObject = {
							type: "function_call",
							id: generateUniqueId("fc"),
							call_id: delta.tool_calls[0].id ?? "",
							name: functionName,
							arguments: "",
						};
					}

					// Response output item added event
					responseObject.output.push(newOutputObject);
					yield {
						type: "response.output_item.added",
						output_index: responseObject.output.length - 1,
						item: newOutputObject,
						sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
					};
					if (newOutputObject.type === "mcp_call") {
						yield {
							type: "response.mcp_call.in_progress",
							sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
							item_id: newOutputObject.id,
							output_index: responseObject.output.length - 1,
						};
					}
				}

				if (delta.tool_calls[0].function?.arguments) {
					// Current item is necessarily a tool call
					currentOutputItem = responseObject.output.at(-1) as
						| ResponseOutputItem.McpCall
						| ResponseFunctionToolCall
						| ResponseOutputItem.McpApprovalRequest;
					currentOutputItem.arguments += delta.tool_calls[0].function.arguments;
					if (currentOutputItem.type === "mcp_call" || currentOutputItem.type === "function_call") {
						yield {
							type:
								currentOutputItem.type === "mcp_call"
									? "response.mcp_call_arguments.delta"
									: "response.function_call_arguments.delta",
							item_id: currentOutputItem.id as string,
							output_index: responseObject.output.length - 1,
							delta: delta.tool_calls[0].function.arguments,
							sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
						};
					}
				}
			}
		}

		for await (const event of closeLastOutputItem(responseObject, payload, mcpToolsMapping, traceContext, log)) {
			yield event;
		}
	} catch (error) {
		recordError(llmSpan, error);
		throw error;
	} finally {
		if (responseObject.usage) {
			llmSpan.setAttributes({
				"gen_ai.usage.input_tokens": responseObject.usage.input_tokens,
				"gen_ai.usage.output_tokens": responseObject.usage.output_tokens,
			});
		}
		llmSpan.end();
	}
}

/*
 * Perform an approved MCP tool call and stream the response.
 */
async function* callApprovedMCPToolStream(
	approval_request_id: string,
	mcpCallId: string,
	approvalRequest: McpApprovalRequestParams | undefined,
	mcpToolsMapping: Record<string, McpServerParams>,
	responseObject: IncompleteResponse,
	payload: ChatCompletionCreateParamsStreaming,
	traceContext: Context,
	log: Logger
): AsyncGenerator<PatchedResponseStreamEvent> {
	if (!approvalRequest) {
		throw new Error(`MCP approval request '${approval_request_id}' not found`);
	}

	const outputObject: ResponseOutputItem.McpCall = {
		type: "mcp_call",
		id: mcpCallId,
		name: approvalRequest.name,
		server_label: approvalRequest.server_label,
		arguments: approvalRequest.arguments,
	};
	responseObject.output.push(outputObject);

	// Response output item added event
	yield {
		type: "response.output_item.added",
		output_index: responseObject.output.length - 1,
		item: outputObject,
		sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
	};

	yield {
		type: "response.mcp_call.in_progress",
		item_id: outputObject.id,
		output_index: responseObject.output.length - 1,
		sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
	};

	const toolSpan = tracer.startSpan(
		"gen_ai.execute_tool",
		{
			attributes: {
				"gen_ai.operation.name": "execute_tool",
				"gen_ai.tool.name": approvalRequest.name,
				"gen_ai.tool.type": "extension",
				"gen_ai.tool.call.id": outputObject.id,
				"mcp.server_label": approvalRequest.server_label,
				...(OTEL_GENAI_CAPTURE_TOOL_CONTENT
					? {
						"gen_ai.tool.call.arguments": buildJsonAttribute(approvalRequest.arguments),
					}
					: {}),
			},
		},
		traceContext
	);

	const toolParams = mcpToolsMapping[approvalRequest.name];
	let toolResult;
	try {
		toolResult = await callMcpTool(toolParams, approvalRequest.name, approvalRequest.arguments, log);
	} catch (error) {
		recordError(toolSpan, error);
		toolSpan.end();
		throw error;
	}

	if (toolResult.error) {
		outputObject.error = toolResult.error;
		toolSpan.setAttribute("tool.status", "error");
		toolSpan.setAttribute("tool.error", toolResult.error);
		recordError(toolSpan, new Error(toolResult.error));
		yield {
			type: "response.mcp_call.failed",
			item_id: outputObject.id,
			output_index: responseObject.output.length - 1,
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
	} else {
		outputObject.output = toolResult.output;
		toolSpan.setAttribute("tool.status", "ok");
		if (OTEL_GENAI_CAPTURE_TOOL_CONTENT) {
			toolSpan.setAttribute("gen_ai.tool.call.result", buildJsonAttribute(toolResult.output));
		}
		yield {
			type: "response.mcp_call.completed",
			item_id: outputObject.id,
			output_index: responseObject.output.length - 1,
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
	}

	yield {
		type: "response.output_item.done",
		output_index: responseObject.output.length - 1,
		item: outputObject,
		sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
	};

	// Updating the payload for next LLM call
	payload.messages.push(
		{
			role: "assistant",
			tool_calls: [
				{
					id: outputObject.id,
					type: "function",
					function: {
						name: outputObject.name,
						arguments: outputObject.arguments,
						// Hacky: type is not correct in inference.js. Will fix it but in the meantime we need to cast it.
						// TODO: fix it in the inference.js package. Should be "arguments" and not "parameters".
					},
				},
			],
		},
		{
			role: "tool",
			tool_call_id: outputObject.id,
			content: outputObject.output ? outputObject.output : outputObject.error ? `Error: ${outputObject.error}` : "",
		}
	);

	toolSpan.end();
}

function requiresApproval(toolName: string, mcpToolsMapping: Record<string, McpServerParams>): boolean {
	const toolParams = mcpToolsMapping[toolName];
	return toolParams.require_approval === "always"
		? true
		: toolParams.require_approval === "never"
			? false
			: toolParams.require_approval.always?.tool_names?.includes(toolName)
				? true
				: toolParams.require_approval.never?.tool_names?.includes(toolName)
					? false
					: true; // behavior is undefined in specs, let's default to true
}

async function* closeLastOutputItem(
	responseObject: IncompleteResponse,
	payload: ChatCompletionCreateParamsStreaming,
	mcpToolsMapping: Record<string, McpServerParams>,
	traceContext: Context,
	log: Logger
): AsyncGenerator<PatchedResponseStreamEvent> {
	const lastOutputItem = responseObject.output.at(-1);
	if (lastOutputItem) {
		if (lastOutputItem?.type === "message") {
			const contentPart = lastOutputItem.content.at(-1);
			if (contentPart?.type === "output_text") {
				yield {
					type: "response.output_text.done",
					item_id: lastOutputItem.id,
					output_index: responseObject.output.length - 1,
					content_index: lastOutputItem.content.length - 1,
					text: contentPart.text,
					logprobs: [],
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};

				yield {
					type: "response.content_part.done",
					item_id: lastOutputItem.id,
					output_index: responseObject.output.length - 1,
					content_index: lastOutputItem.content.length - 1,
					part: contentPart,
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};
			} else {
				throw new StreamingError("Not implemented: only output_text is supported in streaming mode.");
			}

			// Response output item done event
			lastOutputItem.status = "completed";
			yield {
				type: "response.output_item.done",
				output_index: responseObject.output.length - 1,
				item: lastOutputItem,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};
		} else if (lastOutputItem?.type === "reasoning") {
			const contentPart = (lastOutputItem as PatchedResponseReasoningItem).content.at(-1);
			if (contentPart !== undefined) {
				yield {
					type: "response.reasoning_text.done",
					item_id: lastOutputItem.id,
					output_index: responseObject.output.length - 1,
					content_index: (lastOutputItem as PatchedResponseReasoningItem).content.length - 1,
					text: contentPart.text,
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};

				yield {
					type: "response.content_part.done",
					item_id: lastOutputItem.id,
					output_index: responseObject.output.length - 1,
					content_index: (lastOutputItem as PatchedResponseReasoningItem).content.length - 1,
					part: contentPart as unknown as PatchedResponseContentPart, // TODO: adapt once openai-node is updated
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};
			}
			// Response output item done event
			lastOutputItem.status = "completed";
			yield {
				type: "response.output_item.done",
				output_index: responseObject.output.length - 1,
				item: lastOutputItem,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};
		} else if (lastOutputItem?.type === "function_call") {
			const functionCallSpanAttributes: Attributes = {
				"gen_ai.operation.name": "execute_tool",
				"gen_ai.tool.name": lastOutputItem.name,
				"gen_ai.tool.type": "function",
				"gen_ai.tool.call.id": lastOutputItem.call_id || lastOutputItem.id,
			};
			if (OTEL_GENAI_CAPTURE_TOOL_CONTENT) {
				functionCallSpanAttributes["gen_ai.tool.call.arguments"] = buildJsonAttribute(lastOutputItem.arguments);
			}
			const functionCallSpan = tracer.startSpan(
				"gen_ai.execute_tool",
				{ attributes: functionCallSpanAttributes },
				traceContext
			);

			yield {
				type: "response.function_call_arguments.done",
				item_id: lastOutputItem.id as string,
				output_index: responseObject.output.length - 1,
				arguments: lastOutputItem.arguments,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};

			lastOutputItem.status = "completed";
			functionCallSpan.setAttribute("tool.status", "requested");
			yield {
				type: "response.output_item.done",
				output_index: responseObject.output.length - 1,
				item: lastOutputItem,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};
			functionCallSpan.end();
		} else if (lastOutputItem?.type === "mcp_call") {
			yield {
				type: "response.mcp_call_arguments.done",
				item_id: lastOutputItem.id as string,
				output_index: responseObject.output.length - 1,
				arguments: lastOutputItem.arguments,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};

			// Call MCP tool
			const toolParams = mcpToolsMapping[lastOutputItem.name];
			const toolSpanAttributes: Attributes = {
				"gen_ai.operation.name": "execute_tool",
				"gen_ai.tool.name": lastOutputItem.name,
				"gen_ai.tool.type": "extension",
				"gen_ai.tool.call.id": lastOutputItem.id,
				"mcp.server_label": lastOutputItem.server_label,
			};
			if (OTEL_GENAI_CAPTURE_TOOL_CONTENT) {
				toolSpanAttributes["gen_ai.tool.call.arguments"] = buildJsonAttribute(lastOutputItem.arguments);
			}
			const toolSpan = tracer.startSpan("gen_ai.execute_tool", { attributes: toolSpanAttributes }, traceContext);

			let toolResult;
			try {
				toolResult = await callMcpTool(toolParams, lastOutputItem.name, lastOutputItem.arguments, log);
			} catch (error) {
				recordError(toolSpan, error);
				toolSpan.end();
				throw error;
			}
			if (toolResult.error) {
				lastOutputItem.error = toolResult.error;
				toolSpan.setAttribute("tool.status", "error");
				toolSpan.setAttribute("tool.error", toolResult.error);
				recordError(toolSpan, new Error(toolResult.error));
				yield {
					type: "response.mcp_call.failed",
					item_id: lastOutputItem.id as string,
					output_index: responseObject.output.length - 1,
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};
			} else {
				lastOutputItem.output = toolResult.output;
				toolSpan.setAttribute("tool.status", "ok");
				if (OTEL_GENAI_CAPTURE_TOOL_CONTENT) {
					toolSpan.setAttribute("gen_ai.tool.call.result", buildJsonAttribute(toolResult.output));
				}
				yield {
					type: "response.mcp_call.completed",
					item_id: lastOutputItem.id as string,
					output_index: responseObject.output.length - 1,
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};
			}
			toolSpan.end();

			yield {
				type: "response.output_item.done",
				output_index: responseObject.output.length - 1,
				item: lastOutputItem,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};

			// Updating the payload for next LLM call
			payload.messages.push(
				{
					role: "assistant",
					tool_calls: [
						{
							id: lastOutputItem.id,
							type: "function",
							function: {
								name: lastOutputItem.name,
								arguments: lastOutputItem.arguments,
								// Hacky: type is not correct in inference.js. Will fix it but in the meantime we need to cast it.
								// TODO: fix it in the inference.js package. Should be "arguments" and not "parameters".
							},
						},
					],
				},
				{
					role: "tool",
					tool_call_id: lastOutputItem.id,
					content: lastOutputItem.output
						? lastOutputItem.output
						: lastOutputItem.error
							? `Error: ${lastOutputItem.error}`
							: "",
				}
			);
		} else if (lastOutputItem?.type === "mcp_approval_request" || lastOutputItem?.type === "mcp_list_tools") {
			yield {
				type: "response.output_item.done",
				output_index: responseObject.output.length - 1,
				item: lastOutputItem,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};
		} else {
			throw new StreamingError(
				`Not implemented: expected message, function_call, or mcp_call, got ${lastOutputItem?.type}`
			);
		}
	}
}
