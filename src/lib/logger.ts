import pino from "pino";
import pinoHttp from "pino-http";
import { generateUniqueId } from "./generateUniqueId.js";
import type { IncomingMessage } from "http";

const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const LOG_PRETTY = process.env.LOG_PRETTY === "true";

export const logger = pino({
	level: LOG_LEVEL,
	timestamp: pino.stdTimeFunctions.isoTime,
	redact: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-api-key"]'],
	...(LOG_PRETTY
		? {
				transport: {
					target: "pino-pretty",
				},
			}
		: {}),
});

export const httpLogger = pinoHttp({
	logger,
	genReqId: (req: IncomingMessage) => {
		const headers = req.headers;
		return (
			(headers["x-request-id"] as string) ??
			(headers["x-trace-id"] as string) ??
			generateUniqueId("req")
		);
	},
	customProps: (req: IncomingMessage) => ({
		trace_id: req.headers["x-trace-id"] ?? req.headers["x-request-id"] ?? undefined,
		session_id: req.headers["x-session-id"] ?? undefined,
	}),
	customLogLevel: (_req: IncomingMessage, res: { statusCode: number }) => {
		if (res.statusCode >= 500) return "error";
		if (res.statusCode >= 400) return "warn";
		return "info";
	},
	autoLogging: {
		ignore: (req: IncomingMessage) => req.url === "/health",
	},
});
