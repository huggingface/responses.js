import { type Response as ExpressResponse } from "express";
import { type ValidatedRequest } from "../middleware/validation.js";
import type { CreateResponseParams, McpServerParams, McpApprovalRequestParams } from "../schemas.js";
import { generateUniqueId } from "../lib/generateUniqueId.js";
import { InferenceClient } from "@huggingface/inference";
import type {
	ChatCompletionInputMessage,
	ChatCompletionInputMessageChunkType,
	ChatCompletionInput,
} from "@huggingface/tasks";

import type {
	Response,
	ResponseStreamEvent,
	ResponseContentPartAddedEvent,
	ResponseOutputMessage,
	ResponseFunctionToolCall,
	ResponseOutputItem,
} from "openai/resources/responses/responses";
import type {
	ChatCompletionInputTool,
	ChatCompletionStreamOutputUsage,
} from "@huggingface/tasks/dist/commonjs/tasks/chat-completion/inference.js";
import { callMcpTool, connectMcpServer } from "../mcp.js";

class StreamingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StreamingError";
	}
}

export const postCreateResponse = async (
	req: ValidatedRequest<CreateResponseParams>,
	res: ExpressResponse
): Promise<void> => {
	const apiKey = req.headers.authorization?.split(" ")[1];

	if (!apiKey) {
		res.status(401).json({
			success: false,
			error: "Unauthorized",
		});
		return;
	}

	const client = new InferenceClient(apiKey);
	const messages: ChatCompletionInputMessage[] = req.body.instructions
		? [{ role: "system", content: req.body.instructions }]
		: [];

	if (Array.isArray(req.body.input)) {
		messages.push(
			...req.body.input
				.map((item) => {
					switch (item.type) {
						case "function_call":
							return {
								// hacky but best fit for now
								role: "assistant",
								name: `function_call ${item.name} ${item.call_id}`,
								content: item.arguments,
							};
						case "function_call_output":
							return {
								// hacky but best fit for now
								role: "assistant",
								name: `function_call_output ${item.call_id}`,
								content: item.output,
							};
						case "message":
							return {
								role: item.role,
								content:
									typeof item.content === "string"
										? item.content
										: item.content
												.map((content) => {
													switch (content.type) {
														case "input_image":
															return {
																type: "image_url" as ChatCompletionInputMessageChunkType,
																image_url: {
																	url: content.image_url,
																},
															};
														case "output_text":
															return content.text
																? {
																		type: "text" as ChatCompletionInputMessageChunkType,
																		text: content.text,
																	}
																: undefined;
														case "refusal":
															return undefined;
														case "input_text":
															return {
																type: "text" as ChatCompletionInputMessageChunkType,
																text: content.text,
															};
													}
												})
												.filter((item) => item !== undefined),
							};
						case "mcp_list_tools": {
							// Hacky: will be dropped by filter
							return {
								role: "assistant",
								name: "mcp_list_tools",
								content: "",
							};
						}
						case "mcp_approval_request": {
							return {
								role: "assistant",
								name: "mcp_approval_request",
								content: `MCP approval request (${item.id}). Server: '${item.server_label}'. Tool: '${item.name}'. Arguments: '${item.arguments}'.`,
							};
						}
						case "mcp_approval_response": {
							return {
								role: "assistant",
								name: "mcp_approval_response",
								content: `MCP approval response (${item.id}). Approved: ${item.approve}. Reason: ${item.reason}.`,
							};
						}
					}
				})
				.filter((message) => message.content?.length !== 0)
		);
	} else {
		messages.push({ role: "user", content: req.body.input });
	}

	const output: ResponseOutputItem[] = [];
	let tools: ChatCompletionInputTool[] | undefined = [];
	const mcpToolsMapping: Record<string, McpServerParams> = {};
	if (req.body.tools) {
		await Promise.all(
			req.body.tools.map(async (tool) => {
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
							try {
								const mcp = await connectMcpServer(tool);
								console.debug("Listing MCP tools from server");
								const mcpTools = await mcp.listTools();
								console.debug(`Fetched ${mcpTools.tools.length} tools from MCP server '${tool.server_label}'`);

								// All tools are returned in Response object
								mcpListTools = {
									id: generateUniqueId("mcp_list_tools"),
									type: "mcp_list_tools",
									server_label: tool.server_label,
									tools: mcpTools.tools.map((mcpTool) => ({
										input_schema: mcpTool.inputSchema,
										name: mcpTool.name,
										annotations: mcpTool.annotations,
										description: mcpTool.description,
									})),
								};
							} catch (error) {
								console.error("Error listing tools from MCP server", error);
								mcpListTools = {
									id: generateUniqueId("mcp_list_tools"),
									type: "mcp_list_tools",
									server_label: tool.server_label,
									tools: [],
									error: `Failed to list tools from MCP server '${tool.server_label}': ${error instanceof Error ? error.message : "Unknown error"}`,
								};
							}
							output.push(mcpListTools);
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
											parameters: mcpTool.input_schema,
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
			})
		);
	}

	if (tools.length === 0) {
		tools = undefined;
	}

	const model = req.body.model.includes("@") ? req.body.model.split("@")[1] : req.body.model;
	const provider = req.body.model.includes("@") ? req.body.model.split("@")[0] : undefined;

	const payload: ChatCompletionInput = {
		// main params
		model: model,
		provider: provider,
		messages: messages,
		stream: req.body.stream,
		// options
		max_tokens: req.body.max_output_tokens === null ? undefined : req.body.max_output_tokens,
		response_format: req.body.text?.format
			? {
					type: req.body.text.format.type,
					json_schema:
						req.body.text.format.type === "json_schema"
							? {
									description: req.body.text.format.description,
									name: req.body.text.format.name,
									schema: req.body.text.format.schema,
									strict: req.body.text.format.strict,
								}
							: undefined,
				}
			: undefined,
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

	const responseObject: Omit<Response, "incomplete_details" | "output_text" | "parallel_tool_calls"> = {
		created_at: Math.floor(new Date().getTime() / 1000),
		error: null,
		id: generateUniqueId("resp"),
		instructions: req.body.instructions,
		max_output_tokens: req.body.max_output_tokens,
		metadata: req.body.metadata,
		model: req.body.model,
		object: "response",
		output,
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

	// MCP approval requests => do not call LLM at all
	if (Array.isArray(req.body.input)) {
		for (const item of req.body.input) {
			// Note: currently supporting only 1 mcp_approval_response per request
			if (item.type === "mcp_approval_response" && item.approve) {
				const approvalRequest = req.body.input.find(
					(i) => i.type === "mcp_approval_request" && i.id === item.approval_request_id
				) as McpApprovalRequestParams | undefined;
				console.log("approvalRequest", approvalRequest);
				if (approvalRequest) {
					const toolParams = mcpToolsMapping[approvalRequest.name];
					responseObject.output.push(
						await callMcpTool(toolParams, approvalRequest.name, toolParams.server_label, approvalRequest.arguments)
					);
					responseObject.status = "completed";
					res.json(responseObject);
					return;
				} else {
					responseObject.status = "failed";
					const errorMessage = `MCP approval response for approval request '${item.approval_request_id}' not found`;
					console.error(errorMessage);
					responseObject.error = {
						code: "server_error",
						message: errorMessage,
					};
					res.json(responseObject);
					return;
				}
			}
		}
	}

	// Streaming mode
	if (req.body.stream) {
		res.setHeader("Content-Type", "text/event-stream");
		res.setHeader("Connection", "keep-alive");
		let sequenceNumber = 0;

		// Emit events in sequence
		const emitEvent = (event: ResponseStreamEvent) => {
			res.write(`data: ${JSON.stringify(event)}\n\n`);
		};

		try {
			// Response created event
			emitEvent({
				type: "response.created",
				response: responseObject as Response,
				sequence_number: sequenceNumber++,
			});

			// Response in progress event
			emitEvent({
				type: "response.in_progress",
				response: responseObject as Response,
				sequence_number: sequenceNumber++,
			});

			const stream = client.chatCompletionStream(payload);
			let usage: ChatCompletionStreamOutputUsage | undefined;

			for await (const chunk of stream) {
				if (chunk.usage) {
					usage = chunk.usage;
				}

				if (chunk.choices[0].delta.content) {
					if (responseObject.output.length === 0) {
						const outputObject: ResponseOutputMessage = {
							id: generateUniqueId("msg"),
							type: "message",
							role: "assistant",
							status: "in_progress",
							content: [],
						};
						responseObject.output = [outputObject];

						// Response output item added event
						emitEvent({
							type: "response.output_item.added",
							output_index: 0,
							item: outputObject,
							sequence_number: sequenceNumber++,
						});
					}

					const outputObject = responseObject.output.at(-1);
					if (!outputObject || outputObject.type !== "message") {
						throw new StreamingError("Not implemented: only single output item type is supported in streaming mode.");
					}

					if (outputObject.content.length === 0) {
						// Response content part added event
						const contentPart: ResponseContentPartAddedEvent["part"] = {
							type: "output_text",
							text: "",
							annotations: [],
						};
						outputObject.content.push(contentPart);

						emitEvent({
							type: "response.content_part.added",
							item_id: outputObject.id,
							output_index: 0,
							content_index: 0,
							part: contentPart,
							sequence_number: sequenceNumber++,
						});
					}

					const contentPart = outputObject.content.at(-1);
					if (!contentPart || contentPart.type !== "output_text") {
						throw new StreamingError("Not implemented: only output_text is supported in streaming mode.");
					}

					// Add text delta
					contentPart.text += chunk.choices[0].delta.content;
					emitEvent({
						type: "response.output_text.delta",
						item_id: outputObject.id,
						output_index: 0,
						content_index: 0,
						delta: chunk.choices[0].delta.content,
						sequence_number: sequenceNumber++,
					});
				} else if (chunk.choices[0].delta.tool_calls && chunk.choices[0].delta.tool_calls.length > 0) {
					if (chunk.choices[0].delta.tool_calls.length > 1) {
						throw new StreamingError("Not implemented: only single tool call is supported in streaming mode.");
					}

					if (responseObject.output.length === 0) {
						if (!chunk.choices[0].delta.tool_calls[0].function.name) {
							throw new StreamingError("Tool call function name is required.");
						}

						const outputObject: ResponseFunctionToolCall = {
							type: "function_call",
							id: generateUniqueId("fc"),
							call_id: chunk.choices[0].delta.tool_calls[0].id,
							name: chunk.choices[0].delta.tool_calls[0].function.name,
							arguments: "",
						};
						responseObject.output = [outputObject];

						// Response output item added event
						emitEvent({
							type: "response.output_item.added",
							output_index: 0,
							item: outputObject,
							sequence_number: sequenceNumber++,
						});
					}

					const outputObject = responseObject.output.at(-1);
					if (!outputObject || !outputObject.id || outputObject.type !== "function_call") {
						throw new StreamingError("Not implemented: can only support single output item type in streaming mode.");
					}

					outputObject.arguments += chunk.choices[0].delta.tool_calls[0].function.arguments;
					emitEvent({
						type: "response.function_call_arguments.delta",
						item_id: outputObject.id,
						output_index: 0,
						delta: chunk.choices[0].delta.tool_calls[0].function.arguments,
						sequence_number: sequenceNumber++,
					});
				}
			}

			const lastOutputItem = responseObject.output.at(-1);

			if (lastOutputItem) {
				if (lastOutputItem?.type === "message") {
					const contentPart = lastOutputItem.content.at(-1);
					if (contentPart?.type === "output_text") {
						emitEvent({
							type: "response.output_text.done",
							item_id: lastOutputItem.id,
							output_index: responseObject.output.length - 1,
							content_index: lastOutputItem.content.length - 1,
							text: contentPart.text,
							sequence_number: sequenceNumber++,
						});

						emitEvent({
							type: "response.content_part.done",
							item_id: lastOutputItem.id,
							output_index: responseObject.output.length - 1,
							content_index: lastOutputItem.content.length - 1,
							part: contentPart,
							sequence_number: sequenceNumber++,
						});
					} else {
						throw new StreamingError("Not implemented: only output_text is supported in streaming mode.");
					}

					// Response output item done event
					lastOutputItem.status = "completed";
					emitEvent({
						type: "response.output_item.done",
						output_index: responseObject.output.length - 1,
						item: lastOutputItem,
						sequence_number: sequenceNumber++,
					});
				} else if (lastOutputItem?.type === "function_call") {
					if (!lastOutputItem.id) {
						throw new StreamingError("Function call id is required.");
					}

					emitEvent({
						type: "response.function_call_arguments.done",
						item_id: lastOutputItem.id,
						output_index: responseObject.output.length - 1,
						arguments: lastOutputItem.arguments,
						sequence_number: sequenceNumber++,
					});

					lastOutputItem.status = "completed";
					emitEvent({
						type: "response.output_item.done",
						output_index: responseObject.output.length - 1,
						item: lastOutputItem,
						sequence_number: sequenceNumber++,
					});
				} else {
					throw new StreamingError("Not implemented: only message output is supported in streaming mode.");
				}
			}

			// Response completed event
			responseObject.status = "completed";
			if (usage) {
				responseObject.usage = {
					input_tokens: usage.prompt_tokens,
					input_tokens_details: { cached_tokens: 0 },
					output_tokens: usage.completion_tokens,
					output_tokens_details: { reasoning_tokens: 0 },
					total_tokens: usage.total_tokens,
				};
			}
			emitEvent({
				type: "response.completed",
				response: responseObject as Response,
				sequence_number: sequenceNumber++,
			});
		} catch (streamError) {
			console.error("Error in streaming chat completion:", streamError);

			let message = "An error occurred while streaming from inference server.";
			if (streamError instanceof StreamingError) {
				message = streamError.message;
			} else if (
				typeof streamError === "object" &&
				streamError &&
				"message" in streamError &&
				typeof streamError.message === "string"
			) {
				message = streamError.message;
			}
			responseObject.status = "failed";
			responseObject.error = {
				code: "server_error",
				message,
			};
			emitEvent({
				type: "response.failed",
				response: responseObject as Response,
				sequence_number: sequenceNumber++,
			});
		}
		res.end();
		return;
	}

	try {
		const chatCompletionResponse = await client.chatCompletion(payload);

		responseObject.status = "completed";
		for (const choice of chatCompletionResponse.choices) {
			if (choice.message.content) {
				responseObject.output.push({
					id: generateUniqueId("msg"),
					type: "message",
					role: "assistant",
					status: "completed",
					content: [
						{
							type: "output_text",
							text: choice.message.content,
							annotations: [],
						},
					],
				});
			}
			if (choice.message.tool_calls) {
				for (const toolCall of choice.message.tool_calls) {
					if (toolCall.function.name in mcpToolsMapping) {
						const toolParams = mcpToolsMapping[toolCall.function.name];

						// Check if approval is required
						const approvalRequired =
							toolParams.require_approval === "always"
								? true
								: toolParams.require_approval === "never"
									? false
									: toolParams.require_approval.always?.tool_names?.includes(toolCall.function.name)
										? true
										: toolParams.require_approval.never?.tool_names?.includes(toolCall.function.name)
											? false
											: true; // behavior is undefined in specs, let's default to

						if (approvalRequired) {
							// TODO: Implement approval logic
							console.log(`Requesting approval for MCP tool '${toolCall.function.name}'`);
							responseObject.output.push({
								type: "mcp_approval_request",
								id: generateUniqueId("mcp_approval_request"),
								name: toolCall.function.name,
								server_label: toolParams.server_label,
								arguments: toolCall.function.arguments,
							});
						} else {
							responseObject.output.push(
								await callMcpTool(
									toolParams,
									toolCall.function.name,
									toolParams.server_label,
									toolCall.function.arguments
								)
							);
						}
					} else {
						responseObject.output.push({
							type: "function_call",
							id: generateUniqueId("fc"),
							call_id: toolCall.id,
							name: toolCall.function.name,
							arguments: toolCall.function.arguments,
							status: "completed",
						});
					}
				}
			}
		}

		responseObject.usage = {
			input_tokens: chatCompletionResponse.usage.prompt_tokens,
			input_tokens_details: { cached_tokens: 0 },
			output_tokens: chatCompletionResponse.usage.completion_tokens,
			output_tokens_details: { reasoning_tokens: 0 },
			total_tokens: chatCompletionResponse.usage.total_tokens,
		};

		res.json(responseObject);
	} catch (error) {
		console.error(error);
		res.status(500).json({
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		});
	}
};
