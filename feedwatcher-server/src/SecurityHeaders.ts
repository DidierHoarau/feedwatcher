import { FastifyInstance } from "fastify";

// Global response hardening. The CSP carries only frame-ancestors so the Nuxt
// SPA, its inline styles and the service worker keep working.
export function SecurityHeadersRegister(fastify: FastifyInstance): void {
  fastify.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Content-Security-Policy", "frame-ancestors 'none'");
    reply.header("Strict-Transport-Security", "max-age=15552000");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    return payload;
  });
}
