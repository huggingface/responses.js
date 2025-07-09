import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { version as packageVersion } from "../package.json";
import { URL } from "url";

import type { McpServerParams } from "./schemas";
import { McpResultFormatter } from "./lib/McpResultFormatter";
import { generateUniqueId } from "./lib/generateUniqueId";
import type { ResponseOutputItem } from "openai/resources/responses/responses";

export async function connectMcpServer(mcpServer: McpServerParams): Promise<Client> {
	const mcp = new Client({ name: "@huggingface/responses.js", version: packageVersion });

	// Try to connect with http first, if that fails, try sse
	const url = new URL(mcpServer.server_url);
	const options = {
		requestInit: mcpServer.headers
			? {
					headers: mcpServer.headers,
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

	console.log("Connected to MCP server", mcpServer.server_url);

	return mcp;
}

export async function callMcpTool(
	mcpServer: McpServerParams,
	toolName: string,
	server_label: string,
	argumentsString: string
): Promise<{ error: string; output?: undefined } | { error?: undefined; output: string }> {
	try {
		const client = await connectMcpServer(mcpServer);
		const toolArgs: Record<string, unknown> = argumentsString === "" ? {} : JSON.parse(argumentsString);
		console.log(`Calling MCP tool '${toolName}'`);
		const toolResponse = await client.callTool({ name: toolName, arguments: toolArgs });
		const formattedResult = McpResultFormatter.format(toolResponse);
		return {
			output: formattedResult,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
		return {
			error: errorMessage,
		};
	}
}
