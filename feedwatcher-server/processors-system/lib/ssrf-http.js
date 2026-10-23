// Shared SSRF-safe HTTP client for processors and URL previews.
// Plain CommonJS so bundled processors can require it directly; this file is
// not a processor itself (the processor scan only looks at top-level .js files).
const dns = require("dns");
const http = require("http");
const https = require("https");
const net = require("net");

const axiosModule = require("axios");
const axios = axiosModule.get ? axiosModule : axiosModule.default;

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_CONTENT_LENGTH = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const USER_AGENT =
  "Mozilla/5.0 (compatible; FeedWatcher/1.0; +https://github.com/didierhoarau/feedwatcher)";

const blockedIPv4 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blockedIPv4.addSubnet(network, prefix, "ipv4");
}

const blockedIPv6 = new net.BlockList();
for (const [network, prefix] of [
  // ::, ::1 and IPv4-compatible forms such as ::127.0.0.1
  ["::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  blockedIPv6.addSubnet(network, prefix, "ipv6");
}

let allowPrivateNetwork = false;

class SsrfHttpError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "SsrfHttpError";
    this.statusCode = statusCode;
  }
}

function configure(options) {
  allowPrivateNetwork = !!(options && options.allowPrivateNetwork === true);
}

function ipv4FromMapped(ip) {
  // ::ffff:a.b.c.d
  const lower = ip.toLowerCase();
  if (!lower.startsWith("::ffff:")) {
    return null;
  }
  const rest = lower.slice("::ffff:".length);
  if (rest.includes(".")) {
    return net.isIP(rest) === 4 ? rest : null;
  }
  const match = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
  if (!match) {
    return null;
  }
  const high = parseInt(match[1], 16);
  const low = parseInt(match[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function isPrivateAddress(ip) {
  if (!ip || typeof ip !== "string") {
    return true;
  }
  const version = net.isIP(ip);
  if (version === 4) {
    return blockedIPv4.check(ip, "ipv4");
  }
  if (version === 6) {
    const mapped = ipv4FromMapped(ip);
    if (mapped) {
      return blockedIPv4.check(mapped, "ipv4");
    }
    return blockedIPv6.check(ip, "ipv6");
  }
  return true;
}

// Resolves a URL and returns the validated address to pin for the connection.
async function validateUrl(urlRaw) {
  let url;
  try {
    url = new URL(String(urlRaw));
  } catch {
    throw new SsrfHttpError("Invalid URL", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfHttpError("Invalid URL", 400);
  }
  if (url.username || url.password) {
    throw new SsrfHttpError("Invalid URL", 400);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || hostname.includes("%")) {
    throw new SsrfHttpError("Invalid URL", 400);
  }
  if (net.isIP(hostname)) {
    if (!allowPrivateNetwork && isPrivateAddress(hostname)) {
      throw new SsrfHttpError("URL not allowed", 400);
    }
    return { url, address: hostname, family: net.isIP(hostname) };
  }
  let addresses;
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new SsrfHttpError("Unable to resolve hostname", 502);
  }
  if (!addresses || addresses.length === 0) {
    throw new SsrfHttpError("Unable to resolve hostname", 502);
  }
  if (!allowPrivateNetwork) {
    for (const address of addresses) {
      if (isPrivateAddress(address.address)) {
        throw new SsrfHttpError("URL not allowed", 400);
      }
    }
  }
  const pinned = addresses.find((item) => item.family === 4) || addresses[0];
  return { url, address: pinned.address, family: pinned.family };
}

// Agent lookup that ignores DNS and always returns the address validated for
// this request, so a second resolution cannot swap in a private target.
function createPinnedLookup(address, family) {
  return (hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options && options.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
}

async function fetchText(urlRaw, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxContentLength =
    options.maxContentLength || DEFAULT_MAX_CONTENT_LENGTH;
  const maxRedirects =
    options.maxRedirects === undefined
      ? DEFAULT_MAX_REDIRECTS
      : options.maxRedirects;
  const allowedContentTypes = options.allowedContentTypes;
  const signal = options.signal;
  const headers = Object.assign(
    { "User-Agent": USER_AGENT },
    options.headers || {},
  );
  let currentUrl = String(urlRaw);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const validated = await validateUrl(currentUrl);
    const isHttps = validated.url.protocol === "https:";
    const Agent = isHttps ? https.Agent : http.Agent;
    const agent = new Agent({
      keepAlive: false,
      lookup: createPinnedLookup(validated.address, validated.family),
    });
    let response;
    try {
      response = await axios.get(validated.url.toString(), {
        timeout: timeoutMs,
        maxRedirects: 0,
        responseType: "text",
        maxContentLength,
        validateStatus: () => true,
        proxy: false,
        httpAgent: isHttps ? undefined : agent,
        httpsAgent: isHttps ? agent : undefined,
        headers,
        signal,
      });
    } catch (err) {
      if (err && err.code === "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED") {
        throw new SsrfHttpError("Response too large", 413);
      }
      throw new SsrfHttpError("Failed to fetch URL", 502);
    } finally {
      agent.destroy();
    }
    if (response.status === 304) {
      return {
        status: 304,
        headers: response.headers,
        data: response.data || "",
      };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers && response.headers.location;
      if (!location) {
        throw new SsrfHttpError("Failed to fetch URL", 502);
      }
      currentUrl = new URL(String(location), validated.url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new SsrfHttpError(
        `Failed to fetch URL (HTTP ${response.status})`,
        502,
      );
    }
    if (Array.isArray(allowedContentTypes)) {
      const contentType = String(
        (response.headers && response.headers["content-type"]) || "",
      )
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!allowedContentTypes.includes(contentType)) {
        throw new SsrfHttpError("Unsupported content type", 415);
      }
    }
    return {
      status: response.status,
      headers: response.headers,
      data: response.data,
    };
  }
  throw new SsrfHttpError("Too many redirects", 502);
}

module.exports = {
  SsrfHttpError,
  configure,
  isPrivateAddress,
  validateUrl,
  fetchText,
};
