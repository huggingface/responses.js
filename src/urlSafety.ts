import { Address4, Address6 } from "ip-address";
import { isIP } from "net";
import dns from "dns";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * Address ranges an MCP server URL must not point at. They are not routable on the public
 * internet, so a request reaching one of them never targets the MCP server the caller described:
 * loopback, the unspecified range, link-local (which carries the cloud metadata service),
 * carrier-grade NAT, and the three RFC1918 private ranges.
 */
const UNSAFE_IPV4_SUBNETS = [
	"0.0.0.0/8",
	"10.0.0.0/8",
	"100.64.0.0/10",
	"127.0.0.0/8",
	"169.254.0.0/16",
	"172.16.0.0/12",
	"192.168.0.0/16",
].map((subnet) => new Address4(subnet));

/**
 * IPv4-mapped IPv6 range. Matched as a subnet rather than with ip-address's `is4()`, which only
 * recognises the dotted textual form: the URL parser rewrites `::ffff:127.0.0.1` to its canonical
 * hex form `::ffff:7f00:1`, for which `is4()` returns false.
 */
const IPV4_MAPPED_IPV6_SUBNET = new Address6("::ffff:0:0/96");

/**
 * Unique local addresses (fc00::/7) are the IPv6 counterpart of the private IPv4 ranges.
 * `isLoopback()` and `isLinkLocal()` do not cover them.
 */
const UNIQUE_LOCAL_IPV6_SUBNET = new Address6("fc00::/7");

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** IPv6 literals come out of `URL.hostname` bracketed; `isIP` only accepts them bare. */
function stripBrackets(hostname: string): string {
	return hostname.replace(/^\[|]$/g, "");
}

/** Whether an IP literal falls in one of the ranges above. Unparseable input counts as unsafe. */
export function isUnsafeIp(address: string): boolean {
	const family = isIP(address);

	if (family === 4) {
		const addr = new Address4(address);
		return UNSAFE_IPV4_SUBNETS.some((subnet) => addr.isInSubnet(subnet));
	}

	if (family === 6) {
		const addr = new Address6(address);
		// IPv4-mapped addresses (e.g. ::ffff:127.0.0.1) connect to the embedded IPv4 host.
		if (addr.isInSubnet(IPV4_MAPPED_IPV6_SUBNET)) {
			return UNSAFE_IPV4_SUBNETS.some((subnet) => addr.to4().isInSubnet(subnet));
		}
		// The unspecified address reaches localhost, exactly as 0.0.0.0 does.
		if (addr.correctForm() === "::") {
			return true;
		}
		if (addr.isInSubnet(UNIQUE_LOCAL_IPV6_SUBNET)) {
			return true;
		}
		return addr.isLoopback() || addr.isLinkLocal();
	}

	return true;
}

/**
 * Parse and validate an MCP server URL taken from a request body.
 *
 * The DNS hook further down only runs for hosts undici resolves through DNS, so a URL that already
 * carries a raw IP literal would otherwise never be checked. Returns the parsed URL so callers do
 * not parse the string twice.
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
		throw new Error(`MCP server URL resolves to a non-routable address: ${hostname}`);
	}

	return url;
}

/**
 * Undici agent that re-checks the address at connection time. Checking only the URL string leaves
 * a gap: a hostname can resolve to a public address when the URL is validated and to an internal
 * one when the socket opens (DNS rebinding). This hook closes that gap.
 */
const ssrfSafeAgent = new Agent({
	connect: {
		lookup: (hostname, options, callback) => {
			dns.lookup(hostname, options, (err, address, family) => {
				if (err) {
					return callback(err, "", 4);
				}
				const addresses = typeof address === "string" ? [address] : address.map((entry) => entry.address);
				for (const entry of addresses) {
					if (isUnsafeIp(entry)) {
						return callback(new Error(`${hostname} resolves to a non-routable address (${entry})`), "", 4);
					}
				}
				return callback(null, address, family);
			});
		},
	},
});

/**
 * `fetch` for the MCP transports. It validates the target before every hop, resolves through the
 * agent above, and follows redirects itself so that a redirect cannot move the request to an
 * internal address after the first check passed.
 */
export async function mcpSafeFetch(url: string | URL, init?: RequestInit): Promise<Response> {
	let currentUrl = url.toString();
	let currentInit = init;

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		assertSafeMcpUrl(currentUrl);
		const response = (await undiciFetch(currentUrl, {
			...(currentInit as Record<string, unknown>),
			redirect: "manual",
			dispatcher: ssrfSafeAgent,
		})) as unknown as Response;

		if (!REDIRECT_STATUSES.has(response.status)) {
			return response;
		}

		const location = response.headers.get("location");
		if (!location) {
			throw new Error("MCP server sent a redirect without a Location header");
		}
		const redirectUrl = new URL(location, currentUrl).toString();

		// Per the fetch spec: 301 and 302 rewrite POST to GET, 303 rewrites any non-GET/HEAD to GET.
		const method = (currentInit?.method ?? "GET").toUpperCase();
		if (
			([301, 302].includes(response.status) && method === "POST") ||
			(response.status === 303 && method !== "GET" && method !== "HEAD")
		) {
			currentInit = { ...init, method: "GET", body: undefined };
		}
		currentUrl = redirectUrl;
	}

	throw new Error(`MCP server URL exceeded ${MAX_REDIRECTS} redirects`);
}
