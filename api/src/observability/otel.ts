import { logger } from "./logger";

/**
 * OpenTelemetry hooks. Registers a Node SDK when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * Always available as a no-op hook so foundation slices can attach spans later.
 */
export async function startOpenTelemetry(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    logger.info({ otel: "disabled" }, "OpenTelemetry exporter unset; hooks registered as no-op");
    return;
  }
  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? "amber-api",
    });
    await sdk.start();
    logger.info({ otel: "started", endpoint }, "OpenTelemetry SDK started");
  } catch (error) {
    logger.warn({ err: error }, "OpenTelemetry SDK failed to start; continuing without remote export");
  }
}
