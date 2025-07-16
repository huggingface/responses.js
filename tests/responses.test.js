import OpenAI from "openai";
import { strict as assert } from "assert";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

describe("responses.js", function () {
	let openai;

	// Check if server is running before all tests
	before(async function () {
		try {
			const response = await fetch("http://localhost:3000/");
			if (response.status !== 200) {
				throw new Error(`Server returned status ${response.status}`);
			}
		} catch (error) {
			console.error("❌ Server is not running. Please start the server with 'pnpm dev' before running the tests.");
			throw error;
		}

		openai = new OpenAI({
			baseURL: "http://localhost:3000/v1",
			apiKey: process.env.HF_TOKEN,
		});
	});

	it("text input, text output", async function () {
		const response = await openai.responses.create({
			model: "Qwen/Qwen2.5-VL-7B-Instruct",
			instructions: "You are a helpful assistant.",
			input: "Tell me a three sentence bedtime story about a unicorn.",
		});
		assert.equal(typeof response.output_text, "string");
		assert.ok(response.output_text.length > 0);
	});

	it("text+image input, text output", async function () {
		const response = await openai.responses.create({
			model: "meta-llama/Llama-4-Scout-17B-16E-Instruct:groq",
			input: [
				{
					role: "user",
					content: [
						{ type: "input_text", text: "what is in this image?" },
						{
							type: "input_image",
							image_url:
								"https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg",
						},
					],
				},
			],
		});
		assert.equal(typeof response.output_text, "string");
		assert.ok(response.output_text.length > 0);
	});

	it("multi-turn conversation, text output", async function () {
		const response = await openai.responses.create({
			model: "Qwen/Qwen2.5-VL-7B-Instruct",
			input: [
				{
					role: "developer",
					content: "Talk like a pirate.",
				},
				{
					role: "user",
					content: "Are semicolons optional in JavaScript?",
				},
			],
		});
		assert.equal(typeof response.output_text, "string");
		assert.ok(response.output_text.length > 0);
	});

	it("function calling", async function () {
		const tools = [
			{
				type: "function",
				name: "get_current_weather",
				description: "Get the current weather in a given location",
				parameters: {
					type: "object",
					properties: {
						location: {
							type: "string",
							description: "The city and state, e.g. San Francisco, CA",
						},
						unit: { type: "string", enum: ["celsius", "fahrenheit"] },
					},
					required: ["location", "unit"],
				},
			},
		];

		const response = await openai.responses.create({
			model: "meta-llama/Llama-3.3-70B-Instruct:cerebras",
			tools: tools,
			input: "What is the weather like in Boston today?",
			tool_choice: "auto",
		});

		assert.ok(Array.isArray(response.output));
		assert.equal(response.output.length, 1);
		assert.equal(response.output[0].type, "function_call");
		assert.equal(response.output[0].status, "completed");
		assert.equal(response.output[0].name, "get_current_weather");
	});

	it("structured output", async function () {
		const CalendarEvent = z.object({
			name: z.string(),
			date: z.string(),
			participants: z.array(z.string()),
		});
		const response = await openai.responses.parse({
			model: "meta-llama/Meta-Llama-3-70B-Instruct:novita",
			instructions: "Extract the event information.",
			input: "Alice and Bob are going to a science fair on Friday.",
			text: {
				format: zodTextFormat(CalendarEvent, "calendar_event"),
			},
		});

		assert.ok(response.output_parsed);
		assert.equal(typeof response.output_parsed, "object");
		assert.equal(typeof response.output_parsed.name, "string");
		assert.equal(typeof response.output_parsed.date, "string");
		assert.ok(Array.isArray(response.output_parsed.participants));
	});

	it("streaming response", async function () {
		const stream = await openai.responses.create({
			model: "Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic",
			input: [
				{
					role: "user",
					content: "What's the capital of France?",
				},
			],
			stream: true,
		});

		const events = [];
		let sequenceNumber = 0;

		for await (const event of stream) {
			// Check sequence number is ascending starting from 0
			assert.equal(event.sequence_number, sequenceNumber);
			sequenceNumber++;

			events.push(event);
		}

		// Check the exact sequence order
		const expectedSequence = [
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
		];

		// Check the first 4 events match the expected sequence
		expectedSequence.forEach((expectedType, index) => {
			assert.equal(events[index].type, expectedType, `Event ${index} should be ${expectedType}`);
		});

		// Check that all middle events are delta events
		const middleEvents = events.slice(4, -4);
		middleEvents.forEach((event, index) => {
			assert.equal(
				event.type,
				"response.output_text.delta",
				`Middle event ${index} should be response.output_text.delta`
			);
		});

		// Check the final 4 events
		const finalEvents = [
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
		];

		const actualFinalEvents = events.slice(-4);
		finalEvents.forEach((expectedType, index) => {
			assert.equal(actualFinalEvents[index].type, expectedType, `Final event ${index} should be ${expectedType}`);
		});

		// Check specific event validations
		const createdEvents = events.filter((e) => e.type === "response.created");
		assert.equal(createdEvents.length, 1);
		assert.ok(createdEvents[0].response);

		const inProgressEvents = events.filter((e) => e.type === "response.in_progress");
		assert.equal(inProgressEvents.length, 1);
		assert.ok(inProgressEvents[0].response);

		const outputItemAddedEvents = events.filter((e) => e.type === "response.output_item.added");
		assert.equal(outputItemAddedEvents.length, 1);
		assert.ok(outputItemAddedEvents[0].item);
		assert.equal(outputItemAddedEvents[0].item.type, "message");

		const contentPartAddedEvents = events.filter((e) => e.type === "response.content_part.added");
		assert.equal(contentPartAddedEvents.length, 1);
		assert.ok(contentPartAddedEvents[0].part);
		assert.equal(contentPartAddedEvents[0].part.type, "output_text");

		// Check all delta events
		const deltaEvents = events.filter((e) => e.type === "response.output_text.delta");
		assert.ok(deltaEvents.length > 0);
		deltaEvents.forEach((deltaEvent) => {
			assert.equal(typeof deltaEvent.delta, "string");
		});

		const outputTextDoneEvents = events.filter((e) => e.type === "response.output_text.done");
		assert.equal(outputTextDoneEvents.length, 1);
		assert.ok(outputTextDoneEvents[0].text);
		assert.ok(outputTextDoneEvents[0].text.length > 0);

		const contentPartDoneEvents = events.filter((e) => e.type === "response.content_part.done");
		assert.equal(contentPartDoneEvents.length, 1);
		assert.equal(contentPartDoneEvents[0].part.type, "output_text");
		assert.ok(contentPartDoneEvents[0].part.text);

		const outputItemDoneEvents = events.filter((e) => e.type === "response.output_item.done");
		assert.equal(outputItemDoneEvents.length, 1);
		assert.equal(outputItemDoneEvents[0].item.type, "message");

		const completedEvents = events.filter((e) => e.type === "response.completed");
		assert.equal(completedEvents.length, 1);
		assert.ok(completedEvents[0].response);
		assert.ok(completedEvents[0].response.usage.input_tokens > 0);
		assert.ok(completedEvents[0].response.usage.output_tokens > 0);
		assert.ok(completedEvents[0].response.usage.total_tokens > 0);
		assert.equal(completedEvents[0].response.output[0].content[0].type, "output_text");
		assert.ok(completedEvents[0].response.output[0].content[0].text);
	});

	it("function streaming", async function () {
		const tools = [
			{
				type: "function",
				name: "get_weather",
				description: "Get current temperature for provided coordinates in celsius.",
				parameters: {
					type: "object",
					properties: {
						latitude: { type: "number" },
						longitude: { type: "number" },
					},
					required: ["latitude", "longitude"],
					additionalProperties: false,
				},
				strict: true,
			},
		];

		const stream = await openai.responses.create({
			model: "meta-llama/Llama-3.3-70B-Instruct:cerebras",
			input: [{ role: "user", content: "What's the weather like in Paris today?" }],
			tools,
			stream: true,
		});

		const events = [];
		let sequenceNumber = 0;

		for await (const event of stream) {
			// Check sequence number is ascending starting from 0
			assert.equal(event.sequence_number, sequenceNumber);
			sequenceNumber++;

			events.push(event);
		}

		// Check the exact sequence order for function streaming
		const expectedSequence = [
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.function_call_arguments.delta",
			"response.function_call_arguments.done",
			"response.output_item.done",
			"response.completed",
		];

		// Check the events match the expected sequence
		expectedSequence.forEach((expectedType, index) => {
			assert.equal(events[index].type, expectedType, `Event ${index} should be ${expectedType}`);
		});

		// Check specific event validations
		const createdEvents = events.filter((e) => e.type === "response.created");
		assert.equal(createdEvents.length, 1);
		assert.ok(createdEvents[0].response);

		const inProgressEvents = events.filter((e) => e.type === "response.in_progress");
		assert.equal(inProgressEvents.length, 1);
		assert.ok(inProgressEvents[0].response);

		const outputItemAddedEvents = events.filter((e) => e.type === "response.output_item.added");
		assert.equal(outputItemAddedEvents.length, 1);
		assert.ok(outputItemAddedEvents[0].item);
		assert.equal(outputItemAddedEvents[0].item.type, "function_call");
		assert.equal(outputItemAddedEvents[0].item.name, "get_weather");
		assert.ok(outputItemAddedEvents[0].item.id);
		assert.ok(outputItemAddedEvents[0].item.call_id);

		const functionCallArgumentsDeltaEvents = events.filter((e) => e.type === "response.function_call_arguments.delta");
		assert.equal(functionCallArgumentsDeltaEvents.length, 1);
		assert.ok(functionCallArgumentsDeltaEvents[0].delta);
		assert.equal(typeof functionCallArgumentsDeltaEvents[0].delta, "string");
		assert.ok(functionCallArgumentsDeltaEvents[0].item_id);

		const functionCallArgumentsDoneEvents = events.filter((e) => e.type === "response.function_call_arguments.done");
		assert.equal(functionCallArgumentsDoneEvents.length, 1);
		assert.ok(functionCallArgumentsDoneEvents[0].arguments);
		assert.equal(typeof functionCallArgumentsDoneEvents[0].arguments, "string");
		assert.ok(functionCallArgumentsDoneEvents[0].item_id);
		const argumentsJson = JSON.parse(functionCallArgumentsDoneEvents[0].arguments);
		assert.ok(typeof argumentsJson.latitude === "number");
		assert.ok(typeof argumentsJson.longitude === "number");

		const outputItemDoneEvents = events.filter((e) => e.type === "response.output_item.done");
		assert.equal(outputItemDoneEvents.length, 1);
		assert.equal(outputItemDoneEvents[0].item.type, "function_call");
		assert.equal(outputItemDoneEvents[0].item.name, "get_weather");
		assert.equal(outputItemDoneEvents[0].item.status, "completed");
		assert.ok(outputItemDoneEvents[0].item.arguments);

		const completedEvents = events.filter((e) => e.type === "response.completed");
		assert.equal(completedEvents.length, 1);
		assert.ok(completedEvents[0].response);
		assert.ok(completedEvents[0].response.usage.input_tokens > 0);
		assert.ok(completedEvents[0].response.usage.output_tokens > 0);
		assert.ok(completedEvents[0].response.usage.total_tokens > 0);
		assert.equal(completedEvents[0].response.output[0].type, "function_call");
		assert.equal(completedEvents[0].response.output[0].name, "get_weather");
		assert.equal(completedEvents[0].response.output[0].status, "completed");
	});

	it("structured output streaming", async function () {
		const CalendarEvent = z.object({
			name: z.string(),
			date: z.string(),
			participants: z.array(z.string()),
		});

		const stream = openai.responses.stream({
			model: "Qwen/Qwen2.5-VL-72B-Instruct:nebius",
			instructions: "Extract the event information.",
			input: "Alice and Bob are going to a science fair on Friday.",
			text: {
				format: zodTextFormat(CalendarEvent, "calendar_event"),
			},
		});

		const events = [];
		let sequenceNumber = 0;

		for await (const event of stream) {
			// Check sequence number is ascending starting from 0
			assert.equal(event.sequence_number, sequenceNumber);
			sequenceNumber++;

			events.push(event);
		}

		// Check the exact sequence order for structured output streaming
		const expectedSequence = [
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
		];

		// Check the first 4 events match the expected sequence
		expectedSequence.forEach((expectedType, index) => {
			assert.equal(events[index].type, expectedType, `Event ${index} should be ${expectedType}`);
		});

		// Check that all middle events are delta events
		const middleEvents = events.slice(4, -4);
		middleEvents.forEach((event, index) => {
			assert.equal(
				event.type,
				"response.output_text.delta",
				`Middle event ${index} should be response.output_text.delta`
			);
		});

		// Check the final 4 events
		const finalEvents = [
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
		];

		const actualFinalEvents = events.slice(-4);
		finalEvents.forEach((expectedType, index) => {
			assert.equal(actualFinalEvents[index].type, expectedType, `Final event ${index} should be ${expectedType}`);
		});

		// Check specific event validations
		const createdEvents = events.filter((e) => e.type === "response.created");
		assert.equal(createdEvents.length, 1);
		assert.ok(createdEvents[0].response);

		const inProgressEvents = events.filter((e) => e.type === "response.in_progress");
		assert.equal(inProgressEvents.length, 1);
		assert.ok(inProgressEvents[0].response);

		const outputItemAddedEvents = events.filter((e) => e.type === "response.output_item.added");
		assert.equal(outputItemAddedEvents.length, 1);
		assert.ok(outputItemAddedEvents[0].item);
		assert.equal(outputItemAddedEvents[0].item.type, "message");

		const contentPartAddedEvents = events.filter((e) => e.type === "response.content_part.added");
		assert.equal(contentPartAddedEvents.length, 1);
		assert.ok(contentPartAddedEvents[0].part);
		assert.equal(contentPartAddedEvents[0].part.type, "output_text");

		// Check all delta events
		const deltaEvents = events.filter((e) => e.type === "response.output_text.delta");
		assert.ok(deltaEvents.length > 0);
		deltaEvents.forEach((deltaEvent) => {
			assert.equal(typeof deltaEvent.delta, "string");
		});

		const outputTextDoneEvents = events.filter((e) => e.type === "response.output_text.done");
		assert.equal(outputTextDoneEvents.length, 1);
		assert.ok(outputTextDoneEvents[0].text);
		assert.ok(outputTextDoneEvents[0].text.length > 0);

		const contentPartDoneEvents = events.filter((e) => e.type === "response.content_part.done");
		assert.equal(contentPartDoneEvents.length, 1);
		assert.equal(contentPartDoneEvents[0].part.type, "output_text");
		assert.ok(contentPartDoneEvents[0].part.text);

		const outputItemDoneEvents = events.filter((e) => e.type === "response.output_item.done");
		assert.equal(outputItemDoneEvents.length, 1);
		assert.equal(outputItemDoneEvents[0].item.type, "message");

		const completedEvents = events.filter((e) => e.type === "response.completed");
		assert.equal(completedEvents.length, 1);
		assert.ok(completedEvents[0].response);
		assert.equal(completedEvents[0].response.output[0].content[0].type, "output_text");
		assert.ok(completedEvents[0].response.output[0].content[0].text);

		// Test finalResponse() method
		const result = await stream.finalResponse();
		assert.ok(result.output_parsed);
		assert.equal(typeof result.output_parsed, "object");
		assert.equal(typeof result.output_parsed.name, "string");
		assert.equal(typeof result.output_parsed.date, "string");
		assert.ok(Array.isArray(result.output_parsed.participants));
		assert.equal(result.output_parsed.name, "Science Fair");
		assert.equal(result.output_parsed.date, "Friday");
		assert.deepEqual(result.output_parsed.participants, ["Alice", "Bob"]);
	});

	it("MCP approved tool call", async function () {
		const response = await openai.responses.create({
			model: "meta-llama/Llama-3.3-70B-Instruct:cerebras",
			input: [
				{
					type: "message",
					role: "user",
					content: "how does tiktoken work?",
				},
				{
					type: "mcp_approval_request",
					id: "mcp_approval_request_123",
					server_label: "gitmcp",
					name: "fetch_tiktoken_documentation",
					arguments: "{}",
				},
				{
					type: "mcp_approval_response",
					id: "mcp_approval_response_123",
					approval_request_id: "mcp_approval_request_123",
					approve: true,
				},
			],
			tools: [
				{
					type: "mcp",
					server_label: "gitmcp",
					server_url: "https://gitmcp.io/openai/tiktoken",
					allowed_tools: ["search_tiktoken_documentation", "fetch_tiktoken_documentation"],
					require_approval: "always",
				},
			],
		});

		assert.ok(Array.isArray(response.output));
		assert.ok(response.output.length >= 2);

		// Check first output item (mcp_list_tools)
		const listToolsOutput = response.output[0];
		assert.equal(listToolsOutput.type, "mcp_list_tools");
		assert.equal(listToolsOutput.server_label, "gitmcp");
		assert.ok(listToolsOutput.id);
		assert.ok(Array.isArray(listToolsOutput.tools));
		assert.ok(listToolsOutput.tools.length > 0);

		// Check that tools array contains expected tools
		const toolNames = listToolsOutput.tools.map((tool) => tool.name);
		assert.ok(toolNames.includes("fetch_tiktoken_documentation"));
		assert.ok(toolNames.includes("search_tiktoken_documentation"));

		// Check second output item (mcp_call)
		const mcpCallOutput = response.output[1];
		assert.equal(mcpCallOutput.type, "mcp_call");
		assert.equal(mcpCallOutput.name, "fetch_tiktoken_documentation");
		assert.equal(mcpCallOutput.server_label, "gitmcp");
		assert.ok(mcpCallOutput.id);
		assert.ok(mcpCallOutput.output);
		assert.ok(typeof mcpCallOutput.output === "string");
		assert.ok(mcpCallOutput.output.length > 0);
	});

	it("MCP approval error handling", async function () {
		const response = await openai.responses.create({
			model: "meta-llama/Llama-3.3-70B-Instruct:cerebras",
			input: [
				{
					type: "message",
					role: "user",
					content: "how does tiktoken work?",
				},
				{
					type: "mcp_approval_response",
					id: "mcp_approval_response_123",
					approval_request_id: "mcp_approval_request_123",
					approve: true,
				},
			],
			tools: [
				{
					type: "mcp",
					server_label: "gitmcp",
					server_url: "https://gitmcp.io/openai/tiktoken",
					allowed_tools: ["search_tiktoken_documentation", "fetch_tiktoken_documentation"],
					require_approval: "always",
				},
			],
		});

		assert.ok(response.error);
		assert.equal(response.error.code, "server_error");
		assert.equal(response.error.message, "MCP approval request 'mcp_approval_request_123' not found");
	});

	it("MCP approval request", async function () {
		const response = await openai.responses.create({
			model: "meta-llama/Llama-3.3-70B-Instruct:cerebras",
			input: "how does tiktoken work?",
			tools: [
				{
					type: "mcp",
					server_label: "gitmcp",
					server_url: "https://gitmcp.io/openai/tiktoken",
					allowed_tools: ["search_tiktoken_documentation", "fetch_tiktoken_documentation"],
					require_approval: "always",
				},
			],
		});

		assert.ok(Array.isArray(response.output));
		assert.ok(response.output.length === 2);

		// Check first output item (mcp_list_tools)
		const listToolsOutput = response.output[0];
		assert.equal(listToolsOutput.type, "mcp_list_tools");
		assert.equal(listToolsOutput.server_label, "gitmcp");
		assert.ok(listToolsOutput.id);
		assert.ok(Array.isArray(listToolsOutput.tools));
		assert.ok(listToolsOutput.tools.length > 0);

		// Check that tools array contains expected tools
		const toolNames = listToolsOutput.tools.map((tool) => tool.name);
		assert.ok(toolNames.includes("fetch_tiktoken_documentation"));
		assert.ok(toolNames.includes("search_tiktoken_documentation"));

		// Check second output item (mcp_approval_request)
		const approvalRequestOutput = response.output[1];
		assert.equal(approvalRequestOutput.type, "mcp_approval_request");
		assert.equal(approvalRequestOutput.name, "fetch_tiktoken_documentation");
		assert.equal(approvalRequestOutput.server_label, "gitmcp");
		assert.ok(approvalRequestOutput.id);
		assert.ok(approvalRequestOutput.arguments);
		assert.equal(typeof approvalRequestOutput.arguments, "string");

		// Parse and validate the arguments
		const argumentsJson = JSON.parse(approvalRequestOutput.arguments);
		assert.ok(argumentsJson.root);
	});

	it("MCP auto approval", async function () {
		const response = await openai.responses.create({
			model: "meta-llama/Llama-3.3-70B-Instruct:cerebras",
			input: "how does tiktoken work?",
			tools: [
				{
					type: "mcp",
					server_label: "gitmcp",
					server_url: "https://gitmcp.io/openai/tiktoken",
					allowed_tools: ["search_tiktoken_documentation", "fetch_tiktoken_documentation"],
					require_approval: "never",
				},
			],
		});

		assert.ok(Array.isArray(response.output));
		assert.ok(response.output.length >= 2);

		// Check first output item (mcp_list_tools)
		const listToolsOutput = response.output[0];
		assert.equal(listToolsOutput.type, "mcp_list_tools");
		assert.equal(listToolsOutput.server_label, "gitmcp");
		assert.ok(listToolsOutput.id);
		assert.ok(Array.isArray(listToolsOutput.tools));
		assert.ok(listToolsOutput.tools.length > 0);

		// Check that tools array contains expected tools
		const toolNames = listToolsOutput.tools.map((tool) => tool.name);
		assert.ok(toolNames.includes("fetch_tiktoken_documentation"));
		assert.ok(toolNames.includes("search_tiktoken_documentation"));

		// Check second output item (mcp_call)
		const mcpCallOutput = response.output[1];
		assert.equal(mcpCallOutput.type, "mcp_call");
		assert.equal(mcpCallOutput.name, "fetch_tiktoken_documentation");
		assert.equal(mcpCallOutput.server_label, "gitmcp");
		assert.ok(mcpCallOutput.id);
		assert.ok(mcpCallOutput.arguments);
		assert.equal(typeof mcpCallOutput.arguments, "string");
		assert.ok(mcpCallOutput.output);
		assert.ok(typeof mcpCallOutput.output === "string");
		assert.ok(mcpCallOutput.output.length > 0);

		// Parse and validate the arguments
		const argumentsJson = JSON.parse(mcpCallOutput.arguments);
		assert.ok(argumentsJson.root);
	});

	it("MCP tools provided in input", async function () {
		const response = await openai.responses.create({
			model: "meta-llama/Llama-3.3-70B-Instruct:cerebras",
			input: [
				{
					id: "mcp_list_tools_8713ae5fbd20f7ebb68eb32a84bbb26f17cee1e0615bb762",
					type: "mcp_list_tools",
					server_label: "gitmcp",
					tools: [
						{
							input_schema: {
								type: "object",
							},
							name: "fetch_tiktoken_documentation",
							description:
								"Fetch entire documentation file from GitHub repository: openai/tiktoken. Useful for general questions. Always call this tool first if asked about openai/tiktoken.",
						},
						{
							input_schema: {
								type: "object",
								properties: {
									query: {
										type: "string",
										description: "The search query to find relevant documentation",
									},
								},
								required: ["query"],
								additionalProperties: false,
								$schema: "http://json-schema.org/draft-07/schema#",
							},
							name: "search_tiktoken_documentation",
							description:
								"Semantically search within the fetched documentation from GitHub repository: openai/tiktoken. Useful for specific queries.",
						},
					],
				},
				{
					type: "message",
					role: "user",
					content: "how does tiktoken work?",
				},
			],
			tools: [
				{
					type: "mcp",
					server_label: "gitmcp",
					server_url: "https://gitmcp.io/openai/tiktoken",
					allowed_tools: ["search_tiktoken_documentation", "fetch_tiktoken_documentation"],
					require_approval: "always",
				},
			],
		});

		assert.ok(Array.isArray(response.output));
		assert.ok(response.output.length === 1);

		// Check that the first output item is an approval request (not a list_tools call)
		const approvalRequestOutput = response.output[0];
		assert.equal(approvalRequestOutput.type, "mcp_approval_request");
		assert.equal(approvalRequestOutput.name, "fetch_tiktoken_documentation");
		assert.equal(approvalRequestOutput.server_label, "gitmcp");
		assert.ok(approvalRequestOutput.id);
		assert.ok(approvalRequestOutput.arguments);
		assert.equal(typeof approvalRequestOutput.arguments, "string");

		// Parse and validate the arguments
		const argumentsJson = JSON.parse(approvalRequestOutput.arguments);
		assert.ok(argumentsJson.root);
	});
});
