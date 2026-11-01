import * as https from "https";
import * as path from "path";

const ssrfHttp: any = require(path.join(
  __dirname,
  "../../processors-system/lib/ssrf-http.js",
));

export const URL_SAFETY_DEFAULT_CONTENT_TYPES = [
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
  return ssrfHttp.isPrivateAddress(ip);
}

export interface UrlSafetyFetchOptions {
  trustedOrigins?: string[];
  headers?: Record<string, string>;
  maxRedirects?: number;
  allowPrivateNetwork?: boolean;
}

// Validates a URL for outbound fetching: http(s) only, hostname must resolve
// exclusively to public addresses unless its exact origin is trusted.
export async function UrlSafetyValidate(
  urlRaw: string,
  options: UrlSafetyFetchOptions = {},
): Promise<void> {
  try {
    await ssrfHttp.validateUrl(urlRaw, options);
  } catch (err: any) {
    throw new UrlSafetyError(err.message, err.statusCode);
  }
}

// Validates an HTTPS URL and returns an agent that always connects to the
// address validated for it, so DNS cannot be rebound between validation and
// the request. Used for push endpoints, which must stay public-only.
export async function UrlSafetyPinnedHttpsAgent(
  urlRaw: string,
  options: UrlSafetyFetchOptions = {},
): Promise<https.Agent> {
  try {
    const parsed = new URL(urlRaw);
    if (parsed.protocol !== "https:") {
      throw new UrlSafetyError("Invalid URL", 400);
    }
    const validated = await ssrfHttp.validateUrl(urlRaw, options);
    return new https.Agent({
      keepAlive: false,
      lookup: ssrfHttp.createPinnedLookup(validated.address, validated.family),
    });
  } catch (err: any) {
    if (err instanceof UrlSafetyError) {
      throw err;
    }
    throw new UrlSafetyError(err.message, err.statusCode);
  }
}

// Fetches a URL with SSRF protections: every hop is validated, the redirect
// count is bounded, the content type is restricted and the body is capped.
export async function UrlSafetyFetchText(
  urlRaw: string,
  allowedContentTypes: string[] = URL_SAFETY_DEFAULT_CONTENT_TYPES,
  options: UrlSafetyFetchOptions = {},
): Promise<string> {
  try {
    const response = await ssrfHttp.fetchText(urlRaw, {
      timeoutMs: 10000,
      maxContentLength: 2 * 1024 * 1024,
      allowedContentTypes,
      ...options,
    });
    return response.data;
  } catch (err: any) {
    throw new UrlSafetyError(err.message, err.statusCode);
  }
}
