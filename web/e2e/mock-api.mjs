#!/usr/bin/env node
/**
 * Local-only mock of session/org/project APIs for M3.2 Playwright.
 * Not a second AuthZ model — cookies are the session; org/project ids in the
 * URL are routing hints and are revalidated against the bound org.
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_API_PORT ?? 3001);
const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_A = "33333333-3333-4333-8333-333333333333";
const PROJECT_B = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

const orgs = [
  { id: ORG_A, name: "Vanguard Construct", slug: "vanguard", status: "ACTIVE", type: "INTERNAL" },
  { id: ORG_B, name: "Atlas Partner", slug: "atlas", status: "ACTIVE", type: "INTERNAL" },
];
const projects = [
  { id: PROJECT_A, name: "Residencial Aurora - Torre A", organizationId: ORG_A, archivedAt: null, status: "ACTIVE" },
  { id: PROJECT_B, name: "Campus Norte", organizationId: ORG_B, archivedAt: null, status: "ACTIVE" },
];

/** @type {Map<string, { orgId: string }>} */
const sessions = new Map();

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "content-type": "application/json", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function problem(res, status, code, detail) {
  json(res, status, {
    type: `https://amber.invalid/problems/${code.toLowerCase()}`,
    title: code,
    status,
    detail,
    code,
    correlationId: "e2e",
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function cookieToken(req) {
  const header = req.headers.cookie ?? "";
  const match = /(?:^|;\s*)amber_session=([^;]+)/.exec(header);
  return match?.[1];
}

function sessionView(session) {
  if (!session) {
    return {
      authenticated: false,
      userId: null,
      email: null,
      displayName: null,
      activeOrganizationId: null,
      membership: null,
      projectId: null,
      projectMembership: null,
      permissions: [],
      mfa: { required: false, enrolled: true, satisfied: true, freshnessOk: true },
    };
  }
  return {
    authenticated: true,
    userId: USER,
    email: "ada@example.com",
    displayName: "M. Santos",
    activeOrganizationId: session.orgId,
    membership: { id: "mem-1", status: "ACTIVE", type: "INTERNAL" },
    projectId: null,
    projectMembership: null,
    permissions: session.orgId ? ["organization.read", "project.create"] : [],
    mfa: { required: false, enrolled: true, satisfied: true, freshnessOk: true },
  };
}

const phasesA = [
  {
    id: "phase-brief",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    name: "Brief",
    description: "",
    sequence: 0,
    plannedStartAt: null,
    plannedEndAt: null,
    actualStartAt: "2025-01-01T00:00:00.000Z",
    actualEndAt: "2025-06-01T00:00:00.000Z",
    status: "COMPLETED",
    createdBy: USER,
    version: 1,
    archivedAt: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-06-01T00:00:00.000Z",
  },
  {
    id: "phase-concept",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    name: "Concept",
    description: "",
    sequence: 1,
    plannedStartAt: "2026-01-01T00:00:00.000Z",
    plannedEndAt: "2026-06-01T00:00:00.000Z",
    actualStartAt: null,
    actualEndAt: null,
    status: "ACTIVE",
    createdBy: USER,
    version: 1,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const workPackages = [
  {
    id: "wp-outline",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    phaseId: "phase-concept",
    deliverableId: "del-arch-001",
    disciplineId: "disc-arch",
    code: "WP-PLAN-001",
    title: "Outline programme",
    description: "Pacote operacional — não é uma tarefa",
    blockedReason: null,
    ownerProjectMembershipId: null,
    ownerTeamId: null,
    plannedStartAt: null,
    dueAt: null,
    status: "PLANNED",
    version: 1,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "wp-blocked",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    phaseId: "phase-concept",
    deliverableId: "del-arch-001",
    disciplineId: "disc-arch",
    code: "WP-HUB-BLOCK",
    title: "Blocked package",
    description: "Pacote bloqueado para o hub",
    blockedReason: "Waiting for survey",
    ownerProjectMembershipId: null,
    ownerTeamId: null,
    plannedStartAt: null,
    dueAt: "2026-09-01T00:00:00.000Z",
    status: "BLOCKED",
    version: 1,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const deliverables = [
  {
    id: "del-arch-001",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    phaseId: "phase-concept",
    disciplineId: "disc-arch",
    code: "DEL-ARCH-001",
    title: "Concept pack",
    description: "Resultado contratual — não é um arquivo",
    ownerProjectMembershipId: "pm-ada",
    ownerTeamId: null,
    plannedStartAt: "2026-01-01T00:00:00.000Z",
    dueAt: "2026-09-28T00:00:00.000Z",
    status: "PLANNED",
    progressPercent: 0,
    version: 1,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

const deliverableDocuments = [
  {
    id: "link-doc-arch",
    deliverableId: "del-arch-001",
    documentId: "doc-arch-001",
  },
];

const contextDocuments = [
  {
    id: "doc-arch-001",
    code: "DOC-ARCH-001",
    title: "Concept brief",
    status: "ACTIVE",
    currentRevision: {
      id: "rev-arch-001",
      revisionCode: "R1",
      status: "APPROVED",
      publishedAt: "2026-01-15T00:00:00.000Z",
    },
  },
];

function contextPayload(project, row, workPackageId) {
  const deliverableId = workPackageId ? row.deliverableId : row.id;
  const documents = deliverableDocuments
    .filter((link) => link.deliverableId === deliverableId)
    .map((link) => contextDocuments.find((doc) => doc.id === link.documentId))
    .filter(Boolean);
  return {
    organizationId: project.organizationId,
    projectId: project.id,
    deliverableId,
    workPackageId,
    phaseId: row.phaseId,
    canLinkDocuments: true,
    documents,
    tasks: [
      {
        id: workPackageId ? "task-wp-outline" : "task-del-outline",
        title: "Draft outline",
        status: "TODO",
        progressPercent: 0,
        dueDate: null,
        issueId: "issue-clash",
        milestoneId: "ms-concept",
        workPackageId: workPackageId ?? "wp-outline",
        deliverableId: "del-arch-001",
        phaseId: "phase-concept",
      },
    ],
    milestones: [
      {
        id: "ms-concept",
        title: "Concept freeze",
        status: "PLANNED",
        recordedStatus: "PLANNED",
        targetDate: "2026-06-01T00:00:00.000Z",
        phaseId: "phase-concept",
        deliverableId: "del-arch-001",
      },
    ],
    issues: [
      {
        id: "issue-clash",
        title: "Clash with structure",
        status: "OPEN",
        origin: "MANUAL",
        severity: "MEDIUM",
        priority: "P2",
      },
    ],
    gates: [
      {
        id: "gate-concept",
        name: "Concept gate",
        status: "NOT_READY",
        lastEvaluatedAt: null,
        releasedAt: null,
        releaseKind: null,
        readOnly: true,
      },
    ],
  };
}

function requireProject(session, projectId, res) {
  if (!session) {
    problem(res, 401, "SESSION_EXPIRED", "Session has expired");
    return null;
  }
  const project = projects.find((row) => row.id === projectId);
  if (!project || project.organizationId !== session.orgId) {
    problem(res, 403, "TENANCY_DENIED", "Project is not bound to the authorized Organization");
    return null;
  }
  return project;
}

const mockTasks = [];
const mockTaskHistory = new Map();
const mockDependencies = [];

function seedMockTasks() {
  if (mockTasks.length > 0) {
    return;
  }
  const now = Date.now();
  mockTasks.push(
    {
      id: "task-grid",
      organizationId: ORG_A,
      projectId: PROJECT_A,
      issueId: "iss-grid",
      milestoneId: "ms-concept",
      phaseId: "phase-concept",
      deliverableId: "del-arch-001",
      workPackageId: "wp-outline",
      title: "Atualizar malha estrutural",
      description: "Task ≠ Issue",
      status: "IN_PROGRESS",
      late: false,
      kanbanColumn: "EM_ANDAMENTO",
      priority: "HIGH",
      responsibleDisciplineId: "disc-str",
      assigneeUserId: USER,
      dueDate: new Date(now + 86400000).toISOString(),
      plannedStartAt: new Date(now - 86400000).toISOString(),
      estimatedMinutes: 120,
      progressPercent: 40,
      startedAt: new Date(now - 3600000).toISOString(),
      completedAt: null,
      blockedReason: null,
      version: 1,
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now).toISOString(),
      previews: {
        issue: { id: "iss-grid", title: "Choque de malha", status: "OPEN", relation: "issue" },
        phase: { id: "phase-concept", name: "Concept" },
        deliverable: { id: "del-arch-001", code: "DEL-ARCH-001", title: "Architectural pack" },
        workPackage: { id: "wp-outline", title: "Outline programme", code: "WP-PLAN-001" },
        milestone: { id: "ms-concept", title: "Concept freeze", recordedStatus: "PLANNED", status: "PLANNED" },
        assignee: { userId: USER, displayName: "M. Santos" },
      },
    },
    {
      id: "task-late",
      organizationId: ORG_A,
      projectId: PROJECT_A,
      issueId: null,
      milestoneId: null,
      phaseId: "phase-concept",
      deliverableId: null,
      workPackageId: null,
      title: "Emitir planta atrasada",
      description: "",
      status: "TODO",
      late: true,
      kanbanColumn: "EM_RISCO",
      priority: "NORMAL",
      responsibleDisciplineId: "disc-arch",
      assigneeUserId: null,
      dueDate: "2020-01-01T00:00:00.000Z",
      plannedStartAt: null,
      estimatedMinutes: null,
      progressPercent: 0,
      startedAt: null,
      completedAt: null,
      blockedReason: null,
      version: 1,
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      previews: {
        phase: { id: "phase-concept", name: "Concept" },
      },
    },
    {
      id: "task-survey",
      organizationId: ORG_A,
      projectId: PROJECT_A,
      issueId: null,
      milestoneId: null,
      phaseId: "phase-concept",
      deliverableId: null,
      workPackageId: null,
      title: "Levantamento topográfico",
      description: "",
      status: "TODO",
      late: false,
      kanbanColumn: "PLANEJADAS",
      priority: "NORMAL",
      responsibleDisciplineId: null,
      assigneeUserId: null,
      dueDate: null,
      plannedStartAt: null,
      estimatedMinutes: null,
      progressPercent: 0,
      startedAt: null,
      completedAt: null,
      blockedReason: null,
      version: 1,
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      previews: { phase: { id: "phase-concept", name: "Concept" } },
    },
    {
      id: "task-waiting",
      organizationId: ORG_A,
      projectId: PROJECT_A,
      issueId: null,
      milestoneId: null,
      phaseId: "phase-concept",
      deliverableId: null,
      workPackageId: null,
      title: "Lançar fundações",
      description: "",
      status: "TODO",
      late: false,
      kanbanColumn: "PLANEJADAS",
      priority: "NORMAL",
      responsibleDisciplineId: null,
      assigneeUserId: null,
      dueDate: null,
      plannedStartAt: null,
      estimatedMinutes: null,
      progressPercent: 0,
      startedAt: null,
      completedAt: null,
      blockedReason: null,
      version: 1,
      createdAt: "2026-01-04T00:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
      previews: { phase: { id: "phase-concept", name: "Concept" } },
    },
    {
      id: "task-blocked",
      organizationId: ORG_A,
      projectId: PROJECT_A,
      issueId: null,
      milestoneId: null,
      phaseId: "phase-concept",
      deliverableId: null,
      workPackageId: null,
      title: "Validar furações estruturais",
      description: "",
      status: "BLOCKED",
      late: false,
      kanbanColumn: "BLOQUEADAS",
      priority: "HIGH",
      responsibleDisciplineId: "disc-str",
      assigneeUserId: USER,
      dueDate: new Date(now + 172800000).toISOString(),
      plannedStartAt: new Date(now - 86400000).toISOString(),
      estimatedMinutes: 60,
      progressPercent: 10,
      startedAt: new Date(now - 7200000).toISOString(),
      completedAt: null,
      blockedReason: "Aguardando decisão estrutural",
      version: 1,
      createdAt: "2026-01-05T00:00:00.000Z",
      updatedAt: "2026-01-05T00:00:00.000Z",
      previews: {
        phase: { id: "phase-concept", name: "Concept" },
        assignee: { userId: USER, displayName: "M. Santos" },
      },
    },
  );
  mockDependencies.push({
    id: "dep-survey-waiting",
    organizationId: ORG_A,
    projectId: PROJECT_A,
    predecessorTaskId: "task-survey",
    successorTaskId: "task-waiting",
    type: "FINISH_TO_START",
    createdByUserId: USER,
    createdAt: "2026-01-04T00:00:00.000Z",
    predecessor: { id: "task-survey", title: "Levantamento topográfico", status: "TODO" },
    successor: { id: "task-waiting", title: "Lançar fundações", status: "TODO" },
  });
  mockTaskHistory.set("task-grid", [
    { id: "h-grid-1", eventType: "TASK_CREATED", actorUserId: USER, createdAt: "2026-01-01T00:00:00.000Z", payload: {} },
    { id: "h-grid-2", eventType: "TASK_STATUS_CHANGED", actorUserId: USER, createdAt: "2026-01-02T00:00:00.000Z", payload: { to: "IN_PROGRESS" } },
  ]);
}

function graphForTask(taskId) {
  const predecessors = mockDependencies
    .filter((edge) => edge.successorTaskId === taskId)
    .map((edge) => ({
      dependencyId: edge.id,
      taskId: edge.predecessorTaskId,
      title: edge.predecessor?.title,
      status: edge.predecessor?.status ?? mockTasks.find((row) => row.id === edge.predecessorTaskId)?.status ?? "TODO",
    }));
  const successors = mockDependencies
    .filter((edge) => edge.predecessorTaskId === taskId)
    .map((edge) => ({
      dependencyId: edge.id,
      taskId: edge.successorTaskId,
      title: edge.successor?.title,
      status: edge.successor?.status ?? mockTasks.find((row) => row.id === edge.successorTaskId)?.status ?? "TODO",
    }));
  const startBlockers = predecessors
    .filter((item) => item.status !== "DONE")
    .map((item) => ({
      predecessorTaskId: item.taskId,
      status: item.status,
      title: item.title,
      message: `Predecessor is ${item.status}, not DONE`,
    }));
  return {
    predecessors,
    successors,
    startBlockers,
    dependencyStartBlocked: startBlockers.length > 0,
  };
}

function refreshDerived(task) {
  const terminal = task.status === "DONE" || task.status === "CANCELLED";
  task.late = Boolean(
    !terminal && task.dueDate && new Date(task.dueDate).getTime() < Date.now(),
  );
  if (task.status === "DONE" || task.status === "CANCELLED") {
    task.kanbanColumn = null;
  } else if (task.status === "BLOCKED") {
    task.kanbanColumn = "BLOQUEADAS";
  } else if (task.late) {
    task.kanbanColumn = "EM_RISCO";
  } else if (task.status === "TODO") {
    task.kanbanColumn = "PLANEJADAS";
  } else if (task.status === "IN_PROGRESS") {
    task.kanbanColumn = "EM_ANDAMENTO";
  } else {
    task.kanbanColumn = null;
  }
  return task;
}

function withGraph(task) {
  return { ...refreshDerived({ ...task }), ...graphForTask(task.id) };
}

function kanbanCounts(rows) {
  const counts = { PLANEJADAS: 0, EM_ANDAMENTO: 0, EM_RISCO: 0, BLOQUEADAS: 0 };
  for (const row of rows) {
    refreshDerived(row);
    if (row.kanbanColumn) {
      counts[row.kanbanColumn] += 1;
    }
  }
  return counts;
}

function appendHistory(taskId, eventType) {
  const list = mockTaskHistory.get(taskId) ?? [];
  list.push({
    id: `h-${taskId}-${list.length + 1}`,
    eventType,
    actorUserId: USER,
    createdAt: new Date().toISOString(),
    payload: {},
  });
  mockTaskHistory.set(taskId, list);
}

const server = http.createServer(async (req, res) => {
  seedMockTasks();
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const token = cookieToken(req);
  const session = token ? sessions.get(token) : undefined;

  if (path === "/api/v1/health") {
    json(res, 200, { ok: true });
    return;
  }

  if (path === "/api/v1/auth/login" && req.method === "POST") {
    const body = await readBody(req);
    if (typeof body.password !== "string" || body.password.length < 12) {
      problem(res, 401, "INVALID_CREDENTIALS", "Invalid email or password");
      return;
    }
    const next = `e2e-${Date.now()}`;
    sessions.set(next, { orgId: ORG_A });
    json(
      res,
      200,
      { ...sessionView({ orgId: ORG_A }), status: "authenticated" },
      { "set-cookie": `amber_session=${next}; Path=/; HttpOnly; SameSite=Lax` },
    );
    return;
  }

  if (path === "/api/v1/auth/logout" && req.method === "POST") {
    if (token) {
      sessions.delete(token);
    }
    json(res, 200, { ok: true }, { "set-cookie": "amber_session=; Path=/; Max-Age=0" });
    return;
  }

  if (path === "/api/v1/auth/session" && req.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (projectId && session) {
      const project = projects.find((row) => row.id === projectId);
      if (!project || project.organizationId !== session.orgId) {
        problem(res, 403, "TENANCY_DENIED", "Project is not bound to the authorized Organization");
        return;
      }
    }
    json(res, 200, sessionView(session));
    return;
  }

  if (path === "/api/v1/auth/active-organization" && req.method === "POST") {
    if (!session) {
      problem(res, 401, "SESSION_EXPIRED", "Session has expired");
      return;
    }
    const body = await readBody(req);
    const org = orgs.find((row) => row.id === body.organizationId);
    if (!org) {
      problem(res, 403, "TENANCY_DENIED", "Org-switch denied: no membership for target Organization");
      return;
    }
    session.orgId = org.id;
    json(res, 200, { activeOrganizationId: org.id });
    return;
  }

  if (path === "/api/v1/organizations" && req.method === "GET") {
    if (!session) {
      problem(res, 401, "SESSION_EXPIRED", "Session has expired");
      return;
    }
    json(
      res,
      200,
      orgs.map((org) => ({ ...org, membershipId: `m-${org.id}`, active: org.id === session.orgId })),
    );
    return;
  }

  if (path === "/api/v1/projects" && req.method === "GET") {
    if (!session) {
      problem(res, 401, "SESSION_EXPIRED", "Session has expired");
      return;
    }
    if (!session.orgId) {
      problem(res, 403, "TENANCY_DENIED", "Session has no active Organization; org-switch required");
      return;
    }
    json(
      res,
      200,
      projects.filter((row) => row.organizationId === session.orgId),
    );
    return;
  }

  const projectMatch = /^\/api\/v1\/projects\/([^/]+)$/.exec(path);
  if (projectMatch && req.method === "GET") {
    if (!session) {
      problem(res, 401, "SESSION_EXPIRED", "Session has expired");
      return;
    }
    const project = projects.find((row) => row.id === projectMatch[1]);
    if (!project || project.organizationId !== session.orgId) {
      problem(res, 403, "TENANCY_DENIED", "Project is not bound to the authorized Organization");
      return;
    }
    json(res, 200, {
      ...project,
      membership: { id: `pm-${project.id}`, status: "ACTIVE" },
      roles: [{ templateKey: "PROJECT_COORDINATOR" }],
      permissions: [
        "project.read",
        "document.read",
        "gate.read",
        "phase.create",
        "phase.update",
        "phase.complete",
        "deliverable.create",
        "deliverable.update",
        "deliverable.assign",
        "deliverable.approve",
        "deliverable.deliver",
        "work_package.create",
        "work_package.update",
        "work_package.complete",
        "task.create",
        "task.update",
        "task.assign",
        "task.complete",
      ],
    });
    return;
  }

  const disciplineMatch = /^\/api\/v1\/organizations\/([^/]+)\/disciplines$/.exec(path);
  if (disciplineMatch && req.method === "GET") {
    if (!session) {
      problem(res, 401, "SESSION_EXPIRED", "Session has expired");
      return;
    }
    if (disciplineMatch[1] !== session.orgId) {
      problem(res, 403, "TENANCY_DENIED", "Path organizationId does not match session-bound Organization");
      return;
    }
    json(res, 200, {
      items: session.orgId === ORG_A
        ? [
            { id: "disc-arch", organizationId: ORG_A, code: "ARCH", name: "Architecture", active: true, sortOrder: 1 },
            { id: "disc-str", organizationId: ORG_A, code: "STR", name: "Structure", active: true, sortOrder: 2 },
          ]
        : [{ id: "disc-b-arch", organizationId: ORG_B, code: "ARCH", name: "Architecture", active: true, sortOrder: 1 }],
    });
    return;
  }

  const phaseListMatch = /^\/api\/v1\/projects\/([^/]+)\/phases$/.exec(path);
  if (phaseListMatch && req.method === "GET") {
    if (!session) {
      problem(res, 401, "SESSION_EXPIRED", "Session has expired");
      return;
    }
    const project = projects.find((row) => row.id === phaseListMatch[1]);
    if (!project || project.organizationId !== session.orgId) {
      problem(res, 403, "TENANCY_DENIED", "Project is not bound to the authorized Organization");
      return;
    }
    json(res, 200, {
      items: project.id === PROJECT_A
        ? [
            {
              id: "phase-brief",
              organizationId: ORG_A,
              projectId: PROJECT_A,
              name: "Brief",
              description: "",
              sequence: 0,
              plannedStartAt: null,
              plannedEndAt: null,
              actualStartAt: "2025-01-01T00:00:00.000Z",
              actualEndAt: "2025-06-01T00:00:00.000Z",
              status: "COMPLETED",
              createdBy: USER,
              version: 1,
              archivedAt: null,
              createdAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-06-01T00:00:00.000Z",
            },
            {
              id: "phase-concept",
              organizationId: ORG_A,
              projectId: PROJECT_A,
              name: "Concept",
              description: "",
              sequence: 1,
              plannedStartAt: "2026-01-01T00:00:00.000Z",
              plannedEndAt: "2026-06-01T00:00:00.000Z",
              actualStartAt: "2026-01-01T00:00:00.000Z",
              actualEndAt: null,
              status: "ACTIVE",
              createdBy: USER,
              version: 1,
              archivedAt: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ]
        : [],
      nextCursor: null,
    });
    return;
  }

  const phaseOneMatch = /^\/api\/v1\/projects\/([^/]+)\/phases\/([^/]+)$/.exec(path);
  if (phaseOneMatch && req.method === "GET") {
    if (!session) {
      problem(res, 401, "SESSION_EXPIRED", "Session has expired");
      return;
    }
    const project = projects.find((row) => row.id === phaseOneMatch[1]);
    if (!project || project.organizationId !== session.orgId) {
      problem(res, 403, "TENANCY_DENIED", "Project is not bound to the authorized Organization");
      return;
    }
    if (phaseOneMatch[1] !== PROJECT_A || !["phase-brief", "phase-concept"].includes(phaseOneMatch[2])) {
      problem(res, 403, "TENANCY_DENIED", "Phase is not bound to the authorized Project");
      return;
    }
    json(res, 200, {
      id: phaseOneMatch[2],
      organizationId: ORG_A,
      projectId: PROJECT_A,
      name: phaseOneMatch[2] === "phase-brief" ? "Brief" : "Concept",
      description: "",
      sequence: phaseOneMatch[2] === "phase-brief" ? 0 : 1,
      plannedStartAt: null,
      plannedEndAt: null,
      actualStartAt: null,
      actualEndAt: null,
      status: phaseOneMatch[2] === "phase-brief" ? "COMPLETED" : "ACTIVE",
      createdBy: USER,
      version: 1,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    return;
  }

  const membersMatch = /^\/api\/v1\/projects\/([^/]+)\/members$/.exec(path);
  if (membersMatch && req.method === "GET") {
    const project = requireProject(session, membersMatch[1], res);
    if (!project) {
      return;
    }
    json(res, 200, [
      {
        id: "pm-ada",
        status: "ACTIVE",
        userId: USER,
        email: "ada@example.com",
        displayName: "M. Santos",
      },
    ]);
    return;
  }

  const teamsMatch = /^\/api\/v1\/organizations\/([^/]+)\/teams$/.exec(path);
  if (teamsMatch && req.method === "GET") {
    if (!session) {
      problem(res, 401, "SESSION_EXPIRED", "Session has expired");
      return;
    }
    if (teamsMatch[1] !== session.orgId) {
      problem(res, 403, "TENANCY_DENIED", "Path organizationId does not match session-bound Organization");
      return;
    }
    json(res, 200, {
      items:
        session.orgId === ORG_A
          ? [{ id: "team-structure", organizationId: ORG_A, name: "Alpha Structure Team" }]
          : [{ id: "team-b", organizationId: ORG_B, name: "Beta Team" }],
    });
    return;
  }

  const deliverableListMatch = /^\/api\/v1\/projects\/([^/]+)\/deliverables$/.exec(path);
  if (deliverableListMatch) {
    const project = requireProject(session, deliverableListMatch[1], res);
    if (!project) {
      return;
    }
    if (req.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const status = url.searchParams.get("status");
      const phaseId = url.searchParams.get("phaseId");
      const disciplineId = url.searchParams.get("disciplineId");
      const statuses = status ? status.split(",") : [];
      const rows = deliverables.filter((row) => {
        if (row.projectId !== project.id || row.archivedAt) {
          return false;
        }
        if (q && !`${row.code} ${row.title}`.toLowerCase().includes(q)) {
          return false;
        }
        if (statuses.length && !statuses.includes(row.status)) {
          return false;
        }
        if (phaseId && row.phaseId !== phaseId) {
          return false;
        }
        if (disciplineId && row.disciplineId !== disciplineId) {
          return false;
        }
        return true;
      });
      json(res, 200, { items: rows, nextCursor: null });
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const created = {
        id: `del-${Date.now()}`,
        organizationId: project.organizationId,
        projectId: project.id,
        phaseId: body.phaseId,
        disciplineId: body.disciplineId,
        code: body.code,
        title: body.title,
        description: body.description ?? "",
        ownerProjectMembershipId: body.ownerProjectMembershipId ?? null,
        ownerTeamId: body.ownerTeamId ?? null,
        plannedStartAt: body.plannedStartAt ?? null,
        dueAt: body.dueAt ?? null,
        status: "PLANNED",
        progressPercent: body.progressPercent ?? 0,
        version: 1,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      deliverables.push(created);
      json(res, 201, created);
      return;
    }
  }

  const deliverableContext = /^\/api\/v1\/projects\/([^/]+)\/deliverables\/([^/]+)\/context$/.exec(path);
  if (deliverableContext && req.method === "GET") {
    const project = requireProject(session, deliverableContext[1], res);
    if (!project) {
      return;
    }
    const row = deliverables.find((item) => item.id === deliverableContext[2] && item.projectId === project.id);
    if (!row) {
      problem(res, 403, "TENANCY_DENIED", "Deliverable is not bound to the authorized Project");
      return;
    }
    json(res, 200, contextPayload(project, row, null));
    return;
  }

  const deliverableDocumentLink = /^\/api\/v1\/projects\/([^/]+)\/deliverables\/([^/]+)\/documents$/.exec(path);
  if (deliverableDocumentLink && req.method === "POST") {
    const project = requireProject(session, deliverableDocumentLink[1], res);
    if (!project) {
      return;
    }
    const row = deliverables.find((item) => item.id === deliverableDocumentLink[2] && item.projectId === project.id);
    if (!row) {
      problem(res, 403, "TENANCY_DENIED", "Deliverable is not bound to the authorized Project");
      return;
    }
    const body = await readBody(req);
    if (body.status) {
      problem(res, 409, "OPERATIONS_STATE", "Document status is not mutated via Ops");
      return;
    }
    const documentId = body.documentId;
    const known = contextDocuments.find((doc) => doc.id === documentId);
    if (!known) {
      problem(res, 403, "TENANCY_DENIED", "Document is not bound to the authorized Project");
      return;
    }
    if (!deliverableDocuments.some((link) => link.deliverableId === row.id && link.documentId === documentId)) {
      deliverableDocuments.push({ id: `link-${Date.now()}`, deliverableId: row.id, documentId });
    }
    json(res, 201, { deliverableId: row.id, documentId });
    return;
  }

  const deliverableUnlink = /^\/api\/v1\/projects\/([^/]+)\/deliverables\/([^/]+)\/documents\/([^/]+)\/unlink$/.exec(path);
  if (deliverableUnlink && req.method === "POST") {
    const project = requireProject(session, deliverableUnlink[1], res);
    if (!project) {
      return;
    }
    const idx = deliverableDocuments.findIndex(
      (link) => link.deliverableId === deliverableUnlink[2] && link.documentId === deliverableUnlink[3],
    );
    if (idx === -1) {
      problem(res, 403, "TENANCY_DENIED", "Document is not bound to the authorized Deliverable");
      return;
    }
    const existing = deliverableDocuments[idx];
    deliverableDocuments.splice(idx, 1);
    json(res, 200, { ok: true, deliverableId: existing.deliverableId, documentId: existing.documentId });
    return;
  }

  const deliverableAction = /^\/api\/v1\/projects\/([^/]+)\/deliverables\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (deliverableAction) {
    const project = requireProject(session, deliverableAction[1], res);
    if (!project) {
      return;
    }
    const row = deliverables.find((item) => item.id === deliverableAction[2] && item.projectId === project.id);
    if (!row) {
      problem(res, 403, "TENANCY_DENIED", "Deliverable is not bound to the authorized Project");
      return;
    }
    const action = deliverableAction[3];
    if (req.method === "GET" && !action) {
      json(res, 200, row);
      return;
    }
    if (req.method === "PATCH" && !action) {
      const body = await readBody(req);
      Object.assign(row, {
        title: body.title ?? row.title,
        code: body.code ?? row.code,
        description: body.description ?? row.description,
        phaseId: body.phaseId ?? row.phaseId,
        disciplineId: body.disciplineId ?? row.disciplineId,
        plannedStartAt: body.plannedStartAt !== undefined ? body.plannedStartAt : row.plannedStartAt,
        dueAt: body.dueAt !== undefined ? body.dueAt : row.dueAt,
        progressPercent: body.progressPercent !== undefined ? body.progressPercent : row.progressPercent,
        version: row.version + 1,
        updatedAt: new Date().toISOString(),
      });
      json(res, 200, row);
      return;
    }
    if (req.method === "POST" && action) {
      const body = await readBody(req);
      if (action === "assign") {
        row.ownerProjectMembershipId = body.ownerProjectMembershipId ?? null;
        row.ownerTeamId = body.ownerTeamId ?? null;
      } else if (action === "unassign") {
        row.ownerProjectMembershipId = null;
        row.ownerTeamId = null;
      } else if (action === "start") {
        row.status = "IN_PROGRESS";
      } else if (action === "submit-for-review") {
        row.status = "IN_REVIEW";
      } else if (action === "approve") {
        row.status = "APPROVED";
      } else if (action === "deliver") {
        row.status = "DELIVERED";
      } else if (action === "cancel") {
        row.status = "CANCELLED";
      } else if (action === "archive") {
        row.archivedAt = new Date().toISOString();
      }
      row.version += 1;
      row.updatedAt = new Date().toISOString();
      json(res, 200, row);
      return;
    }
  }

  const workPackageListMatch = /^\/api\/v1\/projects\/([^/]+)\/work-packages$/.exec(path);
  if (workPackageListMatch) {
    const project = requireProject(session, workPackageListMatch[1], res);
    if (!project) {
      return;
    }
    if (req.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const status = url.searchParams.get("status");
      const phaseId = url.searchParams.get("phaseId");
      const deliverableId = url.searchParams.get("deliverableId");
      const disciplineId = url.searchParams.get("disciplineId");
      const statuses = status ? status.split(",") : [];
      const rows = workPackages.filter((row) => {
        if (row.projectId !== project.id || row.archivedAt) {
          return false;
        }
        if (q && !`${row.code ?? ""} ${row.title}`.toLowerCase().includes(q)) {
          return false;
        }
        if (statuses.length && !statuses.includes(row.status)) {
          return false;
        }
        if (phaseId && row.phaseId !== phaseId) {
          return false;
        }
        if (deliverableId && row.deliverableId !== deliverableId) {
          return false;
        }
        if (disciplineId && row.disciplineId !== disciplineId) {
          return false;
        }
        return true;
      });
      json(res, 200, { items: rows, nextCursor: null });
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const created = {
        id: `wp-${Date.now()}`,
        organizationId: project.organizationId,
        projectId: project.id,
        phaseId: body.phaseId,
        deliverableId: body.deliverableId ?? null,
        disciplineId: body.disciplineId ?? null,
        code: body.code ?? null,
        title: body.title,
        description: body.description ?? "",
        blockedReason: null,
        ownerProjectMembershipId: body.ownerProjectMembershipId ?? null,
        ownerTeamId: body.ownerTeamId ?? null,
        plannedStartAt: body.plannedStartAt ?? null,
        dueAt: body.dueAt ?? null,
        status: "PLANNED",
        version: 1,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      workPackages.push(created);
      json(res, 201, created);
      return;
    }
  }

  const workPackageContext = /^\/api\/v1\/projects\/([^/]+)\/work-packages\/([^/]+)\/context$/.exec(path);
  if (workPackageContext && req.method === "GET") {
    const project = requireProject(session, workPackageContext[1], res);
    if (!project) {
      return;
    }
    const row = workPackages.find((item) => item.id === workPackageContext[2] && item.projectId === project.id);
    if (!row) {
      problem(res, 403, "TENANCY_DENIED", "WorkPackage is not bound to the authorized Project");
      return;
    }
    json(res, 200, contextPayload(project, row, row.id));
    return;
  }

  const workPackageAction = /^\/api\/v1\/projects\/([^/]+)\/work-packages\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (workPackageAction) {
    const project = requireProject(session, workPackageAction[1], res);
    if (!project) {
      return;
    }
    const row = workPackages.find((item) => item.id === workPackageAction[2] && item.projectId === project.id);
    if (!row) {
      problem(res, 403, "TENANCY_DENIED", "WorkPackage is not bound to the authorized Project");
      return;
    }
    const action = workPackageAction[3];
    if (req.method === "GET" && !action) {
      json(res, 200, row);
      return;
    }
    if (req.method === "PATCH" && !action) {
      const body = await readBody(req);
      Object.assign(row, {
        title: body.title ?? row.title,
        code: body.code !== undefined ? body.code : row.code,
        description: body.description ?? row.description,
        phaseId: body.phaseId ?? row.phaseId,
        disciplineId: body.disciplineId !== undefined ? body.disciplineId : row.disciplineId,
        plannedStartAt: body.plannedStartAt !== undefined ? body.plannedStartAt : row.plannedStartAt,
        dueAt: body.dueAt !== undefined ? body.dueAt : row.dueAt,
        version: row.version + 1,
        updatedAt: new Date().toISOString(),
      });
      json(res, 200, row);
      return;
    }
    if (req.method === "POST" && action) {
      const body = await readBody(req);
      if (action === "assign") {
        row.ownerProjectMembershipId = body.ownerProjectMembershipId ?? null;
        row.ownerTeamId = body.ownerTeamId ?? null;
      } else if (action === "unassign") {
        row.ownerProjectMembershipId = null;
        row.ownerTeamId = null;
      } else if (action === "activate") {
        row.status = "ACTIVE";
      } else if (action === "block") {
        row.status = "BLOCKED";
        row.blockedReason = body.blockedReason;
      } else if (action === "unblock") {
        row.status = "ACTIVE";
        row.blockedReason = null;
      } else if (action === "complete") {
        row.status = "DONE";
      } else if (action === "cancel") {
        row.status = "CANCELLED";
      } else if (action === "archive") {
        row.archivedAt = new Date().toISOString();
      } else if (action === "associate") {
        row.deliverableId = body.deliverableId ?? null;
      } else if (action === "disassociate") {
        row.deliverableId = null;
      }
      row.version += 1;
      row.updatedAt = new Date().toISOString();
      json(res, 200, row);
      return;
    }
  }

  const issueListMatch = /^\/api\/v1\/projects\/([^/]+)\/issues$/.exec(path);
  if (issueListMatch && req.method === "GET") {
    const project = requireProject(session, issueListMatch[1], res);
    if (!project) {
      return;
    }
    json(res, 200, project.id === PROJECT_A ? [{ id: "iss-grid", title: "Choque de malha", status: "OPEN" }] : []);
    return;
  }

  const milestoneListMatch = /^\/api\/v1\/projects\/([^/]+)\/milestones$/.exec(path);
  if (milestoneListMatch && req.method === "GET") {
    const project = requireProject(session, milestoneListMatch[1], res);
    if (!project) {
      return;
    }
    json(
      res,
      200,
      project.id === PROJECT_A
        ? [{ id: "ms-concept", title: "Concept freeze", recordedStatus: "PLANNED", status: "PLANNED", targetDate: null, phaseId: "phase-concept", deliverableId: null }]
        : [],
    );
    return;
  }

  const taskCollection = /^\/api\/v1\/projects\/([^/]+)\/tasks$/.exec(path);
  if (taskCollection) {
    const project = requireProject(session, taskCollection[1], res);
    if (!project) {
      return;
    }
    if (req.method === "GET") {
      json(res, 200, mockTasks.filter((row) => row.projectId === project.id));
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (!String(body.title ?? "").trim()) {
        problem(res, 409, "PLANNING_STATE", "Task title is required");
        return;
      }
      const created = {
        id: `task-${Date.now()}`,
        organizationId: project.organizationId,
        projectId: project.id,
        issueId: body.issueId ?? null,
        milestoneId: body.milestoneId ?? null,
        phaseId: body.phaseId ?? null,
        deliverableId: body.deliverableId ?? null,
        workPackageId: body.workPackageId ?? null,
        title: String(body.title).trim(),
        description: body.description ?? "",
        status: "TODO",
        late: false,
        kanbanColumn: "PLANEJADAS",
        priority: body.priority ?? null,
        responsibleDisciplineId: body.responsibleDisciplineId ?? null,
        assigneeUserId: null,
        dueDate: body.dueDate ?? null,
        plannedStartAt: body.plannedStartAt ?? null,
        estimatedMinutes: body.estimatedMinutes ?? null,
        progressPercent: body.progressPercent ?? null,
        startedAt: null,
        completedAt: null,
        blockedReason: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        previews: {},
      };
      refreshDerived(created);
      mockTasks.push(created);
      appendHistory(created.id, "TASK_CREATED");
      json(res, 201, created);
      return;
    }
  }

  const dependencyItem = /^\/api\/v1\/projects\/([^/]+)\/tasks\/([^/]+)\/dependencies\/([^/]+)$/.exec(path);
  if (dependencyItem) {
    const project = requireProject(session, dependencyItem[1], res);
    if (!project) {
      return;
    }
    const task = mockTasks.find((row) => row.id === dependencyItem[2] && row.projectId === project.id);
    const edge = mockDependencies.find((row) => row.id === dependencyItem[3] && row.projectId === project.id);
    if (!task || !edge || (edge.predecessorTaskId !== task.id && edge.successorTaskId !== task.id)) {
      problem(res, 403, "TENANCY_DENIED", "Task dependency is not bound to the authorized Task");
      return;
    }
    if (req.method === "DELETE") {
      const index = mockDependencies.findIndex((row) => row.id === edge.id);
      if (index >= 0) {
        mockDependencies.splice(index, 1);
      }
      appendHistory(task.id, "TASK_DEPENDENCY_REMOVED");
      json(res, 200, edge);
      return;
    }
    problem(res, 405, "METHOD_NOT_ALLOWED", "Unsupported dependency method");
    return;
  }

  const dependencyCollection = /^\/api\/v1\/projects\/([^/]+)\/tasks\/([^/]+)\/dependencies$/.exec(path);
  if (dependencyCollection) {
    const project = requireProject(session, dependencyCollection[1], res);
    if (!project) {
      return;
    }
    const task = mockTasks.find((row) => row.id === dependencyCollection[2] && row.projectId === project.id);
    if (!task) {
      problem(res, 403, "TENANCY_DENIED", "Task is not bound to the authorized Project");
      return;
    }
    if (req.method === "GET") {
      json(
        res,
        200,
        mockDependencies.filter(
          (edge) =>
            edge.projectId === project.id && (edge.predecessorTaskId === task.id || edge.successorTaskId === task.id),
        ),
      );
      return;
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (body.type && body.type !== "FINISH_TO_START") {
        problem(res, 409, "PLANNING_STATE", "Only finish-to-start Task dependencies are supported");
        return;
      }
      if (body.predecessorTaskId === task.id) {
        problem(res, 409, "PLANNING_STATE", "A Task cannot depend on itself");
        return;
      }
      const predecessor = mockTasks.find((row) => row.id === body.predecessorTaskId && row.projectId === project.id);
      if (!predecessor) {
        problem(res, 403, "TENANCY_DENIED", "Task dependency endpoint is not bound to the authorized Project");
        return;
      }
      if (mockDependencies.some((edge) => edge.predecessorTaskId === predecessor.id && edge.successorTaskId === task.id)) {
        problem(res, 409, "PLANNING_STATE", "Task dependency already exists");
        return;
      }
      if (["IN_PROGRESS", "BLOCKED", "DONE"].includes(task.status) && predecessor.status !== "DONE") {
        problem(res, 409, "PLANNING_STATE", "Cannot add an unfinished prerequisite to a Task that has already started or completed");
        return;
      }
      const created = {
        id: `dep-${Date.now()}`,
        organizationId: project.organizationId,
        projectId: project.id,
        predecessorTaskId: predecessor.id,
        successorTaskId: task.id,
        type: "FINISH_TO_START",
        createdByUserId: USER,
        createdAt: new Date().toISOString(),
        predecessor: { id: predecessor.id, title: predecessor.title, status: predecessor.status },
        successor: { id: task.id, title: task.title, status: task.status },
      };
      mockDependencies.push(created);
      appendHistory(task.id, "TASK_DEPENDENCY_CREATED");
      json(res, 201, created);
      return;
    }
  }

  const candidateMatch = /^\/api\/v1\/projects\/([^/]+)\/tasks\/([^/]+)\/dependency-candidates$/.exec(path);
  if (candidateMatch) {
    const project = requireProject(session, candidateMatch[1], res);
    if (!project) {
      return;
    }
    const task = mockTasks.find((row) => row.id === candidateMatch[2] && row.projectId === project.id);
    if (!task) {
      problem(res, 403, "TENANCY_DENIED", "Task is not bound to the authorized Project");
      return;
    }
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const taken = new Set(
      mockDependencies.filter((edge) => edge.successorTaskId === task.id).map((edge) => edge.predecessorTaskId),
    );
    taken.add(task.id);
    const items = mockTasks.filter((row) => {
      if (row.projectId !== project.id || taken.has(row.id)) {
        return false;
      }
      if (q && !row.title.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    json(res, 200, { items: items.map((row) => ({ id: row.id, title: row.title, status: row.status })), page: { pageSize: 50, total: items.length } });
    return;
  }

  const taskAction = /^\/api\/v1\/projects\/([^/]+)\/tasks\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (taskAction) {
    const project = requireProject(session, taskAction[1], res);
    if (!project) {
      return;
    }
    const task = mockTasks.find((row) => row.id === taskAction[2] && row.projectId === project.id);
    if (!task) {
      problem(res, 403, "TENANCY_DENIED", "Task is not bound to the authorized Project");
      return;
    }
    const action = taskAction[3];
    if (req.method === "GET" && action === "history") {
      json(res, 200, mockTaskHistory.get(task.id) ?? []);
      return;
    }
    if (req.method === "GET" && !action) {
      json(res, 200, task);
      return;
    }
    const body = req.method === "GET" ? {} : await readBody(req);
    if (body.expectedVersion != null && Number(body.expectedVersion) !== task.version) {
      problem(res, 409, "OPTIMISTIC_LOCK", "Optimistic lock conflict");
      return;
    }
    if (req.method === "PATCH" && !action) {
      if (body.status != null || body.assigneeUserId !== undefined) {
        problem(res, 409, "PLANNING_STATE", "Status and assignee have dedicated endpoints and are not patchable");
        return;
      }
      Object.assign(task, {
        title: body.title?.trim() || task.title,
        description: body.description !== undefined ? body.description : task.description,
        priority: body.priority !== undefined ? body.priority : task.priority,
        plannedStartAt: body.plannedStartAt !== undefined ? body.plannedStartAt : task.plannedStartAt,
        dueDate: body.dueDate !== undefined ? body.dueDate : task.dueDate,
        estimatedMinutes: body.estimatedMinutes !== undefined ? body.estimatedMinutes : task.estimatedMinutes,
        progressPercent: body.progressPercent !== undefined ? body.progressPercent : task.progressPercent,
        version: task.version + 1,
        updatedAt: new Date().toISOString(),
      });
      refreshDerived(task);
      appendHistory(task.id, "TASK_UPDATED");
      json(res, 200, task);
      return;
    }
    if (req.method === "POST" && action === "assign") {
      task.assigneeUserId = body.assigneeUserId ?? null;
      task.previews = { ...task.previews, assignee: task.assigneeUserId ? { userId: USER, displayName: "M. Santos" } : undefined };
      task.version += 1;
      appendHistory(task.id, "TASK_ASSIGNED");
      json(res, 200, task);
      return;
    }
    if (req.method === "POST" && (action === "start" || action === "unblock" || (action === "status" && body.status === "IN_PROGRESS"))) {
      const graph = graphForTask(task.id);
      if (graph.dependencyStartBlocked) {
        json(res, 409, {
          type: "https://amber.invalid/problems/planning_state",
          title: "PlanningStateError",
          status: 409,
          detail: "Task cannot move to IN_PROGRESS or DONE while a finish-to-start prerequisite is not DONE",
          code: "PLANNING_STATE",
          reason: "DEPENDENCY_PREDECESSOR_INCOMPLETE",
          blockers: graph.startBlockers,
        });
        return;
      }
      if (task.status === "TODO" || task.status === "BLOCKED") {
        task.status = "IN_PROGRESS";
        task.startedAt = task.startedAt ?? new Date().toISOString();
        task.blockedReason = null;
        task.version += 1;
        refreshDerived(task);
        appendHistory(task.id, action === "unblock" ? "TASK_UNBLOCKED" : "TASK_STATUS_CHANGED");
        json(res, 200, task);
        return;
      }
      problem(res, 409, "PLANNING_STATE", `Task cannot transition from ${task.status} to IN_PROGRESS`);
      return;
    }
    if (req.method === "POST" && (action === "block" || (action === "status" && body.status === "BLOCKED"))) {
      if (!String(body.blockedReason ?? "").trim()) {
        problem(res, 409, "PLANNING_STATE", "BLOCKED requires a blocked reason");
        return;
      }
      if (task.status !== "IN_PROGRESS") {
        problem(res, 409, "PLANNING_STATE", `Task cannot transition from ${task.status} to BLOCKED`);
        return;
      }
      task.status = "BLOCKED";
      task.blockedReason = String(body.blockedReason).trim();
      task.version += 1;
      refreshDerived(task);
      appendHistory(task.id, "TASK_BLOCKED");
      json(res, 200, task);
      return;
    }
    if (req.method === "POST" && (action === "complete" || (action === "status" && body.status === "DONE"))) {
      if (task.status !== "IN_PROGRESS") {
        problem(res, 409, "PLANNING_STATE", `Task cannot transition from ${task.status} to DONE`);
        return;
      }
      task.status = "DONE";
      task.completedAt = new Date().toISOString();
      task.late = false;
      task.version += 1;
      refreshDerived(task);
      appendHistory(task.id, "TASK_COMPLETED");
      json(res, 200, task);
      return;
    }
    if (req.method === "POST" && (action === "cancel" || (action === "status" && body.status === "CANCELLED"))) {
      if (task.status === "DONE" || task.status === "CANCELLED") {
        problem(res, 409, "PLANNING_STATE", `Task cannot transition from ${task.status} to CANCELLED`);
        return;
      }
      task.status = "CANCELLED";
      task.late = false;
      task.version += 1;
      refreshDerived(task);
      appendHistory(task.id, "TASK_CANCELLED");
      json(res, 200, task);
      return;
    }
  }

  const planningMatch = /^\/api\/v1\/projects\/([^/]+)\/planning$/.exec(path);
  if (planningMatch) {
    const project = requireProject(session, planningMatch[1], res);
    if (!project) {
      return;
    }
    if (req.method !== "GET") {
      problem(res, 405, "METHOD_NOT_ALLOWED", "Planning read-model is GET-only");
      return;
    }
    const tasks = mockTasks.filter((row) => row.projectId === project.id);
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const status = url.searchParams.get("status");
    const late = url.searchParams.get("late");
    const inspect = url.searchParams.get("inspect");
    let rows = tasks.filter((row) => {
      if (q && !row.title.toLowerCase().includes(q)) {
        return false;
      }
      if (status && row.status !== status) {
        return false;
      }
      if (late === "true" && !row.late) {
        return false;
      }
      if (late === "false" && row.late) {
        return false;
      }
      return true;
    });
    const inspectedRow = inspect ? tasks.find((row) => row.id === inspect) ?? null : null;
    const inspected = inspectedRow
      ? { ...withGraph(inspectedRow), history: mockTaskHistory.get(inspectedRow.id) ?? [] }
      : null;
    json(res, 200, {
      projectId: project.id,
      organizationId: project.organizationId,
      generatedAt: new Date().toISOString(),
      view: url.searchParams.get("view") ?? "list",
      project: { archivedAt: project.archivedAt, readOnly: Boolean(project.archivedAt) },
      tasks: rows.map(withGraph),
      dependencies: mockDependencies.filter((edge) => edge.projectId === project.id),
      milestones: project.id === PROJECT_A
        ? [{ id: "ms-concept", title: "Concept freeze", recordedStatus: "PLANNED", status: "PLANNED", targetDate: null, phaseId: "phase-concept", deliverableId: null }]
        : [],
      page: { page: 1, pageSize: 20, total: rows.length, sort: "createdAt", order: "asc" },
      counts: {
        total: rows.length,
        late: rows.filter((row) => row.late).length,
        byStatus: Object.fromEntries(rows.map((row) => [row.status, 1])),
        byKanbanColumn: kanbanCounts(rows),
      },
      inspected,
    });
    return;
  }

  const hubMatch = /^\/api\/v1\/projects\/([^/]+)\/hub$/.exec(path);
  if (hubMatch) {
    const project = requireProject(session, hubMatch[1], res);
    if (!project) {
      return;
    }
    if (req.method !== "GET") {
      problem(res, 405, "METHOD_NOT_ALLOWED", "Hub is read-only");
      return;
    }
    const now = Date.now();
    const projectDeliverables = deliverables.filter((row) => row.projectId === project.id && !row.archivedAt);
    const projectPackages = workPackages.filter((row) => row.projectId === project.id && !row.archivedAt);
    const counts = {
      PLANNED: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      APPROVED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };
    for (const row of projectDeliverables) {
      if (row.status in counts) {
        counts[row.status] += 1;
      }
    }
    const overdue = projectDeliverables.filter(
      (row) => row.dueAt && new Date(row.dueAt).getTime() < now && !["DELIVERED", "CANCELLED"].includes(row.status),
    );
    const blocked = projectPackages.filter((row) => row.status === "BLOCKED");
    const late = projectPackages.filter(
      (row) => row.dueAt && new Date(row.dueAt).getTime() < now && !["DONE", "CANCELLED"].includes(row.status),
    );
    const gaps = [...projectDeliverables, ...projectPackages]
      .filter((row) => !row.ownerProjectMembershipId && !row.ownerTeamId)
      .map((row) => ({
        id: row.id,
        kind: row.code?.startsWith("WP") || row.title?.includes("package") || row.title?.includes("programme") || row.title?.includes("Pacote")
          ? "WORK_PACKAGE"
          : "DELIVERABLE",
        code: row.code ?? null,
        title: row.title,
        status: row.status,
        dueAt: row.dueAt,
        href: {
          ui: row.code?.startsWith("WP")
            ? `/projects/${project.id}/work-packages?inspect=${row.id}`
            : `/projects/${project.id}/deliverables?inspect=${row.id}`,
          api: `/api/v1/projects/${project.id}/${row.code?.startsWith("WP") ? "work-packages" : "deliverables"}/${row.id}`,
        },
      }));
    const hrefFor = (row, kind) => ({
      ui:
        kind === "DELIVERABLE"
          ? `/projects/${project.id}/deliverables?inspect=${row.id}`
          : `/projects/${project.id}/work-packages?inspect=${row.id}`,
      api: `/api/v1/projects/${project.id}/${kind === "DELIVERABLE" ? "deliverables" : "work-packages"}/${row.id}`,
    });
    const activePhase = phasesA.find((row) => row.projectId === project.id && row.status === "ACTIVE");
    json(res, 200, {
      generatedAt: new Date().toISOString(),
      stale: false,
      freshness: {
        generatedAt: new Date().toISOString(),
        sourceMaxUpdatedAt: new Date().toISOString(),
        lagMs: 0,
        stale: false,
        servedFromCache: false,
      },
      project: { id: project.id, name: project.name, archivedAt: null, organizationId: project.organizationId },
      currentPhase: {
        origin: "operations.phases",
        derivation: "Non-archived Phase rows with stored status ACTIVE, lowest sequence.",
        value: activePhase
          ? {
              id: activePhase.id,
              name: activePhase.name,
              sequence: activePhase.sequence,
              status: activePhase.status,
              plannedStartAt: activePhase.plannedStartAt,
              plannedEndAt: activePhase.plannedEndAt,
              href: {
                ui: `/projects/${project.id}/structure?phase=${activePhase.id}`,
                api: `/api/v1/projects/${project.id}/phases/${activePhase.id}`,
              },
            }
          : null,
        activePhaseCount: activePhase ? 1 : 0,
      },
      deliverableCountsByStatus: {
        origin: "operations.deliverables.status",
        derivation: "COUNT of non-archived Deliverables grouped by stored status.",
        counts,
      },
      overdueDeliverables: {
        origin: "operations.deliverables.dueAt",
        derivation: "dueAt < now signal",
        items: overdue.map((row) => ({
          id: row.id,
          kind: "DELIVERABLE",
          code: row.code,
          title: row.title,
          status: row.status,
          dueAt: row.dueAt,
          href: hrefFor(row, "DELIVERABLE"),
        })),
        nextCursor: null,
        returned: overdue.length,
      },
      blockedWorkPackages: {
        origin: "operations.work_packages.status",
        derivation: "Stored BLOCKED",
        items: blocked.map((row) => ({
          id: row.id,
          kind: "WORK_PACKAGE",
          code: row.code,
          title: row.title,
          status: row.status,
          dueAt: row.dueAt,
          blockedReason: row.blockedReason,
          href: hrefFor(row, "WORK_PACKAGE"),
        })),
        nextCursor: null,
        returned: blocked.length,
      },
      lateWorkPackages: {
        origin: "operations.work_packages.dueAt",
        derivation: "dueAt signal",
        items: late.map((row) => ({
          id: row.id,
          kind: "WORK_PACKAGE",
          code: row.code,
          title: row.title,
          status: row.status,
          dueAt: row.dueAt,
          href: hrefFor(row, "WORK_PACKAGE"),
        })),
        nextCursor: null,
        returned: late.length,
      },
      ownerGaps: {
        origin: "operations ownership XOR",
        derivation: "Zero owners",
        items: gaps,
        nextCursor: null,
        returned: gaps.length,
      },
      upcomingMilestones: {
        origin: "planning.milestones",
        derivation: "Existing upcoming PLANNED milestones",
        items: [],
        nextCursor: null,
        returned: 0,
      },
      relatedSources: {
        origin: "document|coordination|planning|governance",
        derivation: "Authorized summaries only",
        sources: {
          issues: {
            origin: "coordination.issues",
            derivation: "open issues",
            permission: "project.read",
            count: 0,
            api: `/api/v1/projects/${project.id}/issues`,
          },
          tasks: {
            origin: "planning.tasks",
            derivation: "open tasks",
            permission: "project.read",
            count: 0,
            api: `/api/v1/projects/${project.id}/tasks`,
          },
        },
      },
      lastMaterialActivity: null,
      links: {
        structure: `/projects/${project.id}/structure`,
        deliverables: `/projects/${project.id}/deliverables`,
        workPackages: `/projects/${project.id}/work-packages`,
      },
    });
    return;
  }

  problem(res, 404, "NOT_FOUND", "Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`m3.2 mock api listening on 0.0.0.0:${PORT}\n`);
});
