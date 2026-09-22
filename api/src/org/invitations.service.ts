import { Injectable } from "@nestjs/common";
import {
  AUTH_PROVIDER_EMAIL_PASSWORD,
  InvitationError,
  assertMembershipTransition,
  assertMembershipType,
  hashToken,
  normalizeEmail,
  randomToken,
  redactSecrets,
  roleTemplateByKey,
  type MembershipStatus,
  type MembershipType,
  type RoleTemplateKey,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import { EmailAdapter } from "../auth/email.adapter";
import { PasswordService } from "../auth/password.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailAdapter,
    private readonly auth: AuthService,
    private readonly authz: AuthzService,
    private readonly passwords: PasswordService,
  ) {}

  async invite(
    session: RequestSession,
    organizationId: string,
    input: { email: string; roleTemplateKey?: RoleTemplateKey; membershipType?: MembershipType },
  ) {
    await this.authz.assert(session, "organization.manage_members");
    if (session.activeOrganizationId !== organizationId) {
      throw new InvitationError("Invitation organization does not match the session-bound Organization", 403);
    }
    const email = normalizeEmail(input.email);
    const membershipType = input.membershipType ?? "INTERNAL";
    assertMembershipType(membershipType);
    const roleTemplateKey = input.roleTemplateKey ?? "VIEWER";
    roleTemplateByKey(roleTemplateKey);

    const existingPending = await this.prisma.invitation.findFirst({
      where: { organizationId, email, acceptedAt: null, revokedAt: null },
    });
    if (existingPending) {
      await this.prisma.invitation.update({
        where: { id: existingPending.id },
        data: { revokedAt: new Date() },
      });
    }

    const token = randomToken();
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email,
        tokenHash: hashToken(token),
        invitedById: session.userId,
        roleTemplateKey,
        membershipType,
        expiresAt: this.auth.inviteTtl(),
      },
    });

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      await this.ensureInvitedMembership({
        organizationId,
        userId: existingUser.id,
        type: membershipType,
      });
    }

    await this.email.send({
      to: email,
      subject: "Amber organization invitation",
      template: "organization-invite",
      token,
    });
    await this.audit.insert({
      organizationId,
      actorUserId: session.userId,
      eventType: existingPending ? "ORG_INVITE_REISSUED" : "ORG_INVITE_SENT",
      resourceType: "invitation",
      resourceId: invitation.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ email, roleTemplateKey, membershipType, replacedInvitationId: existingPending?.id }),
    });
    return { invitationId: invitation.id, expiresAt: invitation.expiresAt };
  }

  async revoke(session: RequestSession, organizationId: string, invitationId: string) {
    await this.authz.assert(session, "organization.manage_members");
    const invitation = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.organizationId !== organizationId) {
      throw new InvitationError("Invitation not found", 404);
    }
    if (invitation.acceptedAt || invitation.revokedAt) {
      throw new InvitationError("Invitation is no longer pending", 409);
    }
    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.insert({
      organizationId,
      actorUserId: session.userId,
      eventType: "ORG_INVITE_REVOKED",
      resourceType: "invitation",
      resourceId: invitation.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ email: invitation.email }),
    });
    return { revoked: true };
  }

  async accept(input: {
    token: string;
    password?: string;
    displayName?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ session: RequestSession; token: string; organizationId: string }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
      throw new InvitationError("Invitation is invalid or expired", 400);
    }

    let user = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    if (!user) {
      if (!input.password || !input.displayName) {
        throw new InvitationError("Password and display name are required to accept this invitation", 400);
      }
      const hashed = await this.passwords.hash(input.password);
      user = await this.prisma.user.create({
        data: {
          email: invitation.email,
          displayName: input.displayName.trim(),
          authenticationIdentities: {
            create: {
              provider: AUTH_PROVIDER_EMAIL_PASSWORD,
              identifier: invitation.email,
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
      });
    }

    const membership = await this.ensureInvitedMembership({
      organizationId: invitation.organizationId,
      userId: user.id,
      type: invitation.membershipType as MembershipType,
    });
    assertMembershipTransition(membership.status as MembershipStatus, "ACTIVE");
    const updated = await this.prisma.organizationMembership.update({
      where: { id: membership.id },
      data: { status: "ACTIVE", deactivatedAt: null, type: invitation.membershipType },
    });

    if (invitation.roleTemplateKey) {
      const role = await this.prisma.roleDefinition.findFirst({
        where: { organizationId: null, templateKey: invitation.roleTemplateKey },
      });
      if (role) {
        const existing = await this.prisma.roleBinding.findFirst({
          where: { membershipId: updated.id, roleId: role.id, projectId: null },
        });
        if (!existing) {
          await this.prisma.roleBinding.create({
            data: { membershipId: updated.id, roleId: role.id },
          });
        }
      }
    }

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: user.id },
    });

    const identity = await this.prisma.authenticationIdentity.findFirst({
      where: { userId: user.id, provider: AUTH_PROVIDER_EMAIL_PASSWORD },
    });
    const issued = await this.auth.createSession({
      userId: user.id,
      authenticationIdentityId: identity?.id ?? null,
      activeOrganizationId: invitation.organizationId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      reason: "invite_accept",
    });
    await this.audit.insert({
      organizationId: invitation.organizationId,
      actorUserId: user.id,
      eventType: "ORG_INVITE_ACCEPTED",
      resourceType: "invitation",
      resourceId: invitation.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ email: invitation.email }),
    });
    await this.audit.insert({
      organizationId: invitation.organizationId,
      actorUserId: user.id,
      eventType: "MEMBERSHIP_ACTIVATED",
      resourceType: "membership",
      resourceId: updated.id,
      correlationId: currentCorrelationId(),
      payload: redactSecrets({ from: membership.status, to: "ACTIVE" }),
    });
    return { ...issued, organizationId: invitation.organizationId };
  }

  private async ensureInvitedMembership(input: {
    organizationId: string;
    userId: string;
    type: MembershipType;
  }) {
    const existing = await this.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
    });
    if (!existing) {
      return this.prisma.organizationMembership.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          type: input.type,
          status: "INVITED",
        },
      });
    }
    if (existing.status === "ACTIVE" || existing.status === "SUSPENDED") {
      return existing;
    }
    if (existing.status === "REMOVED") {
      assertMembershipTransition("REMOVED", "INVITED");
      return this.prisma.organizationMembership.update({
        where: { id: existing.id },
        data: { status: "INVITED", type: input.type, deactivatedAt: null },
      });
    }
    return existing;
  }

}

