import { strict as assert } from "assert";
import { once } from "node:events";
import { createApp } from "../dist/server.js";
import { convertInputToMessages } from "../dist/messages.js";
import { createResponseParamsSchema } from "../dist/schemas.js";

describe("tool history", function () {
	for (const reasoningField of [undefined, "reasoning_content", "reasoning"]) {
		it(`replays reasoning and tool calls with ${reasoningField ?? "the default field"}`, function () {
			const input = [
				{ role: "user", content: "Read the file." },
				{ type: "reasoning", content: [{ type: "reasoning_text", text: "I should " }] },
				{ type: "reasoning", content: [{ type: "reasoning_text", text: "read the file first." }] },
				{ type: "function_call", call_id: "call_1", name: "read_file", arguments: '{"path":"README.md"}' },
				{ type: "function_call_output", call_id: "call_1", output: "file contents" },
			];
			const original = globalThis.structuredClone(input);
			const messages = convertInputToMessages(input, undefined, reasoningField);

			assert.deepEqual(messages, [
				{ role: "user", content: "Read the file." },
				{
					role: "assistant",
					[reasoningField ?? "reasoning_content"]: "I should read the file first.",
					tool_calls: [
						{ id: "call_1", type: "function", function: { name: "read_file", arguments: '{"path":"README.md"}' } },
					],
				},
				{ role: "tool", content: "file contents", tool_call_id: "call_1" },
			]);
			assert.deepEqual(input, original);
		});
	}

	it("uses Groq's reasoning field only on an explicit HF Groq route", async function () {
		const originalFetch = globalThis.fetch;
		const originalBaseUrl = process.env.OPENAI_BASE_URL;
		const server = createApp().listen(0, "127.0.0.1");
		await once(server, "listening");
		try {
			for (const [baseUrl, model, field] of [
				[undefined, "openai/gpt-oss-20b:groq", "reasoning"],
				["https://router.huggingface.co/v1/", "openai/gpt-oss-120b:groq", "reasoning"],
				[undefined, "openai/gpt-oss-20b", "reasoning_content"],
				[undefined, "some-model:novita", "reasoning_content"],
				["https://other.example/v1", "some-model:groq", "reasoning_content"],
			]) {
				if (baseUrl === undefined) delete process.env.OPENAI_BASE_URL;
				else process.env.OPENAI_BASE_URL = baseUrl;
				let sent;
				globalThis.fetch = async (input, init) => {
					sent = await new globalThis.Request(input, init).json();
					return new globalThis.Response(
						`data: ${JSON.stringify({ choices: [{ delta: { content: "Done." }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
						{ headers: { "Content-Type": "text/event-stream" } }
					);
				};
				const response = await originalFetch(`http://127.0.0.1:${server.address().port}/v1/responses`, {
					method: "POST",
					headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
					body: JSON.stringify({
						model,
						input: [
							{ type: "reasoning", content: [{ type: "reasoning_text", text: "Remember this." }] },
							{ type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" },
							{ type: "function_call_output", call_id: "call_1", output: "file contents" },
						],
					}),
				});
				assert.equal((await response.json()).status, "completed");
				assert.equal(sent.messages[0][field], "Remember this.");
				assert.equal(sent.messages[0][field === "reasoning" ? "reasoning_content" : "reasoning"], undefined);
			}
		} finally {
			globalThis.fetch = originalFetch;
			if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL;
			else process.env.OPENAI_BASE_URL = originalBaseUrl;
			await new Promise((resolve) => server.close(resolve));
		}
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
