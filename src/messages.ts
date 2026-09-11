import type {
	ChatCompletionAssistantMessageParam,
	ChatCompletionMessageParam,
} from "openai/resources/chat/completions.js";
import type { CreateResponseParams } from "./schemas.js";

export type ChatMessage =
	| Exclude<ChatCompletionMessageParam, { role: "assistant" }>
	| (ChatCompletionAssistantMessageParam & { reasoning_content?: string });

/*
 * Convert Responses API input items to Chat Completion messages.
 * Consecutive assistant items (reasoning, text, tool calls) are merged into one message.
 */
export function convertInputToMessages(
	input: CreateResponseParams["input"],
	instructions?: string | null
): ChatMessage[] {
	const messages: ChatMessage[] = instructions ? [{ role: "system", content: instructions }] : [];
	if (Array.isArray(input)) {
		const convertedMessages = input
			.map((item) => {
				switch (item.type) {
					case "reasoning": {
						// Prefer the verbatim reasoning, fall back to the summary when that is all the client replays.
						const parts = item.content?.length ? item.content : (item.summary ?? []);
						const reasoningContent = parts.map((part) => part.text).join("");
						return reasoningContent
							? {
									role: "assistant" as const,
									content: [],
									reasoning_content: reasoningContent,
								}
							: undefined;
					}
					case "function_call":
						return {
							role: "assistant" as const,
							content: [],
							tool_calls: [
								{
									id: item.call_id,
									type: "function" as const,
									function: { name: item.name, arguments: item.arguments },
								},
							],
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
					("reasoning_content" in message ||
						"tool_calls" in message ||
						typeof message.content === "string" ||
						(Array.isArray(message.content) && message.content.length !== 0))
			);
		for (const message of convertedMessages) {
			const previous = messages.at(-1);
			if (message.role === "assistant" && previous?.role === "assistant") {
				previous.content = [
					...(typeof previous.content === "string"
						? [{ type: "text" as const, text: previous.content }]
						: (previous.content ?? [])),
					...(typeof message.content === "string"
						? [{ type: "text" as const, text: message.content }]
						: (message.content ?? [])),
				];
				if ("reasoning_content" in message)
					previous.reasoning_content = (previous.reasoning_content ?? "") + message.reasoning_content;
				if ("tool_calls" in message && message.tool_calls)
					previous.tool_calls = [...(previous.tool_calls ?? []), ...message.tool_calls];
			} else {
				messages.push(message);
			}
		}
	} else {
		messages.push({ role: "user", content: input } as const);
	}
	for (const message of messages) {
		if (!Array.isArray(message.content)) {
			continue;
		}
		if (message.role === "assistant" && message.content.length === 0) {
			delete message.content;
		} else if (message.content.length === 1 && message.content[0].type === "text") {
			message.content = message.content[0].text;
		}
	}
	return messages;
}
