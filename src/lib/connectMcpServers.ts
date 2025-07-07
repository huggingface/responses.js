import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { version as packageVersion } from "../../package.json";
import { URL } from "url";

import type { ChatCompletionInputTool } from "@huggingface/tasks/dist/commonjs/tasks/chat-completion/inference.js";
import type { McpServerParams } from "../schemas";
import type { McpClient } from "../types";

export async function connectMcpServers(mcpServers: McpServerParams[]): Promise<Record<string, McpClient>> {
	const mcpClients: Record<string, McpClient> = {};

	for (const server of mcpServers) {
		const mcp = new Client({ name: "@huggingface/responses.js", version: packageVersion });
		const allowedTools = server.allowed_tools
			? Array.isArray(server.allowed_tools)
				? server.allowed_tools
				: server.allowed_tools.tool_names
			: [];

		// Try to connect with http first, if that fails, try sse
		const url = new URL(server.server_url);
		const options = {
			requestInit: server.headers
				? {
						headers: server.headers,
					}
				: undefined,
		};
		try {
			const transport = new StreamableHTTPClientTransport(url, options);
			await mcp.connect(transport);
		} catch {
			const transport = new SSEClientTransport(url, options);
			await mcp.connect(transport);
		}

		// List tools
		const mcpTools = await mcp.listTools();
		console.debug(
			"Connected to MCP server",
			server.server_url,
			"with tools:",
			mcpTools.tools.map(({ name }) => name)
		);
		const tools = mcpTools.tools.reduce(
			(acc, tool) => {
				if (!allowedTools.includes(tool.name)) {
					return acc;
				}

				acc[tool.name] = {
					type: "function" as const,
					function: {
						name: tool.name,
						parameters: tool.inputSchema,
						description: tool.description,
					},
				};
				return acc;
			},
			{} as Record<string, ChatCompletionInputTool>
		);

		mcpClients[server.server_label] = {
			client: mcp,
			tools: tools,
		};
	}

	return mcpClients;
}
