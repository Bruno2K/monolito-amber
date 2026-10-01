export interface MfaView {
  required: boolean;
  enrolled: boolean;
  satisfied?: boolean;
  freshnessOk: boolean;
}

export interface MembershipView {
  id: string;
  status: string;
  type: string;
}

export interface ProjectMembershipView {
  id: string | null | undefined;
  status: string | null | undefined;
}

export interface SessionView {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  activeOrganizationId: string | null;
  membership?: MembershipView | null;
  projectId?: string | null;
  projectMembership?: ProjectMembershipView | null;
  permissions?: string[];
  mfa?: MfaView;
  status?: string;
  mfaToken?: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug?: string;
  membershipId?: string;
  status: string;
  type: string;
  active: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  organizationId: string;
  archivedAt: string | null;
  membershipId?: string;
  status?: string;
}

export interface ProjectDetail extends ProjectRow {
  membership?: ProjectMembershipView;
  roles?: Array<{ templateKey: string }>;
  permissions?: string[];
}

export interface AmberProblem {
  status: number;
  code: string;
  title: string;
  detail: string;
  correlationId?: string;
  instance?: string;
}

export type UiStateKind =
  | "loading"
  | "error"
  | "empty"
  | "no-org"
  | "no-project"
  | "no-permission"
  | "inactive"
  | "unauthenticated"
  | "expired";

export type ApiResult<T> =
  | { ok: true; status: number; body: T; problem: null }
  | { ok: false; status: number; body: T | null; problem: AmberProblem };
