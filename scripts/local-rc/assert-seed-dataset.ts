import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { M3_SEED_ORGANIZATIONS, M3_SEED_PROJECTS, M3_SEED_USERS } from "../../packages/shared/src/m3-seed-design.ts";
import { M4_SEED_MILESTONES, M4_SEED_PRE_M4_TASK, M4_SEED_TASKS } from "../../packages/shared/src/m4-seed-design.ts";
import { M5_SEED_CALENDARS, M5_SEED_CONVERSATIONS } from "../../packages/shared/src/m5-seed-design.ts";

function seedUuid(namespace: string, key: string): string {
  const digest = createHash("sha256").update(`${namespace}${key}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function m3Id(key: string): string {
  return seedUuid("amber.m3.seed.", key);
}

function m5Id(key: string): string {
  return seedUuid("amber.m5.seed.", key);
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const expectedOrgA = m3Id("org:org-a");
  const expectedOrgB = m3Id("org:org-b");
  const expectedProjectA1 = m3Id("project:project-a1");
  const expectedCoord = m3Id("user:coord-a");

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

  const expectedTask = m3Id("task:task-a1-todo");
  const expectedMilestone = m3Id("ms:ms-a1-planned");
  const expectedIssue = m3Id("issue:iss-a1-grid");
  const task = await prisma.task.findUnique({ where: { id: expectedTask } });
  const milestone = await prisma.milestone.findUnique({ where: { id: expectedMilestone } });
  const issue = await prisma.issue.findUnique({ where: { id: expectedIssue } });
  if (!task || task.title !== M4_SEED_TASKS[0]?.title) {
    throw new Error(`M4 task-a1-todo missing or title mismatch (expected ${expectedTask})`);
  }
  if (!milestone || milestone.title !== M4_SEED_MILESTONES[0]?.title) {
    throw new Error(`M4 ms-a1-planned missing or title mismatch (expected ${expectedMilestone})`);
  }
  if (!issue) {
    throw new Error(`M4 iss-a1-grid missing (expected ${expectedIssue})`);
  }
  const taskCount = await prisma.task.count({
    where: { title: { in: M4_SEED_TASKS.map((row) => row.title) } },
  });
  if (taskCount !== M4_SEED_TASKS.length) {
    throw new Error(`expected ${M4_SEED_TASKS.length} M4 seed tasks, found ${taskCount}`);
  }
  const depCount = await prisma.taskDependency.count({
    where: { projectId: expectedProjectA1 },
  });
  if (depCount < 2) {
    throw new Error(`expected at least 2 FS seed dependencies on project-a1, found ${depCount}`);
  }
  const preM4 = await prisma.task.findFirst({
    where: { projectId: expectedProjectA1, title: M4_SEED_PRE_M4_TASK.title },
  });
  if (process.env.AMBER_REQUIRE_PRE_M4 === "1" && !preM4) {
    throw new Error("pre-M4 activation Task missing after upgrade re-seed");
  }
  const expectedCalendar = m5Id("cal:cal-owner-private");
  const calendar = await prisma.calendar.findUnique({ where: { id: expectedCalendar } });
  if (!calendar || calendar.name !== M5_SEED_CALENDARS[0]?.name) {
    throw new Error(`M5 cal-owner-private missing or name mismatch (expected ${expectedCalendar})`);
  }
  const calendarCount = await prisma.calendar.count({
    where: { name: { in: M5_SEED_CALENDARS.map((row) => row.name) } },
  });
  if (calendarCount !== M5_SEED_CALENDARS.length) {
    throw new Error(`expected ${M5_SEED_CALENDARS.length} M5 seed calendars, found ${calendarCount}`);
  }
  const expectedConversation = m5Id("conversation:dm-coord-contributor");
  const conversation = await prisma.conversation.findUnique({ where: { id: expectedConversation } });
  if (!conversation || conversation.kind !== "DIRECT") {
    throw new Error(`M5 dm-coord-contributor missing or kind mismatch (expected ${expectedConversation})`);
  }
  const conversationCount = await prisma.conversation.count();
  if (conversationCount !== M5_SEED_CONVERSATIONS.length) {
    throw new Error(`expected ${M5_SEED_CONVERSATIONS.length} M5 seed conversations, found ${conversationCount}`);
  }
  console.log(`seed_org_a=${expectedOrgA}`);
  console.log(`seed_org_b=${expectedOrgB}`);
  console.log(`seed_project_a1=${expectedProjectA1}`);
  console.log(`seed_user_coord_a=${expectedCoord}`);
  console.log(`seed_task_a1_todo=${expectedTask}`);
  console.log(`seed_ms_a1_planned=${expectedMilestone}`);
  console.log(`seed_issue_a1_grid=${expectedIssue}`);
  console.log(`pre_m4_activation_present=${preM4 ? "yes" : "no"}`);
  console.log(`seed_cal_owner_private=${expectedCalendar}`);
  console.log(`seed_dm_coord_contributor=${expectedConversation}`);
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
