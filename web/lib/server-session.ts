import { cookies } from "next/headers";
import { api } from "./api";
import type { ApiResult, ProjectDetail, SessionView } from "./types";
import { classifyProblem } from "./errors";
import type { UiStateKind } from "./types";

function accessKind(problem: Parameters<typeof classifyProblem>[0]): Exclude<UiStateKind, "loading" | "empty" | "no-project"> {
  const kind = classifyProblem(problem);
  if (kind === "loading" || kind === "empty" || kind === "no-project") {
    return "error";
  }
  return kind;
}

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "amber_session";

export async function sessionCookieHeader(): Promise<string> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  return token ? `${COOKIE}=${token}` : "";
}

export async function loadSession(projectId?: string | null): Promise<ApiResult<SessionView>> {
  const cookie = await sessionCookieHeader();
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return api<SessionView>(`/api/v1/auth/session${query}`, {
    headers: cookie ? { cookie } : {},
  });
}

export async function loadProject(projectId: string): Promise<ApiResult<ProjectDetail>> {
  const cookie = await sessionCookieHeader();
  return api<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    headers: cookie ? { cookie } : {},
  });
}

export async function resolveProjectAccess(projectId: string): Promise<
  | { kind: "ok"; project: ProjectDetail; session: SessionView }
  | { kind: Exclude<UiStateKind, "loading" | "empty" | "no-project">; session: SessionView | null }
> {
  // Identity is session-bound. Path projectId is routing intent only and is
  // revalidated by GET /projects/:id — never by trusting the URL.
  const sessionResult = await loadSession();
  const session = sessionResult.body;
  if (!sessionResult.ok && sessionResult.status === 401) {
    return { kind: accessKind(sessionResult.problem), session: session ?? null };
  }
  if (!session?.authenticated) {
    return { kind: "unauthenticated", session: session ?? null };
  }
  if (session.mfa?.required && !session.mfa.enrolled) {
    return { kind: "unauthenticated", session };
  }
  if (!session.activeOrganizationId) {
    return { kind: "no-org", session };
  }

  const projectResult = await loadProject(projectId);
  if (!projectResult.ok) {
    return { kind: accessKind(projectResult.problem), session };
  }
  const project = projectResult.body;
  if (project.archivedAt) {
    return { kind: "inactive", session };
  }
  if (project.membership?.status && project.membership.status !== "ACTIVE") {
    return { kind: "inactive", session };
  }
  if (project.permissions && !project.permissions.includes("project.read")) {
    return { kind: "no-permission", session };
  }
  return { kind: "ok", project, session };
}
