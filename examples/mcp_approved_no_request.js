/**
 * In this example, we are sending back a MCP approval response to the server but forgot to include the approval request.
 * 
 * Expected: response.error is not null.
 */

import OpenAI from "openai";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

const response = await openai.responses.create({
	model: "cerebras@meta-llama/Llama-3.3-70B-Instruct",
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

console.log(response.error);
// {
// 	code: 'server_error',
// 	message: "MCP approval response for approval request 'mcp_approval_request_123' not found"
// }
