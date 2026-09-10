import { strict as assert } from "assert";
import { convertInputToMessages } from "../dist/messages.js";

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
});
