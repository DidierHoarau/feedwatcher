import { createOTelContext } from "@devopsplaybook.io/common-utils";

const otel = createOTelContext();

export const OTelTracer = otel.OTelTracer;
export const OTelSetTracer = otel.OTelSetTracer;
export const OTelMeter = otel.OTelMeter;
export const OTelSetMeter = otel.OTelSetMeter;
export const OTelLogger = otel.OTelLogger;
export const OTelRequestSpan = otel.OTelRequestSpan;
