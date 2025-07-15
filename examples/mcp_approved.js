/**
 * In this example, we already received a MCP approval request.
 * We are sending back a MCP approval response to the server.
 *
 * Expected in server logs:
 * Connected to MCP server https://gitmcp.io/openai/tiktoken
 * Listing MCP tools from server
 * Fetched 4 tools from MCP server 'gitmcp'
 * Connected to MCP server https://gitmcp.io/openai/tiktoken
 * Calling MCP tool 'fetch_tiktoken_documentation'
 */

import OpenAI from "openai";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

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

response.output.forEach((output, index) => {
	console.log(`Output item #${index}`);
	console.log(output);
});
