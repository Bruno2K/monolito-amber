export interface RequestSession {
  id: string;
  userId: string;
  activeOrganizationId: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}
