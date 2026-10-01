import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { M3_SEED_ORGANIZATIONS, M3_SEED_PROJECTS, M3_SEED_USERS } from "../../packages/shared/src/m3-seed-design.ts";

function seedUuid(key: string): string {
  const digest = createHash("sha256").update(`amber.m3.seed.${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const expectedOrgA = seedUuid("org:org-a");
  const expectedOrgB = seedUuid("org:org-b");
  const expectedProjectA1 = seedUuid("project:project-a1");
  const expectedCoord = seedUuid("user:coord-a");

  const orgA = await prisma.organization.findUnique({ where: { id: expectedOrgA } });
  const orgB = await prisma.organization.findUnique({ where: { id: expectedOrgB } });
  const projectA1 = await prisma.project.findUnique({ where: { id: expectedProjectA1 } });
  const coord = await prisma.user.findUnique({ where: { id: expectedCoord } });

  if (!orgA || orgA.slug !== M3_SEED_ORGANIZATIONS[0].slug) {
    throw new Error(`org-a missing or slug mismatch (expected ${expectedOrgA})`);
  }
  if (!orgB || orgB.slug !== M3_SEED_ORGANIZATIONS[1].slug) {
    throw new Error(`org-b missing or slug mismatch (expected ${expectedOrgB})`);
  }
  if (!projectA1 || projectA1.name !== M3_SEED_PROJECTS[0].name) {
    throw new Error(`project-a1 missing or name mismatch (expected ${expectedProjectA1})`);
  }
  const coordEmail = M3_SEED_USERS.find((row) => row.key === "coord-a")?.email;
  if (!coord || coord.email !== coordEmail) {
    throw new Error(`coord-a missing or email mismatch (expected ${expectedCoord})`);
  }

  const orgCount = await prisma.organization.count({
    where: { slug: { in: M3_SEED_ORGANIZATIONS.map((row) => row.slug) } },
  });
  if (orgCount !== 2) {
    throw new Error(`expected 2 seed orgs, found ${orgCount}`);
  }

  console.log(`seed_org_a=${expectedOrgA}`);
  console.log(`seed_org_b=${expectedOrgB}`);
  console.log(`seed_project_a1=${expectedProjectA1}`);
  console.log(`seed_user_coord_a=${expectedCoord}`);
  console.log("deterministic_seed=ok");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
