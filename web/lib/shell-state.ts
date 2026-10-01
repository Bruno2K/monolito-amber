import type { OrganizationRow, ProjectDetail, ProjectRow, SessionView, UiStateKind } from "./types";
import type { AmberProblem } from "./types";

export interface ShellState {
  status: "idle" | "loading" | "ready" | "error";
  session: SessionView | null;
  organizations: OrganizationRow[];
  projects: ProjectRow[];
  currentProject: ProjectDetail | null;
  projectAccess: UiStateKind | "ok" | null;
  error: AmberProblem | null;
}

export const initialShellState: ShellState = {
  status: "idle",
  session: null,
  organizations: [],
  projects: [],
  currentProject: null,
  projectAccess: null,
  error: null,
};

export type ShellAction =
  | { type: "loading" }
  | {
      type: "bootstrap";
      session: SessionView;
      organizations: OrganizationRow[];
      projects: ProjectRow[];
    }
  | {
      type: "org-switched";
      session: SessionView;
      organizations: OrganizationRow[];
      projects: ProjectRow[];
    }
  | { type: "project-loaded"; project: ProjectDetail }
  | { type: "project-cleared" }
  | { type: "project-denied"; kind: UiStateKind }
  | { type: "error"; error: AmberProblem }
  | { type: "expired" };

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case "loading":
      return { ...state, status: "loading", error: null };
    case "bootstrap":
      return {
        ...state,
        status: "ready",
        session: action.session,
        organizations: action.organizations,
        projects: action.projects,
        error: null,
      };
    case "org-switched":
      return {
        ...state,
        status: "ready",
        session: action.session,
        organizations: action.organizations,
        projects: action.projects,
        currentProject: null,
        projectAccess: null,
        error: null,
      };
    case "project-loaded":
      return { ...state, currentProject: action.project, projectAccess: "ok", error: null };
    case "project-cleared":
      return { ...state, currentProject: null, projectAccess: null };
    case "project-denied":
      return { ...state, currentProject: null, projectAccess: action.kind };
    case "error":
      return { ...state, status: "error", error: action.error };
    case "expired":
      return {
        ...initialShellState,
        status: "error",
        projectAccess: "expired",
      };
    default:
      return state;
  }
}
