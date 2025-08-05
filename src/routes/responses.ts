import { type Response as ExpressResponse } from "express";
import { type ValidatedRequest } from "../middleware/validation.js";
import type { CreateResponseParams, McpServerParams, McpApprovalRequestParams } from "../schemas.js";
import { generateUniqueId } from "../lib/generateUniqueId.js";
import { OpenAI } from "openai";
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

export const postCreateResponse = async (
	req: ValidatedRequest<CreateResponseParams>,
	res: ExpressResponse
): Promise<void> => {
	// To avoid duplicated code, we run all requests as stream.
	const events = runCreateResponseStream(req, res);

	// Then we return in the correct format depending on the user 'stream' flag.
	if (req.body.stream) {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Connection", "keep-alive");
		console.debug("Stream request");
		for await (const event of events) {
			console.debug(`Event #${event.sequence_number}: ${event.type}`);
			res.write(`data: ${JSON.stringify(event)}\n\n`);
		}
		res.end();
	} else {
		console.debug("Non-stream request");
		for await (const event of events) {
			if (event.type === "response.completed" || event.type === "response.failed") {
				console.debug(event.type);
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
	res: ExpressResponse
): AsyncGenerator<PatchedResponseStreamEvent> {
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

	// Any events (LLM call, MCP call, list tools, etc.)
	try {
		for await (const event of innerRunStream(req, res, responseObject)) {
			yield { ...event, sequence_number: sequenceNumber++ };
		}
	} catch (error) {
		// Error event => stop
		console.error("Error in stream:", error);

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
		yield {
			type: "response.failed",
			response: responseObject as Response,
			sequence_number: sequenceNumber++,
		};
		return;
	}

	// Response completed event
	responseObject.status = "completed";
	yield {
		type: "response.completed",
		response: responseObject as Response,
		sequence_number: sequenceNumber++,
	};
}

async function* innerRunStream(
	req: ValidatedRequest<CreateResponseParams>,
	res: ExpressResponse,
	responseObject: IncompleteResponse
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

	// Return early if not supported param
	if (req.body.reasoning?.summary && req.body.reasoning?.summary !== "auto") {
		throw new Error(`Not implemented: only 'auto' summary is supported. Got '${req.body.reasoning?.summary}'`);
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
								console.debug(`Using MCP list tools from input for server '${tool.server_label}'`);
								break;
							}
						}
					}
					// Otherwise, list tools from MCP server
					if (!mcpListTools) {
						for await (const event of listMcpToolsStream(tool, responseObject)) {
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
								return {
									role: item.role,
									content,
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
					payload
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

		for await (const event of handleOneTurnStream(apiKey, payload, responseObject, mcpToolsMapping)) {
			yield event;
		}

		currentMessageCount = payload.messages.length;
		iterations++;
	} while (currentMessageCount > previousMessageCount && iterations < MAX_ITERATIONS);
}

async function* listMcpToolsStream(
	tool: McpServerParams,
	responseObject: IncompleteResponse
): AsyncGenerator<PatchedResponseStreamEvent> {
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
		sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
	};

	try {
		const mcp = await connectMcpServer(tool);
		const mcpTools = await mcp.listTools();
		yield {
			type: "response.mcp_list_tools.completed",
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
		outputObject.tools = mcpTools.tools.map((mcpTool) => ({
			input_schema: mcpTool.inputSchema,
			name: mcpTool.name,
			annotations: mcpTool.annotations,
			description: mcpTool.description,
		}));
		yield {
			type: "response.output_item.done",
			output_index: responseObject.output.length - 1,
			item: outputObject,
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
	} catch (error) {
		const errorMessage = `Failed to list tools from MCP server '${tool.server_label}': ${error instanceof Error ? error.message : "Unknown error"}`;
		console.error(errorMessage);
		yield {
			type: "response.mcp_list_tools.failed",
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
		throw new Error(errorMessage);
	}
}

/*
 * Call LLM and stream the response.
 */
async function* handleOneTurnStream(
	apiKey: string | undefined,
	payload: ChatCompletionCreateParamsStreaming,
	responseObject: IncompleteResponse,
	mcpToolsMapping: Record<string, McpServerParams>
): AsyncGenerator<PatchedResponseStreamEvent> {
	const client = new OpenAI({
		baseURL: process.env.OPENAI_BASE_URL ?? "https://router.huggingface.co/v1",
		apiKey: apiKey,
	});
	const stream = await client.chat.completions.create(payload);
	let previousInputTokens = responseObject.usage?.input_tokens ?? 0;
	let previousOutputTokens = responseObject.usage?.output_tokens ?? 0;
	let previousTotalTokens = responseObject.usage?.total_tokens ?? 0;
	let currentTextMode: "text" | "reasoning" = "text";

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

		const delta = chunk.choices[0].delta as PatchedDeltaWithReasoning;

		if (delta.content || delta.reasoning) {
			let currentOutputItem = responseObject.output.at(-1);

			// If start or end of reasoning, skip token and update the current text mode
			if (delta.reasoning) {
				if (currentTextMode === "text") {
					for await (const event of closeLastOutputItem(responseObject, payload, mcpToolsMapping)) {
						yield event;
					}
				}
				currentTextMode = "reasoning";
			} else if (delta.content) {
				if (currentTextMode === "reasoning") {
					for await (const event of closeLastOutputItem(responseObject, payload, mcpToolsMapping)) {
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
				contentPart.text += delta.reasoning;
				yield {
					type: "response.reasoning_text.delta",
					item_id: currentReasoningItem.id,
					output_index: responseObject.output.length - 1,
					content_index: currentReasoningItem.content.length - 1,
					delta: delta.reasoning as string,
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};
			}
		} else if (delta.tool_calls && delta.tool_calls.length > 0) {
			if (delta.tool_calls.length > 1) {
				console.log("Multiple tool calls are not supported. Only the first one will be processed.");
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
								? ("response.mcp_call_arguments.delta" as "response.mcp_call.arguments_delta") // bug workaround (see https://github.com/openai/openai-node/issues/1562)
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

	for await (const event of closeLastOutputItem(responseObject, payload, mcpToolsMapping)) {
		yield event;
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
	payload: ChatCompletionCreateParamsStreaming
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

	const toolParams = mcpToolsMapping[approvalRequest.name];
	const toolResult = await callMcpTool(toolParams, approvalRequest.name, approvalRequest.arguments);

	if (toolResult.error) {
		outputObject.error = toolResult.error;
		yield {
			type: "response.mcp_call.failed",
			sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
		};
	} else {
		outputObject.output = toolResult.output;
		yield {
			type: "response.mcp_call.completed",
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
	mcpToolsMapping: Record<string, McpServerParams>
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
			yield {
				type: "response.function_call_arguments.done",
				item_id: lastOutputItem.id as string,
				output_index: responseObject.output.length - 1,
				arguments: lastOutputItem.arguments,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};

			lastOutputItem.status = "completed";
			yield {
				type: "response.output_item.done",
				output_index: responseObject.output.length - 1,
				item: lastOutputItem,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};
		} else if (lastOutputItem?.type === "mcp_call") {
			yield {
				type: "response.mcp_call_arguments.done" as "response.mcp_call.arguments_done", // bug workaround (see https://github.com/openai/openai-node/issues/1562)
				item_id: lastOutputItem.id as string,
				output_index: responseObject.output.length - 1,
				arguments: lastOutputItem.arguments,
				sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
			};

			// Call MCP tool
			const toolParams = mcpToolsMapping[lastOutputItem.name];
			const toolResult = await callMcpTool(toolParams, lastOutputItem.name, lastOutputItem.arguments);
			if (toolResult.error) {
				lastOutputItem.error = toolResult.error;
				yield {
					type: "response.mcp_call.failed",
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};
			} else {
				lastOutputItem.output = toolResult.output;
				yield {
					type: "response.mcp_call.completed",
					sequence_number: SEQUENCE_NUMBER_PLACEHOLDER,
				};
			}

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
