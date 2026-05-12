import type { CreateResponseParams } from "../../schemas.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import type { Logger } from "pino";

// Mirror the openai-node `ChatCompletionMessageToolCall` shape locally
// to keep this module's imports stable across minor openai-node
// releases (the type's name and exact location have drifted between
// versions).
interface ToolCallParam {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

/**
 * Pending assistant message buffer used while walking the input items.
 *
 * In the Responses API input, an assistant turn that calls tools is
 * represented as a sequence:
 *
 *     {type: "message", role: "assistant", content: ...}   ← optional, when the model produced text
 *     {type: "function_call", call_id, name, arguments}    ← one or more, possibly parallel
 *     {type: "function_call_output", call_id, output}      ← one matching output per call
 *
 * In the OpenAI chat-completions request format that we forward
 * downstream, that turn must be encoded as a SINGLE assistant message
 * carrying both the text content AND the tool_calls[] array:
 *
 *     {role: "assistant", content?: "...", tool_calls: [{id, type: "function", function: {name, arguments}}]}
 *     {role: "tool", content: "<output>", tool_call_id}     ← one per call
 *
 * We buffer the assistant message while consuming following
 * function_call items (which contribute to its tool_calls[]), and
 * flush it when we hit anything that ends the assistant turn
 * (function_call_output, user/system message, or end of input).
 */
type AssistantContent = string | Array<{ type: "text"; text: string }> | null;

interface PendingAssistant {
	content: AssistantContent;
	toolCalls: ToolCallParam[];
}

function makePendingAssistant(content: AssistantContent): PendingAssistant {
	return { content, toolCalls: [] };
}

function flushPendingAssistant(pending: PendingAssistant | null, messages: ChatCompletionMessageParam[]): null {
	if (pending === null) {
		return null;
	}
	const hasContent =
		(typeof pending.content === "string" && pending.content.length > 0) ||
		(Array.isArray(pending.content) && pending.content.length > 0);
	const hasToolCalls = pending.toolCalls.length > 0;
	if (!hasContent && !hasToolCalls) {
		// Nothing to emit. (Empty assistant content with no tool_calls
		// would be a malformed message — drop silently to match the
		// pre-rewrite filter behavior.)
		return null;
	}
	const message = {
		role: "assistant" as const,
		// `content: null` is the canonical way to indicate "no text,
		// only tool_calls" in OpenAI's chat-completions schema.
		content: hasContent ? pending.content : null,
		...(hasToolCalls ? { tool_calls: pending.toolCalls } : {}),
	};
	messages.push(message as ChatCompletionMessageParam);
	return null;
}

// Loose type — TS cannot narrow the message-item content shape through
// the discriminated union we're walking, so we type the helper input
// loosely and let the caller cast on emission.
type MessageContent = string | Array<Record<string, unknown>> | null | undefined;

function formatUserOrSystemContent(
	content: MessageContent,
	log?: Logger
): ChatCompletionMessageParam["content"] | undefined {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return undefined;
	}
	const parts = content
		.map((part) => {
			const partType = part.type as string | undefined;
			switch (partType) {
				case "input_image":
					return {
						type: "image_url" as const,
						image_url: { url: part.image_url as string },
					};
				case "output_text":
					return (part.text as string | undefined) ? { type: "text" as const, text: part.text as string } : undefined;
				case "refusal":
					return undefined;
				case "input_text":
					return { type: "text" as const, text: part.text as string };
				default:
					log?.warn({ content_type: partType }, "Unknown content type dropped during message formatting");
					return undefined;
			}
		})
		.filter((part): part is NonNullable<typeof part> => part !== undefined);
	if (parts.length === 0) {
		return undefined;
	}
	if (parts.length === 1 && parts[0].type === "text") {
		return parts[0].text;
	}
	return parts as ChatCompletionMessageParam["content"];
}

