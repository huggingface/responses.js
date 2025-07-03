import OpenAI from "openai";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

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
	model: "cerebras@meta-llama/Llama-3.3-70B-Instruct",
	tools: tools,
	input: "What is the weather like in Boston today?",
	tool_choice: "auto",
});

console.log(response);
