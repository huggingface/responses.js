import { strict as assert } from "assert";
import { convertInputToMessages } from "../dist/messages.js";
import { createResponseParamsSchema } from "../dist/schemas.js";

describe("tool history", function () {
	it("replays reasoning and the tool call as one assistant message", function () {
		const messages = convertInputToMessages([
			{ role: "user", content: "Read the file." },
			{ type: "reasoning", content: [{ type: "reasoning_text", text: "I should read the file first." }] },
			{ type: "function_call", call_id: "call_1", name: "read_file", arguments: '{"path":"README.md"}' },
			{ type: "function_call_output", call_id: "call_1", output: "file contents" },
		]);

		assert.deepEqual(messages, [
			{ role: "user", content: "Read the file." },
			{
				role: "assistant",
				reasoning_content: "I should read the file first.",
				tool_calls: [
					{ id: "call_1", type: "function", function: { name: "read_file", arguments: '{"path":"README.md"}' } },
				],
			},
			{ role: "tool", content: "file contents", tool_call_id: "call_1" },
		]);
	});

	it("merges parallel tool calls into a single assistant message", function () {
		const messages = convertInputToMessages([
			{ role: "user", content: "Read both files." },
			{ type: "reasoning", content: [{ type: "reasoning_text", text: "Read them in parallel." }] },
			{ type: "function_call", call_id: "call_1", name: "read_file", arguments: '{"path":"a"}' },
			{ type: "function_call", call_id: "call_2", name: "read_file", arguments: '{"path":"b"}' },
			{ type: "function_call_output", call_id: "call_1", output: "a contents" },
			{ type: "function_call_output", call_id: "call_2", output: "b contents" },
		]);

		assert.deepEqual(messages, [
			{ role: "user", content: "Read both files." },
			{
				role: "assistant",
				reasoning_content: "Read them in parallel.",
				tool_calls: [
					{ id: "call_1", type: "function", function: { name: "read_file", arguments: '{"path":"a"}' } },
					{ id: "call_2", type: "function", function: { name: "read_file", arguments: '{"path":"b"}' } },
				],
			},
			{ role: "tool", content: "a contents", tool_call_id: "call_1" },
			{ role: "tool", content: "b contents", tool_call_id: "call_2" },
		]);
	});

	it("accepts summary-only reasoning items and replays the summary", function () {
		// The Responses API returns `summary` instead of `content` when reasoning is summarized,
		// so neither field can be required.
		const parsed = createResponseParamsSchema.parse({
			model: "some-model",
			input: [
				{ role: "user", content: "Read the file." },
				{ type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Reading the file." }] },
				{ type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" },
			],
		});

		assert.deepEqual(convertInputToMessages(parsed.input), [
			{ role: "user", content: "Read the file." },
			{
				role: "assistant",
				reasoning_content: "Reading the file.",
				tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: "{}" } }],
			},
		]);
	});

	it("drops reasoning items that carry no text", function () {
		const messages = convertInputToMessages([
			{ role: "user", content: "Hi." },
			{ type: "reasoning", id: "rs_1", content: [], summary: [] },
			{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello!" }] },
		]);

		assert.deepEqual(messages, [
			{ role: "user", content: "Hi." },
			{ role: "assistant", content: "Hello!" },
		]);
	});
});