function formatAssistantContent(content: MessageContent, log?: Logger): AssistantContent {
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return null;
	}
	const parts: Array<{ type: "text"; text: string }> = [];
	for (const part of content) {
		const partType = part.type as string | undefined;
		switch (partType) {
			case "output_text": {
				const text = part.text as string | undefined;
				if (text) {
					parts.push({ type: "text", text });
				}
				break;
			}
			case "refusal":
				// Drop refusals from the assistant content — matches the
				// pre-rewrite behavior.
				break;
			case "input_text": {
				// Unexpected on an assistant message, but the original
				// implementation accepted it. Preserve that.
				parts.push({ type: "text", text: part.text as string });
				break;
			}
			default:
				log?.warn({ content_type: partType }, "Unknown content type dropped during assistant message formatting");
		}
	}
	if (parts.length === 0) {
		return null;
	}
	if (parts.length === 1) {
		return parts[0].text;
	}
	return parts;
}

export function formatInputToMessages(
	input: CreateResponseParams["input"],
	instructions: string | null,
	log?: Logger
): ChatCompletionMessageParam[] {
	const messages: ChatCompletionMessageParam[] = instructions ? [{ role: "system", content: instructions }] : [];

	if (!Array.isArray(input)) {
		messages.push({ role: "user", content: input } as const);
		return messages;
	}

	let pending: PendingAssistant | null = null;

	for (const item of input) {
		switch (item.type) {
			case "function_call": {
				// Attach the call to the pending assistant message's
				// tool_calls[] array, creating a new pending assistant
				// (with no text content) when none exists yet.
				if (pending === null) {
					pending = makePendingAssistant(null);
				}
				pending.toolCalls.push({
					id: item.call_id,
					type: "function",
					function: {
						name: item.name,
						arguments: item.arguments,
					},
				});
				break;
			}
			case "function_call_output": {
				// The tool result ends the assistant turn — flush any
				// pending assistant first so it (and its tool_calls)
				// appear before the matching tool result message.
				pending = flushPendingAssistant(pending, messages);
				messages.push({
					role: "tool",
					content: item.output,
					tool_call_id: item.call_id,
				});
				break;
			}
			case "message":
			case undefined: {
				const role = (item as { role?: string }).role;
				const rawContent = (item as { content?: MessageContent }).content;
				if (role === "assistant") {
					// A new assistant message starts a new pending
					// assistant. Flush any prior pending first (it
					// belonged to a previous turn).
					pending = flushPendingAssistant(pending, messages);
					const content = formatAssistantContent(rawContent, log);
					if (content === null) {
						break;
					}
					pending = makePendingAssistant(content);
				} else if (role === "user" || role === "system") {
					// User / system messages do NOT belong to the
					// assistant turn — flush any pending assistant
					// first, then emit the message directly.
					pending = flushPendingAssistant(pending, messages);
					const content = formatUserOrSystemContent(rawContent, log);
					if (content === undefined) {
						break;
					}
					messages.push({ role, content } as ChatCompletionMessageParam);
				}
				break;
			}
			case "mcp_list_tools": {
				pending = flushPendingAssistant(pending, messages);
				messages.push({
					role: "tool",
					content: `MCP list tools. Server: '${item.server_label}'.`,
					tool_call_id: "mcp_list_tools",
				});
				break;
			}
			case "mcp_call": {
				pending = flushPendingAssistant(pending, messages);
				messages.push({
					role: "tool",
					content: `MCP call (${item.id}). Server: '${item.server_label}'. Tool: '${item.name}'. Arguments: '${item.arguments}'.`,
					tool_call_id: "mcp_call",
				});
				break;
			}
			case "mcp_approval_request": {
				pending = flushPendingAssistant(pending, messages);
				messages.push({
					role: "tool",
					content: `MCP approval request (${item.id}). Server: '${item.server_label}'. Tool: '${item.name}'. Arguments: '${item.arguments}'.`,
					tool_call_id: "mcp_approval_request",
				});
				break;
			}
			case "mcp_approval_response": {
				pending = flushPendingAssistant(pending, messages);
				messages.push({
					role: "tool",
					content: `MCP approval response (${item.id}). Approved: ${item.approve}. Reason: ${item.reason}.`,
					tool_call_id: "mcp_approval_response",
				});
				break;
			}
		}
	}

	flushPendingAssistant(pending, messages);
	return messages;
}
