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

// Validates a URL for outbound fetching: http(s) only, hostname must resolve
// exclusively to public addresses.
export async function UrlSafetyValidate(urlRaw: string): Promise<void> {
  try {
    await ssrfHttp.validateUrl(urlRaw);
  } catch (err: any) {
    throw new UrlSafetyError(err.message, err.statusCode);
  }
}

// Fetches a URL with SSRF protections: every hop is validated, the redirect
// count is bounded, the content type is restricted and the body is capped.
export async function UrlSafetyFetchText(
  urlRaw: string,
  allowedContentTypes: string[] = URL_SAFETY_DEFAULT_CONTENT_TYPES,
): Promise<string> {
  try {
    const response = await ssrfHttp.fetchText(urlRaw, {
      timeoutMs: 10000,
      maxContentLength: 2 * 1024 * 1024,
      allowedContentTypes,
    });
    return response.data;
  } catch (err: any) {
    throw new UrlSafetyError(err.message, err.statusCode);
  }
}
