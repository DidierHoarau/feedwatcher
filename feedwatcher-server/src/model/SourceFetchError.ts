export type SourceFetchErrorClass =
  | "permanent"
  | "rateLimited"
  | "transient"
  | "unknown";

export interface SourceFetchErrorInfo {
  status: number | null;
  errorClass: SourceFetchErrorClass;
  retryAfterSeconds: number | null;
}

const PERMANENT_STATUSES = [404, 410];
const RATE_LIMITED_STATUSES = [429, 503];
const NETWORK_ERROR_CODES = [
  "ECONNABORTED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ERR_NETWORK",
  "ETIMEDOUT",
];

export function SourceFetchErrorClassify(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  err: any,
): SourceFetchErrorInfo {
  const response = errorResponse(err);
  const status =
    response && Number(response.status) > 0 ? Number(response.status) : null;
  if (status === null) {
    const code = String(err?.code || err?.cause?.code || "");
    return {
      status: null,
      errorClass: NETWORK_ERROR_CODES.includes(code) ? "transient" : "unknown",
      retryAfterSeconds: null,
    };
  }
  if (PERMANENT_STATUSES.includes(status)) {
    return { status, errorClass: "permanent", retryAfterSeconds: null };
  }
  if (RATE_LIMITED_STATUSES.includes(status)) {
    return {
      status,
      errorClass: "rateLimited",
      retryAfterSeconds: sourceFetchRetryAfterSeconds(response),
    };
  }
  return {
    status,
    errorClass: status >= 500 ? "transient" : "unknown",
    retryAfterSeconds: null,
  };
}

// Private Functions

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorResponse(err: any): any {
  if (err?.response) {
    return err.response;
  }
  return err?.cause?.response ? err.cause.response : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sourceFetchRetryAfterSeconds(response: any): number | null {
  const header =
    response?.headers?.["retry-after"] ?? response?.headers?.["Retry-After"];
  if (header === undefined || header === null || header === "") {
    return null;
  }
  const seconds = Number(header);
  if (!isNaN(seconds)) {
    return seconds > 0 ? Math.ceil(seconds) : 0;
  }
  const date = new Date(String(header));
  if (isNaN(date.getTime())) {
    return null;
  }
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
}
