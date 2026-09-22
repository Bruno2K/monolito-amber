import { createServer } from "node:http";
import { jobIdempotencyKey } from "@amber/shared";
import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "amber-worker" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
});

/**
 * BullMQ worker scaffold. Redis is required only when jobs are enabled (0.6).
 * Job handlers must be idempotent; retries use the same job key.
 */
async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info(
      { jobs: "disabled", reason: "REDIS_URL unset" },
      "Worker scaffold idle — Redis only when the first justified job ships",
    );
  } else {
    const { Worker } = await import("bullmq");
    const { default: IORedis } = await import("ioredis");
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    new Worker(
      "amber-jobs",
      async (job) => {
        const key = jobIdempotencyKey(job.name, String(job.id));
        logger.info({ job: job.name, key, correlationId: job.data?.correlationId }, "job received");
        return { ok: true, key };
      },
      { connection },
    );
    logger.info({ redis: true }, "BullMQ worker listening");
  }

  const port = Number(process.env.PORT ?? process.env.WORKER_PORT ?? 3002);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "amber-worker", jobsEnabled: Boolean(redisUrl) }));
  });
  server.listen(port, "0.0.0.0", () => {
    logger.info({ port, bind: "0.0.0.0" }, "amber-worker health listening");
  });
}

main().catch((error) => {
  logger.error({ err: error }, "worker failed");
  process.exit(1);
});
