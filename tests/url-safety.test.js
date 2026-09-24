import { strict as assert } from "assert";
import { assertSafeMcpUrl, isUnsafeIp, mcpSafeFetch } from "../dist/urlSafety.js";

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
		it("accepts a public https URL", function () {
			const url = assertSafeMcpUrl("https://mcp.example.com/sse");
			assert.equal(url.hostname, "mcp.example.com");
		});

		it("accepts a public http URL", function () {
			assert.equal(assertSafeMcpUrl("http://mcp.example.com/mcp").protocol, "http:");
		});

		it("accepts a public IP literal", function () {
			assert.equal(assertSafeMcpUrl("https://1.1.1.1/mcp").hostname, "1.1.1.1");
		});

		it("rejects loopback", function () {
			assert.throws(() => assertSafeMcpUrl("http://127.0.0.1:8000/mcp"), /non-routable/);
		});

		it("rejects the link-local metadata address", function () {
			assert.throws(() => assertSafeMcpUrl("http://169.254.169.254/latest/meta-data/"), /non-routable/);
		});

		it("rejects a private RFC1918 address", function () {
			assert.throws(() => assertSafeMcpUrl("http://192.168.1.1/mcp"), /non-routable/);
		});

		it("rejects 10.0.0.0/8", function () {
			assert.throws(() => assertSafeMcpUrl("http://10.1.2.3/mcp"), /non-routable/);
		});

		it("rejects an IPv4-mapped IPv6 loopback literal", function () {
			assert.throws(() => assertSafeMcpUrl("http://[::ffff:127.0.0.1]/mcp"), /non-routable/);
		});

		it("rejects the unspecified IPv6 address", function () {
			assert.throws(() => assertSafeMcpUrl("http://[::]:8000/mcp"), /non-routable/);
		});

		it("rejects an IPv6 loopback literal", function () {
			assert.throws(() => assertSafeMcpUrl("http://[::1]:8000/mcp"), /non-routable/);
		});

		it("rejects a non-http scheme", function () {
			assert.throws(() => assertSafeMcpUrl("file:///etc/passwd"), /Unsupported MCP server URL scheme/);
		});

		it("rejects gopher:", function () {
			assert.throws(() => assertSafeMcpUrl("gopher://example.com/"), /Unsupported MCP server URL scheme/);
		});

		it("rejects a string that is not a URL", function () {
			assert.throws(() => assertSafeMcpUrl("mcp.example.com"), /Invalid MCP server URL/);
		});
	});

	describe("mcpSafeFetch", function () {
		it("refuses a loopback target before opening a socket", async function () {
			await assert.rejects(mcpSafeFetch("http://127.0.0.1:8000/mcp"), /non-routable/);
		});

		it("refuses the link-local metadata address", async function () {
			await assert.rejects(mcpSafeFetch("http://169.254.169.254/latest/meta-data/"), /non-routable/);
		});

		// The name is only checked once it is resolved, so a name that points at an internal address
		// is stopped at connection time. undici reports it as a `fetch failed` wrapping our error.
		it("refuses a hostname that resolves to loopback", async function () {
			await assert.rejects(mcpSafeFetch("http://localhost:8000/mcp"), (error) => {
				assert.match(error.cause.message, /localhost resolves to a non-routable address/);
				return true;
			});
		});
	});
});
