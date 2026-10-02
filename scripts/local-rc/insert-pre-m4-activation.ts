import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { M4_SEED_PRE_M4_TASK } from "../../packages/shared/src/m4-seed-design.ts";

function seedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m3.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(
    20,
    32,
  )}`;
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const projectId = seedUuid("project:project-a1");
  const organizationId = seedUuid("org:org-a");
  const createdByUserId = seedUuid("user:coord-a");
  const id = seedUuid(`task:${M4_SEED_PRE_M4_TASK.key}`);
  await prisma.task.upsert({
    where: { id },
    create: {
      id,
      organizationId,
      projectId,
      title: M4_SEED_PRE_M4_TASK.title,
      status: "TODO",
      createdByUserId,
    },
    update: { title: M4_SEED_PRE_M4_TASK.title },
  });
  console.log(`pre_m4_task=${id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
