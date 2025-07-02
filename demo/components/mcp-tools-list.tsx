"use client";
import React, { useState } from "react";
import { McpListToolsItem } from "@/lib/assistant";
import { ChevronRight, Code } from "lucide-react";

interface Props {
	item: McpListToolsItem;
}

export default function McpToolsList({ item }: Props) {
	function ToolDescription({ description }: { description: string }) {
		const [expanded, setExpanded] = useState(false);
		return (
			<div className="flex items-start mt-1 gap-2">
				<div
					className={
						`text-zinc-500 text-xs whitespace-pre-wrap transition-all duration-200 ` +
						(expanded ? "line-clamp-none" : "line-clamp-1 overflow-hidden")
					}
					style={{ maxWidth: 400 }}
				>
					{description}
				</div>
				<div
					className="flex items-center text-xs text-gray-500 focus:outline-none select-none cursor-pointer"
					onClick={() => setExpanded((prev) => !prev)}
				>
					<ChevronRight
						className={`h-4 w-4 transition-transform duration-200 mr-1 ${expanded ? "rotate-90" : "rotate-0"}`}
						aria-hidden="true"
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div className="flex">
				<div className="mr-4 rounded-[16px] px-4 py-2 md:mr-24 text-black bg-white font-light">
					<div className="text-sm mb-2 text-blue-500">
						Server <span className="font-semibold">{item.server_label}</span> tools list
					</div>
					<div className="space-y-2 text-sm mt-3">
						{item.tools.map((tool) => (
							<div key={tool.name}>
								<div className="flex gap-2 items-center text-xs">
									<div className="bg-blue-100 text-blue-500 rounded-md p-1">
										<Code size={12} />
									</div>
									<div className="font-mono">{tool.name}</div>
								</div>
								{tool.description && <ToolDescription description={tool.description} />}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
