import Fastify from "fastify";
import { SecurityHeadersRegister } from "./SecurityHeaders";

describe("SecurityHeadersRegister (L1)", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify();
    SecurityHeadersRegister(fastify);
    fastify.get("/ok", async () => ({ ok: true }));
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  test.each(["/ok", "/missing"])(
    "sets the security headers on %s",
    async (url) => {
      const response = await fastify.inject({ method: "GET", url });

      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBe("DENY");
      expect(response.headers["content-security-policy"]).toBe(
        "frame-ancestors 'none'"
      );
      expect(response.headers["strict-transport-security"]).toBe(
        "max-age=15552000"
      );
      expect(response.headers["referrer-policy"]).toBe(
        "strict-origin-when-cross-origin"
      );
    }
  );

  test("keeps the CSP narrow so the SPA is not broken", async () => {
    const response = await fastify.inject({ method: "GET", url: "/ok" });

    const csp = String(response.headers["content-security-policy"]);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("default-src");
  });

  test("returns the payload unchanged", async () => {
    const response = await fastify.inject({ method: "GET", url: "/ok" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
