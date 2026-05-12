import { describe, it, expect } from "vitest";
import { formatInputToMessages } from "./messageFormatting.js";

describe("formatInputToMessages", () => {
	it("converts a string input to a user message", () => {
		const result = formatInputToMessages("Hello world", null);
		expect(result).toEqual([{ role: "user", content: "Hello world" }]);
	});

	it("prepends system message when instructions are provided", () => {
		const result = formatInputToMessages("Hi", "You are helpful");
		expect(result).toEqual([
			{ role: "system", content: "You are helpful" },
			{ role: "user", content: "Hi" },
		]);
	});

	it("does not prepend system message when instructions are null", () => {
		const result = formatInputToMessages("Hi", null);
		expect(result).toEqual([{ role: "user", content: "Hi" }]);
	});

	it("maps message items with string content", () => {
		const result = formatInputToMessages(
			[
				{ type: "message" as const, role: "user" as const, content: "Hello" },
				{ type: "message" as const, role: "assistant" as const, content: "Hi there" },
			],
			null
		);
		expect(result).toEqual([
			{ role: "user", content: "Hello" },
			{ role: "assistant", content: "Hi there" },
		]);
	});

	it("maps input_text content to text type", () => {
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "user" as const,
					content: [{ type: "input_text" as const, text: "Hello" }],
				},
			],
			null
		);
		// Single text part is flattened to a string
		expect(result).toEqual([{ role: "user", content: "Hello" }]);
	});

	it("maps input_image to image_url type", () => {
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "user" as const,
					content: [
						{ type: "input_text" as const, text: "Look at this" },
						{ type: "input_image" as const, image_url: "https://example.com/img.png" },
					],
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "user",
				content: [
					{ type: "text", text: "Look at this" },
					{ type: "image_url", image_url: { url: "https://example.com/img.png" } },
				],
			},
		]);
	});

	it("flattens single text content part to string", () => {
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "user" as const,
					content: [{ type: "input_text" as const, text: "Single" }],
				},
			],
			null
		);
		expect(result).toEqual([{ role: "user", content: "Single" }]);
	});

	it("filters out refusal content parts", () => {
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "assistant" as const,
					content: [
						{ type: "output_text" as const, text: "Hello" },
						{ type: "refusal" as const, refusal: "I can't" },
					],
					status: "completed" as const,
				},
			],
			null
		);
		expect(result).toEqual([{ role: "assistant", content: "Hello" }]);
	});

	it("filters out output_text with empty text", () => {
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "assistant" as const,
					content: [{ type: "output_text" as const, text: "" }],
					status: "completed" as const,
				},
			],
			null
		);
		// empty content array → filtered out
		expect(result).toEqual([]);
	});

	it("maps a standalone function_call to an assistant message with tool_calls", () => {
		// Per OpenAI chat-completions spec, a tool call belongs inside the
		// emitting assistant message's tool_calls[] array. When the input
		// item arrives with no preceding assistant message, we synthesize
		// one with content: null.
		const result = formatInputToMessages(
			[
				{
					type: "function_call" as const,
					call_id: "call_123",
					name: "get_weather",
					arguments: '{"city":"Paris"}',
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "call_123",
						type: "function",
						function: {
							name: "get_weather",
							arguments: '{"city":"Paris"}',
						},
					},
				],
			},
		]);
	});

	it("attaches a function_call to the immediately-preceding assistant message", () => {
		// Real chained conversations always pair an assistant text turn
		// with the tool calls that turn produced. Both must end up on a
		// SINGLE chat-completions assistant message.
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "assistant" as const,
					content: "Let me check the weather.",
				},
				{
					type: "function_call" as const,
					call_id: "call_123",
					name: "get_weather",
					arguments: '{"city":"Paris"}',
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "assistant",
				content: "Let me check the weather.",
				tool_calls: [
					{
						id: "call_123",
						type: "function",
						function: {
							name: "get_weather",
							arguments: '{"city":"Paris"}',
						},
					},
				],
			},
		]);
	});

	it("aggregates parallel function_calls into a single assistant message", () => {
		// The model can emit multiple tool calls in parallel within one
		// turn. All of them belong on the same assistant message's
		// tool_calls[] array.
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "assistant" as const,
					content: "Checking two cities.",
				},
				{
					type: "function_call" as const,
					call_id: "call_a",
					name: "get_weather",
					arguments: '{"city":"Paris"}',
				},
				{
					type: "function_call" as const,
					call_id: "call_b",
					name: "get_weather",
					arguments: '{"city":"Berlin"}',
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "assistant",
				content: "Checking two cities.",
				tool_calls: [
					{
						id: "call_a",
						type: "function",
						function: { name: "get_weather", arguments: '{"city":"Paris"}' },
					},
					{
						id: "call_b",
						type: "function",
						function: { name: "get_weather", arguments: '{"city":"Berlin"}' },
					},
				],
			},
		]);
	});

	it("maps function_call_output to tool message", () => {
		const result = formatInputToMessages(
			[
				{
					type: "function_call_output" as const,
					call_id: "call_123",
					output: "Sunny, 25C",
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "tool",
				content: "Sunny, 25C",
				tool_call_id: "call_123",
			},
		]);
	});

	it("emits a full chained tool round in the correct order", () => {
		// The smoking-gun shape from a real chained conversation:
		//   user -> assistant text -> function_call -> function_call_output -> assistant text
		// The whole assistant-text + function_call portion must collapse
		// into a single assistant message that precedes the tool result.
		const result = formatInputToMessages(
			[
				{ type: "message" as const, role: "user" as const, content: "What's the weather in Paris?" },
				{
					type: "message" as const,
					role: "assistant" as const,
					content: "Let me check.",
				},
				{
					type: "function_call" as const,
					call_id: "call_123",
					name: "get_weather",
					arguments: '{"city":"Paris"}',
				},
				{
					type: "function_call_output" as const,
					call_id: "call_123",
					output: "Sunny, 25C",
				},
				{
					type: "message" as const,
					role: "assistant" as const,
					content: "It's sunny and 25C in Paris.",
				},
			],
			null
		);
		expect(result).toEqual([
			{ role: "user", content: "What's the weather in Paris?" },
			{
				role: "assistant",
				content: "Let me check.",
				tool_calls: [
					{
						id: "call_123",
						type: "function",
						function: { name: "get_weather", arguments: '{"city":"Paris"}' },
					},
				],
			},
			{ role: "tool", content: "Sunny, 25C", tool_call_id: "call_123" },
			{ role: "assistant", content: "It's sunny and 25C in Paris." },
		]);
	});

	it("synthesizes an assistant message when function_call has no preceding assistant text", () => {
		// First-turn case: the user asked something, the assistant
		// jumped straight to a tool call without emitting visible text.
		const result = formatInputToMessages(
			[
				{ type: "message" as const, role: "user" as const, content: "ping" },
				{
					type: "function_call" as const,
					call_id: "call_1",
					name: "ping_server",
					arguments: "{}",
				},
				{
					type: "function_call_output" as const,
					call_id: "call_1",
					output: "pong",
				},
			],
			null
		);
		expect(result).toEqual([
			{ role: "user", content: "ping" },
			{
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "call_1",
						type: "function",
						function: { name: "ping_server", arguments: "{}" },
					},
				],
			},
			{ role: "tool", content: "pong", tool_call_id: "call_1" },
		]);
	});

	it("flushes a pending assistant before a new user message", () => {
		// If an assistant message arrives but no function_call or
		// function_call_output follows before a new user turn, the
		// assistant message must still be emitted.
		const result = formatInputToMessages(
			[
				{ type: "message" as const, role: "user" as const, content: "hello" },
				{ type: "message" as const, role: "assistant" as const, content: "hi" },
				{ type: "message" as const, role: "user" as const, content: "bye" },
			],
			null
		);
		expect(result).toEqual([
			{ role: "user", content: "hello" },
			{ role: "assistant", content: "hi" },
			{ role: "user", content: "bye" },
		]);
	});

	it("preserves an assistant message with empty-string content", () => {
		// Regression: the pre-rewrite filter at the bottom of
		// formatInputToMessages accepted any string content via
		// `typeof message.content === "string"`, including "". Pin
		// that behavior so the rewrite does not silently drop empty
		// assistant messages.
		const result = formatInputToMessages(
			[
				{ type: "message" as const, role: "user" as const, content: "hi" },
				{ type: "message" as const, role: "assistant" as const, content: "" },
				{ type: "message" as const, role: "user" as const, content: "bye" },
			],
			null
		);
		expect(result).toEqual([
			{ role: "user", content: "hi" },
			{ role: "assistant", content: "" },
			{ role: "user", content: "bye" },
		]);
	});

	it("preserves input_image parts on assistant messages", () => {
		// Regression: the pre-rewrite implementation was role-agnostic
		// and mapped input_image → image_url for all roles, including
		// assistant. The zod input schema permits this combination.
		// Pin the pass-through behavior; the downstream chat-completions
		// backend can reject if it must.
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "assistant" as const,
					content: [
						{ type: "input_text" as const, text: "see this" },
						{ type: "input_image" as const, image_url: "https://example.com/img.png" },
					],
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "assistant",
				content: [
					{ type: "text", text: "see this" },
					{ type: "image_url", image_url: { url: "https://example.com/img.png" } },
				],
			},
		]);
	});

	it("maps mcp_call to tool message", () => {
		const result = formatInputToMessages(
			[
				{
					type: "mcp_call" as const,
					id: "mcp_123",
					name: "tool1",
					server_label: "server1",
					arguments: '{"a":1}',
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "tool",
				content: "MCP call (mcp_123). Server: 'server1'. Tool: 'tool1'. Arguments: '{\"a\":1}'.",
				tool_call_id: "mcp_call",
			},
		]);
	});

	it("maps mcp_approval_request to tool message", () => {
		const result = formatInputToMessages(
			[
				{
					type: "mcp_approval_request" as const,
					id: "mcpr_123",
					name: "tool1",
					server_label: "server1",
					arguments: "{}",
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "tool",
				content: "MCP approval request (mcpr_123). Server: 'server1'. Tool: 'tool1'. Arguments: '{}'.",
				tool_call_id: "mcp_approval_request",
			},
		]);
	});

	it("maps mcp_approval_response to tool message", () => {
		const result = formatInputToMessages(
			[
				{
					type: "mcp_approval_response" as const,
					id: "resp_123",
					approval_request_id: "mcpr_123",
					approve: true,
					reason: null,
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "tool",
				content: "MCP approval response (resp_123). Approved: true. Reason: null.",
				tool_call_id: "mcp_approval_response",
			},
		]);
	});

	it("maps mcp_list_tools to tool message with interpolated server_label", () => {
		const result = formatInputToMessages(
			[
				{
					type: "mcp_list_tools" as const,
					id: "mcp_lt_123",
					server_label: "my-server",
					tools: [],
				},
			],
			null
		);
		expect(result).toEqual([
			{
				role: "tool",
				content: "MCP list tools. Server: 'my-server'.",
				tool_call_id: "mcp_list_tools",
			},
		]);
	});

	it("filters undefined messages from developer role", () => {
		const result = formatInputToMessages(
			[
				{
					type: "message" as const,
					role: "developer" as const,
					content: [{ type: "input_text" as const, text: "dev instructions" }],
					status: null,
				},
			],
			null
		);
		// developer role is not in the accepted list (assistant, user, system), returns undefined and is filtered
		expect(result).toEqual([]);
	});
});
