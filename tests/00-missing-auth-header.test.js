import { strict as assert } from "assert";

const BASE_URL = process.env.RESPONSES_BASE_URL ?? "http://localhost:3000";

describe("missing Authorization header", function () {
	// Matches the existing test suite behavior: tests expect a running dev server.
	before(async function () {
		try {
			const response = await fetch(`${BASE_URL}/`);
			if (response.status !== 200) {
				throw new Error(`Server returned status ${response.status}`);
			}
		} catch (error) {
			console.error("❌ Server is not running. Please start the server with 'pnpm dev' before running the tests.");
			throw error;
		}
	});

	it("streaming request returns 401 (does not start an SSE stream)", async function () {
		const res = await fetch(`${BASE_URL}/v1/responses`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "text/event-stream",
			},
			body: JSON.stringify({ model: "gpt-4.1-mini", input: "hi", stream: true }),
		});

		assert.equal(res.status, 401);

		const contentType = res.headers.get("content-type") ?? "";
		assert.ok(!contentType.includes("text/event-stream"), `Expected non-SSE response, got content-type: ${contentType}`);
	});

	it("non-streaming request returns 401 and server remains healthy", async function () {
		const res = await fetch(`${BASE_URL}/v1/responses`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ model: "gpt-4.1-mini", input: "hi" }),
		});

		assert.equal(res.status, 401);

		// Regression: the handler must not crash the whole process after responding.
		// (The bug was triggering "Cannot set headers after they are sent to the client".)
		const healthRes = await fetch(`${BASE_URL}/health`);
		assert.equal(healthRes.status, 200);
	});
});
