"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { isSessionTerminal } from "../../lib/errors";
import { postAuthDestination, signInPathForExpiry } from "../../lib/guards";
import { initialShellState, shellReducer } from "../../lib/shell-state";
import type { AmberProblem, OrganizationRow, ProjectDetail, ProjectRow, SessionView, UiStateKind } from "../../lib/types";

interface ShellContextValue {
  state: ReturnType<typeof shellReducer>;
  refresh: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<boolean>;
  bindProject: (project: ProjectDetail | null, access?: UiStateKind | "ok" | null) => void;
  logout: () => Promise<void>;
}

const ShellContext = createContext<ShellContextValue | null>(null);

type BootstrapResult =
  | { kind: "ok"; session: SessionView; organizations: OrganizationRow[]; projects: ProjectRow[] }
  | { kind: "expired" }
  | { kind: "error"; problem: AmberProblem };

async function fetchBootstrap(): Promise<BootstrapResult> {
  const sessionResult = await api<SessionView>("/api/v1/auth/session");
  if (!sessionResult.ok) {
    return isSessionTerminal(sessionResult.problem) ? { kind: "expired" } : { kind: "error", problem: sessionResult.problem };
  }
  const session = sessionResult.body;
  if (!session.authenticated) {
    return { kind: "expired" };
  }
  if (!session.activeOrganizationId) {
    return { kind: "ok", session, organizations: [], projects: [] };
  }
  const [orgs, projects] = await Promise.all([
    api<OrganizationRow[]>("/api/v1/organizations"),
    api<ProjectRow[]>("/api/v1/projects"),
  ]);
  if ((!orgs.ok && isSessionTerminal(orgs.problem)) || (!projects.ok && isSessionTerminal(projects.problem))) {
    return { kind: "expired" };
  }
  if (!orgs.ok) {
    return { kind: "error", problem: orgs.problem };
  }
  if (!projects.ok) {
    return { kind: "error", problem: projects.problem };
  }
  return { kind: "ok", session, organizations: orgs.body, projects: projects.body };
}

export function ShellProvider({
  initialSession,
  children,
}: {
  initialSession: SessionView;
  children: ReactNode;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(shellReducer, {
    ...initialShellState,
    status: "ready",
    session: initialSession,
  });

  const redirectIfNeeded = useCallback(
    (session: SessionView) => {
      const dest = postAuthDestination(session);
      if (dest !== "/projects" && dest !== "/org-switch") {
        router.replace(dest);
        return true;
      }
      if (!session.activeOrganizationId) {
        router.replace("/org-switch");
        return true;
      }
      return false;
    },
    [router],
  );

  const refresh = useCallback(async () => {
    dispatch({ type: "loading" });
    const result = await fetchBootstrap();
    if (result.kind === "expired") {
      dispatch({ type: "expired" });
      router.replace(signInPathForExpiry());
      return;
    }
    if (result.kind === "error") {
      dispatch({ type: "error", error: result.problem });
      return;
    }
    redirectIfNeeded(result.session);
    dispatch({
      type: "bootstrap",
      session: result.session,
      organizations: result.organizations,
      projects: result.projects,
    });
  }, [redirectIfNeeded, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      dispatch({ type: "loading" });
      const switched = await api<{ activeOrganizationId: string }>("/api/v1/auth/active-organization", {
        method: "POST",
        body: JSON.stringify({ organizationId }),
      });
      if (!switched.ok) {
        if (isSessionTerminal(switched.problem)) {
          dispatch({ type: "expired" });
          router.replace(signInPathForExpiry());
          return false;
        }
        dispatch({ type: "error", error: switched.problem });
        return false;
      }
      const result = await fetchBootstrap();
      if (result.kind === "expired") {
        dispatch({ type: "expired" });
        router.replace(signInPathForExpiry());
        return false;
      }
      if (result.kind === "error") {
        dispatch({ type: "error", error: result.problem });
        return false;
      }
      dispatch({
        type: "org-switched",
        session: result.session,
        organizations: result.organizations,
        projects: result.projects,
      });
      router.push("/projects");
      return true;
    },
    [router],
  );

  const bindProject = useCallback((project: ProjectDetail | null, access: UiStateKind | "ok" | null = "ok") => {
    if (!project) {
      if (access && access !== "ok") {
        dispatch({ type: "project-denied", kind: access });
        return;
      }
      dispatch({ type: "project-cleared" });
      return;
    }
    dispatch({ type: "project-loaded", project });
  }, []);

  const logout = useCallback(async () => {
    await api("/api/v1/auth/logout", { method: "POST" });
    router.replace("/sign-in");
  }, [router]);

  const value = useMemo(
    () => ({ state, refresh, switchOrganization, bindProject, logout }),
    [state, refresh, switchOrganization, bindProject, logout],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) {
    throw new Error("useShell must be used within ShellProvider");
  }
  return value;
}
