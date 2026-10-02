import axios from "axios";
import * as dns from "dns";
import * as net from "net";

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
];

export class UrlSafetyError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function isPrivateAddress(ip: string): boolean {
  if (!ip) {
    return true;
  }
  const version = net.isIP(ip);
  if (version === 4) {
    return isPrivateIPv4(ip);
  }
  if (version === 6) {
    return isPrivateIPv6(ip);
  }
  return true;
}

// Validates a URL for outbound fetching: http(s) only, hostname must resolve
// exclusively to public addresses.
export async function UrlSafetyValidate(urlRaw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(String(urlRaw));
  } catch {
    throw new UrlSafetyError("Invalid URL", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlSafetyError("Invalid URL", 400);
  }
  if (url.username || url.password) {
    throw new UrlSafetyError("Invalid URL", 400);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UrlSafetyError("URL not allowed", 400);
    }
    return;
  }
  let addresses: dns.LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new UrlSafetyError("Unable to resolve hostname", 502);
  }
  if (addresses.length === 0) {
    throw new UrlSafetyError("Unable to resolve hostname", 502);
  }
  for (const address of addresses) {
    if (isPrivateAddress(address.address)) {
      throw new UrlSafetyError("URL not allowed", 400);
    }
  }
}

// Fetches a URL with SSRF protections: every hop is validated, the redirect
// count is bounded, the content type is restricted and the body is capped.
export async function UrlSafetyFetchText(urlRaw: string): Promise<string> {
  let url = String(urlRaw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await UrlSafetyValidate(url);
    let response: any;
    try {
      response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 0,
        responseType: "text",
        maxContentLength: MAX_RESPONSE_BYTES,
        validateStatus: () => true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; FeedWatcher/1.0; +https://github.com/didierhoarau/feedwatcher)",
        },
      });
    } catch (err: any) {
      if (err?.code === "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED") {
        throw new UrlSafetyError("Response too large", 413);
      }
      throw new UrlSafetyError("Failed to fetch URL", 502);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.location;
      if (!location) {
        throw new UrlSafetyError("Failed to fetch URL", 502);
      }
      url = new URL(String(location), url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new UrlSafetyError(`Failed to fetch URL (HTTP ${response.status})`, 502);
    }
    const contentType = String(response.headers?.["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new UrlSafetyError("Unsupported content type", 415);
    }
    return response.data;
  }
  throw new UrlSafetyError("Too many redirects", 502);
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => isNaN(part))) {
    return true;
  }
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 192 && b === 0) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) {
    return true;
  }
  if (a === 203 && b === 0 && c === 113) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("fe80:")) {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (normalized.startsWith("ff")) {
    return true;
  }
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) {
    return isPrivateIPv4(mapped[1]);
  }
  const hexMapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const high = parseInt(hexMapped[1], 16);
    const low = parseInt(hexMapped[2], 16);
    return isPrivateIPv4(
      `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
    );
  }
  return false;
}
