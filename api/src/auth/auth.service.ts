import { Injectable } from "@nestjs/common";
import {
  AUTH_PROVIDER_EMAIL_PASSWORD,
  DenyByDefaultError,
  InvalidCredentialsError,
  INVITE_TTL_DAYS,
  InvitationError,
  MFA_REQUIRED_ROLE_KEYS,
  MfaChallengeError,
  MfaRequiredError,
  RESET_TTL_MINUTES,
  SessionExpiredError,
  SessionRevokedError,
  assertPasswordPolicy,
  assertSessionUsable,
  evaluateLockout,
  evaluateOrgSwitch,
  hashToken,
  isAccountLocked,
  isRecentAuthentication,
  normalizeEmail,
  progressiveBackoffMs,
  randomToken,
  redactSecrets,
  requiresMfaEnrollment,
  revokeSession,
} from "@amber/shared";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { EmailAdapter } from "./email.adapter";
import { MfaService } from "./mfa.service";
import { PasswordService } from "./password.service";
import { RateLimitService } from "./rate-limit.service";
import type { RequestSession, SessionView } from "./session.types";
import { AuthzService } from "../authz/authz.service";

const GENERIC_LOGIN_ERROR = "Invalid email or password";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mfa: MfaService,
    private readonly email: EmailAdapter,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly authz: AuthzService,
  ) {}

  async register(input: { email: string; password: string; displayName: string }): Promise<{
    session: RequestSession;
    token: string;
  }> {
    assertPasswordPolicy(input.password);
    const email = normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new InvalidCredentialsError("Unable to register with that email");
    }
    const hashed = await this.passwords.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: input.displayName.trim(),
        authenticationIdentities: {
          create: {
            provider: AUTH_PROVIDER_EMAIL_PASSWORD,
            identifier: email,
            passwordCredential: {
              create: {
                algorithm: hashed.algorithm,
                hash: hashed.hash,
                parameters: hashed.parameters as unknown as Prisma.InputJsonValue,
              },
            },
          },
        },
      },
      include: { authenticationIdentities: true },
    });
    const identity = user.authenticationIdentities[0];
    if (!identity) {
      throw new Error("AuthenticationIdentity was not created");
    }
    return this.issueSession({
      userId: user.id,
      authenticationIdentityId: identity.id,
      activeOrganizationId: null,
      reason: "register",
    });
  }

  async login(input: {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<
    | { status: "authenticated"; session: RequestSession; token: string }
    | { status: "mfa_required"; mfaToken: string }
    | { status: "mfa_enrollment_required"; session: RequestSession; token: string }
  > {
    const email = normalizeEmail(input.email);
    this.rateLimit.consume(`login:ip:${input.ipAddress ?? "unknown"}`);
    this.rateLimit.consume(`login:id:${email}`);

    const identity = await this.prisma.authenticationIdentity.findUnique({
      where: { provider_identifier: { provider: AUTH_PROVIDER_EMAIL_PASSWORD, identifier: email } },
      include: { passwordCredential: true, user: true },
    });

    if (!identity?.passwordCredential || identity.user.deactivatedAt) {
      await this.passwords.dummyVerify(input.password);
      await this.auditSecurity({
        eventType: "AUTH_LOGIN_FAILED",
        actorUserId: identity?.userId,
        payload: { reason: "unknown_or_deactivated", email },
      });
      throw new InvalidCredentialsError(GENERIC_LOGIN_ERROR);
    }

    const credential = identity.passwordCredential;
    if (isAccountLocked(credential.lockedUntil)) {
      await this.sleep(progressiveBackoffMs(credential.failedAttempts));
      await this.auditSecurity({
        eventType: "AUTH_LOGIN_FAILED",
        actorUserId: identity.userId,
        payload: { reason: "locked", email },
      });
      throw new InvalidCredentialsError(GENERIC_LOGIN_ERROR);
    }

    const ok = await this.passwords.verify(credential.hash, input.password);
    if (!ok) {
      const failedAttempts = credential.failedAttempts + 1;
      const lockedUntil = evaluateLockout(failedAttempts);
      await this.prisma.passwordCredential.update({
        where: { id: credential.id },
        data: { failedAttempts, lockedUntil },
      });
      await this.sleep(progressiveBackoffMs(failedAttempts));
      await this.auditSecurity({
        eventType: lockedUntil ? "AUTH_LOCKOUT" : "AUTH_LOGIN_FAILED",
        actorUserId: identity.userId,
        payload: { reason: lockedUntil ? "lockout" : "bad_password", failedAttempts, email },
      });
      throw new InvalidCredentialsError(GENERIC_LOGIN_ERROR);
    }

    await this.prisma.passwordCredential.update({
      where: { id: credential.id },
      data: { failedAttempts: 0, lockedUntil: null },
    });

    const templateKeys = await this.authz.templateKeysForUser(identity.userId);
    const mfaRequired = requiresMfaEnrollment(templateKeys);
    const enrolled = await this.isMfaEnrolled(identity.userId);

    if (mfaRequired && enrolled) {
      const mfaToken = await this.mfa.issueChallenge(identity.userId, "LOGIN");
      return { status: "mfa_required", mfaToken };
    }

    const issued = await this.issueSession({
      userId: identity.userId,
      authenticationIdentityId: identity.id,
      activeOrganizationId: null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      reason: "login",
    });
    await this.auditSecurity({
      eventType: "AUTH_LOGIN_SUCCEEDED",
      actorUserId: identity.userId,
      payload: { email, mfaEnrollmentRequired: mfaRequired && !enrolled },
    });
    if (mfaRequired && !enrolled) {
      return { status: "mfa_enrollment_required", ...issued };
    }
    return { status: "authenticated", ...issued };
  }

  async completeMfaLogin(input: {
    mfaToken: string;
    totp?: string;
    recoveryCode?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ session: RequestSession; token: string }> {
    const challenge = await this.mfa.consumeChallenge(input.mfaToken, "LOGIN");
    await this.assertMfaFactor(challenge.userId, input);
    const identity = await this.prisma.authenticationIdentity.findFirst({
      where: { userId: challenge.userId, provider: AUTH_PROVIDER_EMAIL_PASSWORD },
    });
    const issued = await this.issueSession({
      userId: challenge.userId,
      authenticationIdentityId: identity?.id ?? null,
      activeOrganizationId: null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      reason: "mfa_login",
      lastReauthAt: new Date(),
    });
    await this.auditSecurity({
      eventType: input.recoveryCode ? "AUTH_MFA_RECOVERY_USED" : "AUTH_MFA_CHALLENGE_SUCCEEDED",
      actorUserId: challenge.userId,
      payload: { method: input.recoveryCode ? "recovery_code" : "totp" },
    });
    return issued;
  }

  async startMfaEnroll(session: RequestSession): Promise<{ otpauth: string; challengeToken: string }> {
    const created = this.mfa.createSecret();
    const stored = this.mfa.encrypt(created.secret);
    await this.prisma.mfaTotpCredential.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        secretEncrypted: stored.secretEncrypted,
        secretHash: stored.secretHash,
      },
      update: {
        secretEncrypted: stored.secretEncrypted,
        secretHash: stored.secretHash,
        verifiedAt: null,
      },
    });
    const challengeToken = await this.mfa.issueChallenge(session.userId, "ENROLL");
    return { otpauth: created.otpauth, challengeToken };
  }

  async verifyMfaEnroll(session: RequestSession, input: { challengeToken: string; totp: string }): Promise<{
    recoveryCodes: string[];
  }> {
    await this.mfa.consumeChallenge(input.challengeToken, "ENROLL");
    const row = await this.prisma.mfaTotpCredential.findUnique({ where: { userId: session.userId } });
    if (!row) {
      throw new MfaRequiredError();
    }
    const secret = this.mfa.decrypt(row.secretEncrypted);
    if (!this.mfa.verifyTotp(secret, input.totp)) {
      throw new MfaChallengeError("Invalid authenticator code");
    }
    await this.prisma.mfaTotpCredential.update({
      where: { userId: session.userId },
      data: { verifiedAt: new Date() },
    });
    const recoveryCodes = await this.replaceRecoveryCodes(session.userId);
    await this.markReauth(session.id);
    await this.auditSecurity({
      eventType: "AUTH_MFA_ENROLLED",
      actorUserId: session.userId,
      organizationId: session.activeOrganizationId,
      payload: { recoveryCodeCount: recoveryCodes.length },
    });
    return { recoveryCodes };
  }

  async regenerateRecoveryCodes(session: RequestSession, input: { password?: string; totp?: string }): Promise<{
    recoveryCodes: string[];
  }> {
    await this.assertFreshFactor(session, input);
    const recoveryCodes = await this.replaceRecoveryCodes(session.userId);
    await this.markReauth(session.id);
    return { recoveryCodes };
  }

  async reauthenticate(session: RequestSession, input: { password?: string; totp?: string }): Promise<void> {
    await this.assertFreshFactor(session, input);
    await this.markReauth(session.id);
    await this.auditSecurity({
      eventType: "AUTH_REAUTHENTICATED",
      actorUserId: session.userId,
      organizationId: session.activeOrganizationId,
      payload: { method: input.totp ? "totp" : "password" },
    });
  }

  async logout(session: RequestSession): Promise<void> {
    const revocation = revokeSession(new Date(), "logout");
    await this.prisma.session.update({
      where: { id: session.id },
      data: revocation,
    });
    await this.auditSecurity({
      eventType: "AUTH_LOGOUT",
      actorUserId: session.userId,
      organizationId: session.activeOrganizationId,
      payload: { sessionId: session.id },
    });
  }

  async logoutAll(session: RequestSession): Promise<void> {
    await this.revokeAllSessions(session.userId, "logout_all");
    await this.auditSecurity({
      eventType: "AUTH_LOGOUT_ALL",
      actorUserId: session.userId,
      organizationId: session.activeOrganizationId,
      payload: {},
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    this.rateLimit.consume(`reset:${normalized}`);
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      return;
    }
    const token = randomToken();
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
      },
    });
    await this.email.send({
      to: normalized,
      subject: "Reset your Amber password",
      template: "password-reset",
      token,
    });
    await this.auditSecurity({
      eventType: "AUTH_PASSWORD_RESET_REQUESTED",
      actorUserId: user.id,
      payload: { email: normalized },
    });
  }

  async resetPassword(input: { token: string; password: string }): Promise<void> {
    assertPasswordPolicy(input.password);
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new InvitationError("Reset token is invalid or expired", 400);
    }
    const identity = await this.prisma.authenticationIdentity.findFirst({
      where: { userId: row.userId, provider: AUTH_PROVIDER_EMAIL_PASSWORD },
      include: { passwordCredential: true },
    });
    if (!identity) {
      throw new InvitationError("No email/password identity to reset", 400);
    }
    const hashed = await this.passwords.hash(input.password);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.passwordCredential.update({
        where: { authenticationIdentityId: identity.id },
        data: {
          algorithm: hashed.algorithm,
          hash: hashed.hash,
          parameters: hashed.parameters as unknown as Prisma.InputJsonValue,
          failedAttempts: 0,
          lockedUntil: null,
          passwordChangedAt: new Date(),
        },
      }),
    ]);
    await this.revokeAllSessions(row.userId, "password_reset");
    await this.auditSecurity({
      eventType: "AUTH_PASSWORD_RESET_COMPLETED",
      actorUserId: row.userId,
      payload: {},
    });
  }

  async loadSessionByToken(token: string | undefined): Promise<RequestSession | null> {
    if (!token) {
      return null;
    }
    return this.loadSession(hashToken(token));
  }

  async loadSession(tokenHash: string | undefined): Promise<RequestSession | null> {
    if (!tokenHash) {
      return null;
    }
    const row = await this.prisma.session.findUnique({ where: { tokenHash } });
    if (!row) {
      return null;
    }
    const session = this.toSession(row);
    try {
      assertSessionUsable(session);
    } catch (error) {
      if (error instanceof SessionRevokedError || error instanceof SessionExpiredError) {
        throw error;
      }
      throw error;
    }
    await this.prisma.session.update({
      where: { id: row.id },
      data: { lastSeenAt: new Date() },
    });
    return { ...session, lastSeenAt: new Date() };
  }

  async sessionView(session: RequestSession | null): Promise<SessionView> {
    if (!session) {
      return {
        authenticated: false,
        userId: null,
        email: null,
        displayName: null,
        activeOrganizationId: null,
        membership: null,
        permissions: [],
        mfa: { required: false, enrolled: false, freshnessOk: false },
      };
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    const context = session.activeOrganizationId
      ? await this.authz.loadContext(session)
      : null;
    const templateKeys = context
      ? context.grants.map((g) => g.templateKey)
      : await this.authz.templateKeysForUser(session.userId);
    return {
      authenticated: true,
      userId: session.userId,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      activeOrganizationId: session.activeOrganizationId,
      membership: context
        ? {
            id: context.membershipId,
            status: context.membershipStatus,
            type: context.membershipType,
          }
        : null,
      permissions: context ? this.authz.permissionsOf(context) : [],
      mfa: {
        required: requiresMfaEnrollment(templateKeys),
        enrolled: await this.isMfaEnrolled(session.userId),
        freshnessOk: isRecentAuthentication(session),
      },
    };
  }

  async switchOrganization(input: {
    session: RequestSession;
    targetOrganizationId: string;
  }): Promise<{ activeOrganizationId: string }> {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: input.targetOrganizationId,
          userId: input.session.userId,
        },
      },
    });
    const result = evaluateOrgSwitch({
      session: input.session,
      targetOrganizationId: input.targetOrganizationId,
      membership: membership
        ? {
            userId: membership.userId,
            organizationId: membership.organizationId,
            status: membership.status as "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED",
            type: membership.type as "INTERNAL" | "EXTERNAL" | "ADMINISTRATIVE",
          }
        : null,
    });
    await this.prisma.session.update({
      where: { id: input.session.id },
      data: { activeOrganizationId: result.nextActiveOrganizationId, lastSeenAt: new Date() },
    });
    await this.audit.insert({
      organizationId: result.nextActiveOrganizationId,
      actorUserId: input.session.userId,
      eventType: "ORG_SWITCHED",
      resourceType: "organization",
      resourceId: result.nextActiveOrganizationId,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({
        from: input.session.activeOrganizationId,
        to: result.nextActiveOrganizationId,
      }),
    });
    return { activeOrganizationId: result.nextActiveOrganizationId };
  }

  requireSession(session: RequestSession | null): RequestSession {
    if (!session) {
      throw new DenyByDefaultError("Authentication required");
    }
    return session;
  }

  async revokeSessionsForOrganization(userId: string, organizationId: string, reason: string): Promise<void> {
    const revocation = revokeSession(new Date(), reason);
    await this.prisma.session.updateMany({
      where: { userId, activeOrganizationId: organizationId, revokedAt: null },
      data: revocation,
    });
  }

  async revokeAllSessions(userId: string, reason: string): Promise<void> {
    const revocation = revokeSession(new Date(), reason);
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: revocation,
    });
  }

  inviteTtl(): Date {
    return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  createSession(input: {
    userId: string;
    authenticationIdentityId: string | null;
    activeOrganizationId: string | null;
    ipAddress?: string;
    userAgent?: string;
    reason: string;
    lastReauthAt?: Date | null;
  }): Promise<{ session: RequestSession; token: string }> {
    return this.issueSession(input);
  }

  private async issueSession(input: {
    userId: string;
    authenticationIdentityId: string | null;
    activeOrganizationId: string | null;
    ipAddress?: string;
    userAgent?: string;
    reason: string;
    lastReauthAt?: Date | null;
  }): Promise<{ session: RequestSession; token: string }> {
    const token = randomToken();
    const createdAt = new Date();
    const row = await this.prisma.session.create({
      data: {
        userId: input.userId,
        authenticationIdentityId: input.authenticationIdentityId,
        tokenHash: hashToken(token),
        activeOrganizationId: input.activeOrganizationId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        lastReauthAt: input.lastReauthAt ?? createdAt,
        createdAt,
        lastSeenAt: createdAt,
        expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return { session: this.toSession(row), token };
  }

  private toSession(row: {
    id: string;
    userId: string;
    authenticationIdentityId: string | null;
    activeOrganizationId: string | null;
    createdAt: Date;
    lastSeenAt: Date;
    lastReauthAt: Date | null;
    expiresAt: Date;
    revokedAt: Date | null;
  }): RequestSession {
    return {
      id: row.id,
      userId: row.userId,
      authenticationIdentityId: row.authenticationIdentityId,
      activeOrganizationId: row.activeOrganizationId,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
      lastReauthAt: row.lastReauthAt,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  private async isMfaEnrolled(userId: string): Promise<boolean> {
    const row = await this.prisma.mfaTotpCredential.findUnique({ where: { userId } });
    return Boolean(row?.verifiedAt);
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const codes = this.mfa.generateRecoveryCodes();
    const batchId = randomUUID();
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codes.map((code) => ({
          userId,
          batchId,
          codeHash: this.mfa.hashRecoveryCode(code),
        })),
      }),
    ]);
    return codes;
  }

  private async assertMfaFactor(
    userId: string,
    input: { totp?: string; recoveryCode?: string },
  ): Promise<void> {
    if (input.recoveryCode) {
      const hash = this.mfa.hashRecoveryCode(input.recoveryCode);
      const row = await this.prisma.mfaRecoveryCode.findFirst({
        where: { userId, codeHash: hash, usedAt: null },
      });
      if (!row) {
        throw new MfaChallengeError("Invalid recovery code");
      }
      await this.prisma.mfaRecoveryCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return;
    }
    if (!input.totp) {
      throw new MfaRequiredError("Authenticator code required");
    }
    const totp = await this.prisma.mfaTotpCredential.findUnique({ where: { userId } });
    if (!totp?.verifiedAt) {
      throw new MfaRequiredError();
    }
    const secret = this.mfa.decrypt(totp.secretEncrypted);
    if (!this.mfa.verifyTotp(secret, input.totp)) {
      throw new MfaChallengeError("Invalid authenticator code");
    }
  }

  private async assertFreshFactor(
    session: RequestSession,
    input: { password?: string; totp?: string },
  ): Promise<void> {
    if (input.totp) {
      await this.assertMfaFactor(session.userId, { totp: input.totp });
      return;
    }
    if (!input.password) {
      throw new InvalidCredentialsError(GENERIC_LOGIN_ERROR);
    }
    const identity = await this.prisma.authenticationIdentity.findFirst({
      where: { userId: session.userId, provider: AUTH_PROVIDER_EMAIL_PASSWORD },
      include: { passwordCredential: true },
    });
    if (!identity?.passwordCredential) {
      throw new InvalidCredentialsError(GENERIC_LOGIN_ERROR);
    }
    const ok = await this.passwords.verify(identity.passwordCredential.hash, input.password);
    if (!ok) {
      throw new InvalidCredentialsError(GENERIC_LOGIN_ERROR);
    }
  }

  private async markReauth(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastReauthAt: new Date(), lastSeenAt: new Date() },
    });
  }

  private async auditSecurity(input: {
    eventType: string;
    actorUserId?: string | null;
    organizationId?: string | null;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.audit.insert({
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      resourceType: "identity",
      resourceId: input.actorUserId ?? null,
      correlationId: currentCorrelationId(),
      payload: redactSecrets(input.payload),
    });
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const MFA_REQUIRED_ROLES = MFA_REQUIRED_ROLE_KEYS;
