import { BatchSpanProcessor, Span } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { AWSXRayIdGenerator } from "@opentelemetry/id-generator-aws-xray";

import { SemanticAttributes, SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import opentelemetry, { Context } from "@opentelemetry/api";
import * as os from "os";
import { ConfigInterface } from "./models/ConfigInterface";
import { defaultTextMapSetter, trace, ROOT_CONTEXT } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";

let tracerInstance;
let config: ConfigInterface;
const propagator = new W3CTraceContextPropagator();

export class StandardTracer {
  //
  public static initTelemetry(initConfig: ConfigInterface) {
    config = initConfig;
    const provider = new NodeTracerProvider({
      idGenerator: new AWSXRayIdGenerator(),
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: `${config.SERVICE_ID}`,
        [SemanticResourceAttributes.SERVICE_VERSION]: `${config.VERSION}`,
        [SemanticResourceAttributes.SERVICE_NAMESPACE]: "telepathy",
        [SemanticResourceAttributes.HOST_NAME]: os.hostname(),
      }),
    });
    provider.register();
    if (config.OPENTELEMETRY_COLLECTOR_HTTP) {
      const exporter = new OTLPTraceExporter({
        url: config.OPENTELEMETRY_COLLECTOR_HTTP,
        headers: {},
      });
      provider.addSpanProcessor(new BatchSpanProcessor(exporter));
    }
    const contextManager = new AsyncHooksContextManager();
    contextManager.enable();
    opentelemetry.context.setGlobalContextManager(contextManager);
  }

  public static getSpanFromRequest(req: any): Span {
    return (req as any).tracerSpanApi as Span;
  }

  public static startSpan(name, parentSpan?: Span): Span {
    const tracer = StandardTracer.getTracer();
    let spanName = name;
    if (config.OPENTELEMETRY_COLLECTOR_AWS) {
      spanName = `${config.SERVICE_ID}-${config.VERSION}`;
    }

    if (parentSpan) {
      return tracer.startSpan(
        spanName,
        undefined,
        opentelemetry.trace.setSpan(opentelemetry.context.active(), parentSpan)
      ) as Span;
    }

    const span = tracer.startSpan(spanName) as Span;
    if (config.OPENTELEMETRY_COLLECTOR_AWS) {
      span.setAttribute(SemanticAttributes.HTTP_URL, `${config.SERVICE_ID}-${config.VERSION}-${name}`);
    }

    return span;
  }

  public static getTracer(): any {
    if (!tracerInstance) {
      tracerInstance = opentelemetry.trace.getTracer(`${config.SERVICE_ID}-${config.VERSION}`);
    }
    return tracerInstance;
  }

  public static appendHeader(context: Span, headers = {}): any {
    if (!headers) {
      headers = {};
    }
    propagator.inject(trace.setSpanContext(ROOT_CONTEXT, context.spanContext()), headers as any, defaultTextMapSetter);
    return headers;
  }
}
