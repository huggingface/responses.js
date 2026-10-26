import dns from "dns";
import { BlockList, isIP } from "net";
import { Agent, buildConnector, fetch as undiciFetch } from "undici";

/**
 * Address ranges an MCP server URL must not point at.
 *
 * The deployed NetworkPolicy (`chart/templates/network-policy.yaml`) is the authority for denying
 * routable private ranges: its `0.0.0.0/0 except ...` shape covers everything it is not told about,
 * which a hand-written list here never can. This module exists for the two things that policy
 * structurally cannot do: block pod-local loopback traffic, which never reaches the CNI, and
 * protect environments where the policy is disabled (it is off by default in `values.yaml`).
 *
 * Grow the policy, not this list.
 */
const UNSAFE_RANGES = new BlockList();
for (const [network, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.168.0.0", 16],
] as const) {
	UNSAFE_RANGES.addSubnet(network, prefix, "ipv4");
}
// BlockList checks IPv4-mapped IPv6 (`::ffff:127.0.0.1` and its canonical `::ffff:7f00:1`) against
// the IPv4 rules above on its own, so those need no entry here.
UNSAFE_RANGES.addAddress("::", "ipv6");
UNSAFE_RANGES.addAddress("::1", "ipv6");
UNSAFE_RANGES.addSubnet("fc00::", 7, "ipv6");
UNSAFE_RANGES.addSubnet("fe80::", 10, "ipv6");

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** IPv6 literals come out of `URL.hostname` bracketed; `isIP` only accepts them bare. */
function stripBrackets(hostname: string): string {
	return hostname.replace(/^\[|]$/g, "");
}

/** Whether an IP literal falls in one of the ranges above. Unparseable input counts as unsafe. */
export function isUnsafeIp(address: string): boolean {
	const family = isIP(address);
	if (family === 0) {
		return true;
	}
	return UNSAFE_RANGES.check(address, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Parse and validate an MCP server URL taken from a request body.
 *
 * Called from the request schema so a bad URL is a 400 from the parser rather than a failure
 * halfway through a streamed response. Returns the parsed URL, which the transports need anyway.
 */
export function assertSafeMcpUrl(urlString: string): URL {
	let url: URL;
	try {
		url = new URL(urlString.trim());
	} catch {
		throw new Error(`Invalid MCP server URL: ${urlString}`);
	}

	if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
		throw new Error(`Unsupported MCP server URL scheme '${url.protocol}', expected http: or https:`);
	}

	const hostname = stripBrackets(url.hostname.toLowerCase());
	if (isIP(hostname) && isUnsafeIp(hostname)) {
		throw new Error(`MCP server URL points at a non-routable address: ${hostname}`);
	}

	return url;
}

/**
 * Validates every address the resolver hands back, so a hostname cannot be used to reach an
 * internal address. `connect` below covers the other half: a URL that carries an IP literal is
 * never resolved, so this hook never sees it.
 */
const defaultConnector = buildConnector({
	// Validates every address the resolver hands back, so a hostname cannot be used to reach an
	// internal address. The `connect` wrapper below covers the other half: a URL carrying an IP
	// literal is never resolved, so this hook never sees it.
	lookup: (hostname, options, callback) => {
		dns.lookup(hostname, options, (err, address, family) => {
			if (err) {
				return callback(err, "", 4);
			}
			const resolved = typeof address === "string" ? [address] : address.map((a) => a.address);
			for (const entry of resolved) {
				if (isUnsafeIp(entry)) {
					return callback(new Error(`${hostname} resolves to a non-routable address (${entry})`), "", 4);
				}
			}
			return callback(null, address, family);
		});
	},
});

/**
 * Undici agent that re-checks the address of every connection the dispatcher makes, including each
 * hop of a redirect chain. Two checks are needed and neither subsumes the other: `lookup` sees
 * resolved hostnames but is skipped for IP literals, while this wrapper sees the literal but not
 * what a hostname resolves to.
 *
 * This narrows the DNS-rebinding window rather than closing it: the address is validated and then
 * connected to without being pinned in between.
 */
export const ssrfSafeAgent = new Agent({
	connect(options, callback) {
		const hostname = stripBrackets(String(options.hostname ?? ""));
		if (isIP(hostname) && isUnsafeIp(hostname)) {
			callback(new Error(`${hostname} is a non-routable address`), null);
			return;
		}
		return defaultConnector(options, callback);
	},
});

/**
 * `fetch` for the MCP transports. Redirect following is left to undici, which implements the fetch
 * spec — including stripping `Authorization` and `Cookie` when a hop crosses origins — while the
 * agent above validates the address of every hop it connects to.
 */
export async function mcpSafeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
	const target = assertSafeMcpUrl(url.toString());
	return (await undiciFetch(target, {
		...(init as Parameters<typeof undiciFetch>[1]),
		dispatcher: ssrfSafeAgent,
	})) as unknown as Response;
}
