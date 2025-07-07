import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ChatCompletionInputTool } from "@huggingface/tasks/dist/commonjs/tasks/chat-completion/inference.js";

export interface McpClient {
	client: Client;
	tools: Record<string, ChatCompletionInputTool>;
}
