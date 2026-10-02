import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  M3_SEED_ORGANIZATIONS,
  M3_SEED_USERS,
  M5_SEED_CONVERSATIONS,
  assertConversationShape,
  directConversationPairKey,
} from "../packages/shared/src/index.ts";

function seedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m3.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function messagingSeedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m5.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/** Applies M5.1 conversation fixtures only. Calendar rows stay M5.2. */
export async function seedM5MessagingDataset(prisma: PrismaClient): Promise<void> {
  for (const planned of M5_SEED_CONVERSATIONS) {
    const org = M3_SEED_ORGANIZATIONS.find((row) => row.key === planned.orgKey);
    if (!org) {
      throw new Error(`Unknown org ${planned.orgKey} for conversation ${planned.key}`);
    }
    const organization = await prisma.organization.findUnique({ where: { slug: org.slug } });
    if (!organization) {
      throw new Error(`Organization ${org.slug} is not seeded`);
    }
    if (planned.kind === "DIRECT") {
      const [leftKey, rightKey] = planned.userKeys ?? [];
      const leftUser = M3_SEED_USERS.find((user) => user.key === leftKey);
      const rightUser = M3_SEED_USERS.find((user) => user.key === rightKey);
      if (!leftUser || !rightUser) {
        throw new Error(`Direct conversation ${planned.key} is missing user keys`);
      }
      const left = await prisma.organizationMembership.findFirst({
        where: { organizationId: organization.id, user: { email: leftUser.email } },
      });
      const right = await prisma.organizationMembership.findFirst({
        where: { organizationId: organization.id, user: { email: rightUser.email } },
      });
      if (!left || !right) {
        throw new Error(`Direct conversation ${planned.key} is missing memberships`);
      }
      const pair = directConversationPairKey(left.id, right.id);
      assertConversationShape({ kind: "DIRECT", participantLowId: pair.low, participantHighId: pair.high });
      const existing = await prisma.conversation.findFirst({
        where: {
          organizationId: organization.id,
          kind: "DIRECT",
          participantLowId: pair.low,
          participantHighId: pair.high,
        },
      });
      if (!existing) {
        await prisma.conversation.create({
          data: {
            id: messagingSeedUuid(`conversation:${planned.key}`),
            organizationId: organization.id,
            kind: "DIRECT",
            participantLowId: pair.low,
            participantHighId: pair.high,
          },
        });
      }
      continue;
    }
    if (!planned.teamKey) {
      throw new Error(`TEAM conversation ${planned.key} requires teamKey`);
    }
    const team = await prisma.team.findFirst({
      where: { id: seedUuid(`team:${planned.teamKey}`), organizationId: organization.id },
    });
    if (!team) {
      throw new Error(`Team ${planned.teamKey} is not seeded`);
    }
    assertConversationShape({ kind: "TEAM", teamId: team.id });
    const existing = await prisma.conversation.findFirst({
      where: { organizationId: organization.id, kind: "TEAM", teamId: team.id },
    });
    if (!existing) {
      await prisma.conversation.create({
        data: {
          id: messagingSeedUuid(`conversation:${planned.key}`),
          organizationId: organization.id,
          kind: "TEAM",
          teamId: team.id,
        },
      });
    }
  }
}
