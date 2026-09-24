import { strict as assert } from "assert";
import { createServer } from "http";
import { fetch as undiciFetch } from "undici";
import { assertSafeMcpUrl, isUnsafeIp, mcpSafeFetch, ssrfSafeAgent } from "../dist/urlSafety.js";

describe("MCP server URL validation", function () {
	describe("isUnsafeIp", function () {
		const unsafe = [
			"127.0.0.1",
			"127.53.12.9",
			"0.0.0.0",
			"10.1.2.3",
			"172.16.0.1",
			"172.31.255.255",
			"192.168.1.1",
			"169.254.169.254",
			"100.64.0.1",
			"::1",
			"::",
			"::ffff:127.0.0.1",
			"::ffff:7f00:1", // canonical form of ::ffff:127.0.0.1, which URL parsing produces
			"::ffff:10.0.0.1",
			"fc00::1",
			"fd12:3456::1",
			"fe80::1",
			"not-an-ip",
		];
		for (const address of unsafe) {
			it(`rejects ${address}`, function () {
				assert.equal(isUnsafeIp(address), true);
			});
		}

		const safe = ["1.1.1.1", "93.184.216.34", "172.32.0.1", "11.0.0.1", "2606:4700:4700::1111"];
		for (const address of safe) {
			it(`accepts ${address}`, function () {
				assert.equal(isUnsafeIp(address), false);
			});
		}
	});

	describe("assertSafeMcpUrl", function () {
		it("accepts a public https URL and returns it parsed", function () {
			const url = assertSafeMcpUrl("https://mcp.example.com/sse");
			assert.equal(url.hostname, "mcp.example.com");
		});

		it("accepts a hostname that has not been resolved yet", function () {
			assert.doesNotThrow(() => assertSafeMcpUrl("https://localhost.example.com/"));
		});

		// [url, expected message fragment]
		const rejected = [
			["http://127.0.0.1:8080/", "non-routable"],
			["http://169.254.169.254/latest/meta-data/", "non-routable"],
			["http://192.168.1.1/", "non-routable"],
			["http://10.1.2.3/", "non-routable"],
			["http://[::ffff:127.0.0.1]/", "non-routable"],
			["http://[::1]/", "non-routable"],
			["http://[::]/", "non-routable"],
			["file:///etc/passwd", "scheme"],
			["ftp://example.com/", "scheme"],
			["gopher://example.com/", "scheme"],
			["not a url", "Invalid MCP server URL"],
		];
		for (const [url, fragment] of rejected) {
			it(`rejects ${url}`, function () {
				assert.throws(() => assertSafeMcpUrl(url), new RegExp(fragment));
			});
		}
	});

	describe("mcpSafeFetch", function () {
		it("rejects a non-routable target before opening a socket", async function () {
			await assert.rejects(() => mcpSafeFetch("http://169.254.169.254/"), /non-routable/);
		});

		// undici wraps a connector failure as `TypeError: fetch failed`; the reason is on `.cause`.
		const rejectionReason = async (fn) => {
			try {
				await fn();
			} catch (error) {
				return String(error.cause?.message ?? error.message);
			}
			throw new Error("expected the request to be rejected");
		};

		it("rejects a hostname that resolves to a non-routable address", async function () {
			const server = createServer((req, res) => {
				res.writeHead(200);
				res.end("ok");
			});
			await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
			const { port } = server.address();
			try {
				// `localhost` passes the URL check, which only inspects IP literals. The resolved
				// address is what must be caught, and only the lookup hook sees it.
				const reason = await rejectionReason(() => mcpSafeFetch(`http://localhost:${port}/`));
				assert.match(reason, /non-routable/);
			} finally {
				server.close();
			}
		});

		// A redirect target is never seen by `assertSafeMcpUrl`, and an IP literal is never seen by
		// the lookup hook. The connect wrapper is the only thing covering that combination, so it is
		// exercised directly here rather than through a redirect the URL check would catch first.
		it("rejects a non-routable literal at connection time, bypassing the URL check", async function () {
			const server = createServer((req, res) => {
				res.writeHead(200);
				res.end("ok");
			});
			await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
			const { port } = server.address();
			try {
				const reason = await rejectionReason(() =>
					undiciFetch(`http://127.0.0.1:${port}/`, { dispatcher: ssrfSafeAgent })
				);
				assert.match(reason, /non-routable/);
			} finally {
				server.close();
			}
		});
	});
});
