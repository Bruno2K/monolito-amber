import type { MembershipStatus, MembershipType, PermissionCode } from "@amber/shared";

export interface RequestSession {
  id: string;
  userId: string;
  authenticationIdentityId: string | null;
  activeOrganizationId: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  lastReauthAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface AuthenticatedRequest {
  amberSession?: RequestSession | null;
  cookies?: Record<string, string>;
}

export interface SessionView {
  authenticated: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  activeOrganizationId: string | null;
  membership: {
    id: string;
    status: MembershipStatus;
    type: MembershipType;
  } | null;
  projectId: string | null;
  projectMembership: {
    id: string | null | undefined;
    status: string | null | undefined;
  } | null;
  permissions: PermissionCode[];
  mfa: {
    required: boolean;
    enrolled: boolean;
    satisfied: boolean;
    freshnessOk: boolean;
  };
}
