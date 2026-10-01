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

const server = http.createServer(async (req, res) => {
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
