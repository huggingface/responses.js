"use client";
import React from "react";
import FileSearchSetup from "./file-search-setup";
import WebSearchConfig from "./websearch-config";
import FunctionsView from "./functions-view";
import McpConfig from "./mcp-config";
import PanelConfig from "./panel-config";
import useToolsStore from "@/stores/useToolsStore";

export default function ContextPanel() {
	const {
		fileSearchEnabled,
		setFileSearchEnabled,
		webSearchEnabled,
		setWebSearchEnabled,
		functionsEnabled,
		setFunctionsEnabled,
		mcpEnabled,
		setMcpEnabled,
		codeInterpreterEnabled,
		setCodeInterpreterEnabled,
	} = useToolsStore();
	return (
		<div className="h-full p-8 w-full bg-[#f9f9f9] rounded-t-xl md:rounded-none border-l-1 border-stone-100">
			<div className="flex flex-col overflow-y-scroll h-full">
				{/* <PanelConfig
					title="File Search"
					tooltip="Allows to search a knowledge base (vector store)"
					enabled={fileSearchEnabled}
					setEnabled={setFileSearchEnabled}
				>
					<FileSearchSetup />
				</PanelConfig> */}
				{/* <PanelConfig
					title="Web Search"
					tooltip="Allows to search the web"
					enabled={webSearchEnabled}
					setEnabled={setWebSearchEnabled}
				>
					<WebSearchConfig />
				</PanelConfig> */}
				{/* <PanelConfig
					title="Code Interpreter"
					tooltip="Allows the assistant to run Python code"
					enabled={codeInterpreterEnabled}
					setEnabled={setCodeInterpreterEnabled}
				/> */}
				<PanelConfig
					title="Functions"
					tooltip="Allows to use locally defined functions"
					enabled={functionsEnabled}
					setEnabled={setFunctionsEnabled}
				>
					<FunctionsView />
				</PanelConfig>
				{/* <PanelConfig
					title="MCP"
					tooltip="Allows to call tools via remote MCP server"
					enabled={mcpEnabled}
					setEnabled={setMcpEnabled}
				>
					<McpConfig />
				</PanelConfig> */}
			</div>
		</div>
	);
}
