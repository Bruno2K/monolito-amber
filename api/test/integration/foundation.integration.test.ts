import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_TEMPLATES } from "@amber/shared";
import { migrate, seed, startTestDatabase, type TestDb } from "./postgres";

let db: TestDb;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await startTestDatabase();
  migrate(db.url);
  seed(db.url);
  prisma = new PrismaClient({ datasources: { db: { url: db.url } } });
  await prisma.$connect();
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  if (db?.stop) {
    await db.stop();
  }
});

describe("foundation integration (Testcontainers / TEST_DATABASE_URL)", () => {
  it("seeds the closed 0.2A catalog without gate.override", async () => {
    const permissions = await prisma.permissionDefinition.findMany();
    expect(permissions.map((p) => p.code).sort()).toEqual([...PERMISSIONS].sort());
    expect(permissions.some((p) => p.code === "gate.override")).toBe(false);
    const roles = await prisma.roleDefinition.findMany({
      where: { isSystemTemplate: true },
      include: { rolePermissions: true },
    });
    expect(roles).toHaveLength(ROLE_TEMPLATES.length);
  });

  it("writes outbox and idempotency primitives", async () => {
    const outbox = await prisma.outboxMessage.create({
      data: {
        eventType: "CurrentRevisionChanged",
        payload: { note: "creates Impact Analysis case only — not Issues" },
        correlationId: "corr-1",
      },
    });
    expect(outbox.processedAt).toBeNull();
    const record = await prisma.idempotencyRecord.create({
      data: {
        organizationId: "00000000-0000-4000-8000-000000000099",
        key: "make-current-1",
        requestHash: "abc",
        responseStatus: 200,
        responseBody: { ok: true },
      },
    });
    expect(record.key).toBe("make-current-1");
  });

  it("denies UPDATE/DELETE on audit for the application role", async () => {
    const inserted = await prisma.auditEvent.create({
      data: {
        organizationId: "00000000-0000-4000-8000-000000000001",
        eventType: "TEST_INSERT",
        resourceType: "test",
        correlationId: "corr-audit",
        payload: { ok: true },
      },
    });

    const client = new Client({ connectionString: appUrl(db.url) });
    await client.connect();
    try {
      await expect(
        client.query("UPDATE audit.audit_events SET event_type = 'TAMPER' WHERE id = $1", [inserted.id]),
      ).rejects.toThrow();
      await expect(
        client.query("DELETE FROM audit.audit_events WHERE id = $1", [inserted.id]),
      ).rejects.toThrow();
      const { rows } = await client.query("SELECT event_type FROM audit.audit_events WHERE id = $1", [
        inserted.id,
      ]);
      expect(rows[0]?.event_type).toBe("TEST_INSERT");
    } finally {
      await client.end();
    }
  });
});

function appUrl(url: string): string {
  const parsed = new URL(url);
  parsed.username = "amber_app";
  parsed.password = "amber_app_dev";
  return parsed.toString();
}
