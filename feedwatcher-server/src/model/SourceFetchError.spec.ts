import { SourceFetchErrorClassify } from "./SourceFetchError";

function httpError(
  status: number,
  headers: Record<string, string> = {},
): Error {
  return Object.assign(
    new Error(`Request failed with status code ${status}`),
    { response: { status, headers, data: "" } },
  );
}

describe("SourceFetchErrorClassify", () => {
  //
  describe("HTTP status classification", () => {
    //
    test("should classify 404 and 410 as permanent", () => {
      expect(SourceFetchErrorClassify(httpError(404))).toEqual({
        status: 404,
        errorClass: "permanent",
        retryAfterSeconds: null,
      });
      expect(SourceFetchErrorClassify(httpError(410)).errorClass).toBe(
        "permanent",
      );
    });

    test("should classify 429 and 503 as rate limited", () => {
      expect(SourceFetchErrorClassify(httpError(429))).toEqual({
        status: 429,
        errorClass: "rateLimited",
        retryAfterSeconds: null,
      });
      expect(SourceFetchErrorClassify(httpError(503)).errorClass).toBe(
        "rateLimited",
      );
    });

    test("should classify other 5xx as transient", () => {
      for (const status of [500, 502, 504]) {
        expect(SourceFetchErrorClassify(httpError(status))).toEqual({
          status,
          errorClass: "transient",
          retryAfterSeconds: null,
        });
      }
    });

    test("should classify unexpected statuses as unknown", () => {
      expect(SourceFetchErrorClassify(httpError(401))).toEqual({
        status: 401,
        errorClass: "unknown",
        retryAfterSeconds: null,
      });
      expect(SourceFetchErrorClassify(httpError(403)).errorClass).toBe(
        "unknown",
      );
    });
  });

  describe("Retry-After", () => {
    //
    test("should read a delay in seconds", () => {
      const info = SourceFetchErrorClassify(
        httpError(429, { "retry-after": "120" }),
      );
      expect(info.retryAfterSeconds).toBe(120);
    });

    test("should read an HTTP date", () => {
      const info = SourceFetchErrorClassify(
        httpError(503, {
          "retry-after": new Date(Date.now() + 90000).toUTCString(),
        }),
      );
      expect(info.retryAfterSeconds).toBeGreaterThan(85);
      expect(info.retryAfterSeconds).toBeLessThanOrEqual(90);
    });

    test("should ignore an unparsable header", () => {
      const info = SourceFetchErrorClassify(
        httpError(429, { "retry-after": "in a while" }),
      );
      expect(info.retryAfterSeconds).toBeNull();
    });

    test("should not read Retry-After for non rate limited statuses", () => {
      const info = SourceFetchErrorClassify(
        httpError(500, { "retry-after": "60" }),
      );
      expect(info.retryAfterSeconds).toBeNull();
    });
  });

  describe("errors without a response", () => {
    //
    test("should classify network error codes as transient", () => {
      for (const code of ["ECONNABORTED", "ECONNRESET", "ETIMEDOUT"]) {
        const err = Object.assign(new Error("socket hang up"), { code });
        expect(SourceFetchErrorClassify(err)).toEqual({
          status: null,
          errorClass: "transient",
          retryAfterSeconds: null,
        });
      }
    });

    test("should classify unknown errors as unknown", () => {
      expect(SourceFetchErrorClassify(new Error("Boom"))).toEqual({
        status: null,
        errorClass: "unknown",
        retryAfterSeconds: null,
      });
      expect(SourceFetchErrorClassify(null).errorClass).toBe("unknown");
      expect(SourceFetchErrorClassify(undefined).errorClass).toBe("unknown");
    });

    test("should read the status of a wrapped error via its cause", () => {
      const wrapped = new Error(
        "YouTube feed not reachable for channel UCRiskReversalMedia (404)",
      ) as Error & { cause?: unknown };
      wrapped.cause = httpError(404);
      expect(SourceFetchErrorClassify(wrapped)).toEqual({
        status: 404,
        errorClass: "permanent",
        retryAfterSeconds: null,
      });
    });
  });
});
