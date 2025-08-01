import express, { type Express } from "express";
import { createResponseParamsSchema } from "./schemas.js";
import { validateBody } from "./middleware/validation.js";
import { requestLogger } from "./middleware/logging.js";
import { getLandingPageHtml, postCreateResponse } from "./routes/index.js";

export const createApp = (): Express => {
	const app: Express = express();

	// Middleware
	app.use(requestLogger());
	app.use(express.json());

	// Routes
	app.get("/", getLandingPageHtml);

	app.get("/health", (_req: Request, res: Response) => {
		res.send("OK");
	});

	app.post("/v1/responses", validateBody(createResponseParamsSchema), postCreateResponse);

	return app;
};
