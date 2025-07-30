import { z } from "zod";

/**
 * https://platform.openai.com/docs/api-reference/responses/create
 * commented out properties are not supported by the server
 */

const inputContentSchema = z.array(
	z.union([
		z.object({
			type: z.literal("input_text"),
			text: z.string(),
		}),
		z.object({
			type: z.literal("input_image"),
			// file_id: z.string().nullable().default(null),
			image_url: z.string(),
			// detail: z.enum(["auto", "low", "high"]).default("auto"),
		}),
		// z.object({
		// 	type: z.literal("input_file"),
		// 	file_data: z.string().nullable().default(null),
		// 	file_id: z.string().nullable().default(null),
		// 	filename: z.string().nullable().default(null),
		// }),
	])
);

const mcpServerParamsSchema = z.object({
	server_label: z.string(),
	server_url: z.string(),
	type: z.literal("mcp"),
	allowed_tools: z
		.union([
			z.array(z.string()),
			z.object({
				tool_names: z.array(z.string()),
			}),
		])
		.nullable()
		.default(null),
	headers: z.record(z.string()).nullable().default(null),
	require_approval: z
		.union([
			z.enum(["always", "never"]),
			z.object({
				always: z.object({ tool_names: z.array(z.string()).optional() }).optional(),
				never: z.object({ tool_names: z.array(z.string()).optional() }).optional(),
			}),
		])
		.default("always"),
});

const mcpApprovalRequestParamsSchema = z.object({
	type: z.literal("mcp_approval_request"),
	id: z.string(),
	server_label: z.string(),
	name: z.string(),
	arguments: z.string(),
});
const mcpApprovalResponseParamsSchema = z.object({
	type: z.literal("mcp_approval_response"),
	id: z.string().nullable().default(null),
	approval_request_id: z.string(),
	approve: z.boolean(),
	reason: z.string().nullable().default(null),
});
const mcpCallParamsSchema = z.object({
	type: z.literal("mcp_call"),
	id: z.string(),
	name: z.string(),
	server_label: z.string(),
	arguments: z.string(),
});

export const createResponseParamsSchema = z.object({
	// background: z.boolean().default(false),
	// include:
	input: z.union([
		z.string(),
		z.array(
			z.union([
				z.object({
					content: z.union([z.string(), inputContentSchema]),
					role: z.enum(["user", "assistant", "system", "developer"]),
					type: z.enum(["message"]).default("message"),
				}),
				z.object({
					role: z.enum(["user", "system", "developer"]),
					status: z.enum(["in_progress", "completed", "incomplete"]).nullable().default(null),
					content: inputContentSchema,
					type: z.enum(["message"]).default("message"),
				}),
				z.object({
					id: z.string().optional(),
					role: z.enum(["assistant"]),
					status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
					type: z.enum(["message"]).default("message"),
					content: z.array(
						z.union([
							z.object({
								type: z.literal("output_text"),
								text: z.string(),
								annotations: z.array(z.object({})).optional(), // TODO: incomplete
								logprobs: z.array(z.object({})).optional(), // TODO: incomplete
							}),
							z.object({
								type: z.literal("refusal"),
								refusal: z.string(),
							}),
							// TODO: much more objects: File search tool call, Computer tool call, Computer tool call output, Web search tool call, Function tool call, Function tool call output, Reasoning, Image generation call, Code interpreter tool call, Local shell call, Local shell call output, MCP list tools, MCP approval request, MCP approval response, MCP tool call
						])
					),
				}),
				z.object({
					type: z.literal("function_call"),
					id: z.string().optional(),
					call_id: z.string(),
					name: z.string(),
					arguments: z.string(),
					status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
				}),
				z.object({
					call_id: z.string(),
					output: z.string(),
					type: z.literal("function_call_output"),
					id: z.string().optional(),
					status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
				}),
				z.object({
					type: z.literal("mcp_list_tools"),
					id: z.string(),
					server_label: z.string(),
					tools: z.array(
						z.object({
							name: z.string(),
							input_schema: z.record(z.any()),
							description: z.string().nullable().optional(),
							annotations: z.object({}).optional(),
						})
					),
					error: z.string().nullable().optional(),
				}),
				mcpApprovalRequestParamsSchema,
				mcpApprovalResponseParamsSchema,
				mcpCallParamsSchema,
			])
		),
	]),
	instructions: z.string().nullable().default(null),
	max_output_tokens: z.number().int().min(0).nullable().default(null),
	// max_tool_calls: z.number().min(0).nullable().default(null),
	metadata: z
		.record(z.string().max(64), z.string().max(512))
		.refine((val) => Object.keys(val).length <= 16, {
			message: "Must have at most 16 items",
		})
		.nullable()
		.default(null),
	model: z.string(),
	// parallel_tool_calls: z.boolean().default(true), // TODO: how to handle this if chat completion doesn't?
	// previous_response_id: z.string().nullable().default(null),
	reasoning: z
		.object({
			effort: z.enum(["low", "medium", "high"]).default("medium"),
			summary: z.enum(["auto", "concise", "detailed"]).nullable().default(null),
		})
		.optional(),
	// store: z.boolean().default(true),
	stream: z.boolean().default(false),
	temperature: z.number().min(0).max(2).default(1),
	text: z
		.object({
			format: z.union([
				z.object({
					type: z.literal("text"),
				}),
				z.object({
					type: z.literal("json_object"),
				}),
				z.object({
					type: z.literal("json_schema"),
					name: z
						.string()
						.max(64, "Must be at most 64 characters")
						.regex(/^[a-zA-Z0-9_-]+$/, "Only letters, numbers, underscores, and dashes are allowed"),
					description: z.string().optional(),
					schema: z.record(z.any()),
					strict: z.boolean().default(false),
				}),
			]),
		})
		.optional(),
	tool_choice: z
		.union([
			z.enum(["auto", "none", "required"]),
			z.object({
				type: z.literal("function"),
				name: z.string(),
			}),
			// TODO: also hosted tool and MCP tool
		])
		.optional(),
	tools: z
		.array(
			z.union([
				z.object({
					name: z.string(),
					parameters: z.record(z.any()),
					strict: z.boolean().default(true),
					type: z.literal("function"),
					description: z.string().optional(),
				}),
				mcpServerParamsSchema,
			])
		)
		.optional(),
	// top_logprobs: z.number().min(0).max(20).nullable().default(null),
	top_p: z.number().min(0).max(1).default(1),
	// truncation: z.enum(["auto", "disabled"]).default("disabled"),
	// user
});

export type CreateResponseParams = z.infer<typeof createResponseParamsSchema>;
export type McpServerParams = z.infer<typeof mcpServerParamsSchema>;
export type McpApprovalRequestParams = z.infer<typeof mcpApprovalRequestParamsSchema>;
export type McpApprovalResponseParams = z.infer<typeof mcpApprovalResponseParamsSchema>;
export type McpCallParams = z.infer<typeof mcpCallParamsSchema>;
