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
              actualStartAt: null,
              actualEndAt: null,
              status: "PLANNED",
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
      status: phaseOneMatch[2] === "phase-brief" ? "COMPLETED" : "PLANNED",
      createdBy: USER,
      version: 1,
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    return;
  }

  problem(res, 404, "NOT_FOUND", "Not found");
});

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`m3.2 mock api listening on 0.0.0.0:${PORT}\n`);
});
