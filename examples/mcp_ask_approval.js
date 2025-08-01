import OpenAI from "openai";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

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

response.output.forEach((output, index) => {
	console.log(`Output item #${index}`);
	console.log(output);
});
