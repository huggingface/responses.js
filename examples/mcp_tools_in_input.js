/**
 * In this example, we already know the tools that are available for the MCP server.
 * We can pass them in the input to avoid listing them again.
 *
 * Expected in server logs:
 * Using MCP list tools from input for server 'gitmcp'
 * Requesting approval for MCP tool 'fetch_tiktoken_documentation'
 */

import OpenAI from "openai";

const openai = new OpenAI({ baseURL: "http://localhost:3000/v1", apiKey: process.env.HF_TOKEN });

const response = await openai.responses.create({
	model: "cerebras@meta-llama/Llama-3.3-70B-Instruct",
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
					annotations: {
						_def: {
							options: [
								{
									_def: {
										unknownKeys: "strip",
										catchall: {
											_def: {
												typeName: "ZodNever",
											},
											"~standard": {
												version: 1,
												vendor: "zod",
											},
										},
										typeName: "ZodObject",
									},
									"~standard": {
										version: 1,
										vendor: "zod",
									},
									_cached: null,
								},
								{
									_def: {
										typeName: "ZodNull",
									},
									"~standard": {
										version: 1,
										vendor: "zod",
									},
								},
							],
							typeName: "ZodUnion",
						},
						"~standard": {
							version: 1,
							vendor: "zod",
						},
					},
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
				{
					input_schema: {
						type: "object",
						properties: {
							query: {
								type: "string",
								description: "The search query to find relevant code files",
							},
							page: {
								type: "number",
								description: "Page number to retrieve (starting from 1). Each page contains 30 results.",
							},
						},
						required: ["query"],
						additionalProperties: false,
						$schema: "http://json-schema.org/draft-07/schema#",
					},
					name: "search_tiktoken_code",
					description:
						'Search for code within the GitHub repository: "openai/tiktoken" using the GitHub Search API (exact match). Returns matching files for you to query further if relevant.',
				},
				{
					input_schema: {
						type: "object",
						properties: {
							url: {
								type: "string",
								description: "The URL of the document or page to fetch",
							},
						},
						required: ["url"],
						additionalProperties: false,
						$schema: "http://json-schema.org/draft-07/schema#",
					},
					name: "fetch_generic_url_content",
					description:
						"Generic tool to fetch content from any absolute URL, respecting robots.txt rules. Use this to retrieve referenced urls (absolute urls) that were mentioned in previously fetched documentation.",
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

response.output.forEach((output, index) => {
	console.log(`Output item #${index}`);
	console.log(output);
});
