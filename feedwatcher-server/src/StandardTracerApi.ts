import { FastifyInstance } from "fastify";
import { SemanticAttributes } from "@opentelemetry/semantic-conventions";
import { SpanStatusCode } from "@opentelemetry/api";
import { Config } from "./Config";
import { StandardTracer } from "./utils-std-ts/StandardTracer";
import { Span } from "@opentelemetry/sdk-trace-base";
import { defaultTextMapGetter, ROOT_CONTEXT } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { api } from "@opentelemetry/sdk-node";

const propagator = new W3CTraceContextPropagator();

export class StandardTracerApi {
  //
  public static async registerHooks(fastify: FastifyInstance, config: Config): Promise<void> {
    fastify.addHook("onRequest", async (req) => {
      let spanName = `${req.method}-${req.url}`;
      let urlName = req.url;
      if (config.OPENTELEMETRY_COLLECTOR_AWS) {
        spanName = `${config.SERVICE_ID}-${config.VERSION}`;
        urlName = `${config.SERVICE_ID}-${config.VERSION}-${req.method}-${req.url}`;
      }
      const callerContext = propagator.extract(ROOT_CONTEXT, req.headers, defaultTextMapGetter);
      api.context.with(callerContext, () => {
        const span = StandardTracer.startSpan(spanName);
        span.setAttribute(SemanticAttributes.HTTP_METHOD, req.method);
        span.setAttribute(SemanticAttributes.HTTP_URL, urlName);
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        (req as any).tracerSpanApi = span;
      });
    });

    fastify.addHook("onResponse", async (req, reply, payload) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const span = (req as any).tracerSpanApi as Span;
      if (reply.statusCode > 299) {
        span.status.code = SpanStatusCode.ERROR;
      } else {
        span.status.code = SpanStatusCode.OK;
      }
      span.setAttribute(SemanticAttributes.HTTP_STATUS_CODE, reply.statusCode);
      span.end();
    });

    fastify.addHook("onError", async (req, reply, error) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const span = (req as any).tracerSpanApi as Span;
      span.status.code = SpanStatusCode.ERROR;
      span.recordException(error);
    });
  }
}
