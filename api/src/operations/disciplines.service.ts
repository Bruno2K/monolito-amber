import { Injectable } from "@nestjs/common";
import {
  DenyByDefaultError,
  OUTBOX_EVENT_TYPES,
  OperationsStateError,
  normalizeCatalogCode,
  redactSecrets,
} from "@amber/shared";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { RequestSession } from "../auth/session.types";
import { AuthzService } from "../authz/authz.service";
import { FoundationService } from "../foundation/foundation.service";
import { IdempotencyService } from "../foundation/idempotency.service";
import { currentCorrelationId } from "../observability/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { OperationsAccess, UUID_RE } from "./operations.access";

@Injectable()
export class DisciplinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OperationsAccess,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
    private readonly foundation: FoundationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    session: RequestSession,
    organizationId: string,
    query: { projectId?: string; includeInactive?: boolean },
  ) {
    this.access.requirePathOrganization(session, organizationId);
    if (query.projectId) {
      await this.access.requireProject(session, "project.read", query.projectId);
    } else {
      await this.assertCatalogVisible(session, organizationId);
    }
    const includeInactive = Boolean(query.includeInactive);
    const canManage = await this.canManageCatalogs(session);
    const rows = await this.prisma.discipline.findMany({
      where: {
        organizationId: session.activeOrganizationId!,
        ...(includeInactive && canManage ? {} : { active: true }),
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { id: "asc" }],
    });
    return { items: rows.map((row) => this.toDto(row)) };
  }

  async create(
    session: RequestSession,
    organizationId: string,
    idempotencyKey: string | undefined,
    input: { code: string; name: string; sortOrder?: number; organizationId?: string },
  ) {
    this.access.requirePathOrganization(session, organizationId);
    const context = await this.authz.assert(session, "organization.manage_catalogs");
    this.access.rejectClientAuthority(input, context.organizationId);
    const started = await this.idempotency.begin(context.organizationId, idempotencyKey, {
      code: input.code,
      name: input.name,
      sortOrder: input.sortOrder ?? null,
    });
    if (started.replay) {
      return started.replay.responseBody;
    }
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code || !name) {
      throw new OperationsStateError("Discipline code and name are required");
    }
    const created = await this.prisma.$transaction(async (tx) => {
      let row;
      try {
        row = await tx.discipline.create({
          data: {
            organizationId: context.organizationId,
            code,
            name,
            active: true,
            sortOrder: input.sortOrder ?? null,
          },
        });
      } catch (error) {
        this.rethrowUnique(error);
        throw error;
      }
      await this.audit.insert(
        {
          organizationId: row.organizationId,
          actorUserId: session.userId,
          eventType: "DISCIPLINE_CREATED",
          resourceType: "discipline",
          resourceId: row.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ code: row.code, name: row.name }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.DisciplineCreated,
        { organizationId: row.organizationId, disciplineId: row.id, code: row.code },
        currentCorrelationId(),
        tx,
      );
      const body = this.toDto(row);
      await this.idempotency.commit(context.organizationId, started.key, started.hash, 201, body, tx);
      return body;
    });
    return created;
  }

  async update(
    session: RequestSession,
    organizationId: string,
    disciplineId: string,
    input: { name?: string; active?: boolean; sortOrder?: number | null; code?: string; organizationId?: string },
  ) {
    this.access.requirePathOrganization(session, organizationId);
    const context = await this.authz.assert(session, "organization.manage_catalogs");
    this.access.rejectClientAuthority(input, context.organizationId);
    if (!UUID_RE.test(disciplineId)) {
      throw new DenyByDefaultError("Client disciplineId is not authoritative");
    }
    if (input.code) {
      throw new OperationsStateError("Discipline code is a historical identifier and cannot be renamed");
    }
    const row = await this.prisma.discipline.findUnique({ where: { id: disciplineId } });
    if (!row || row.organizationId !== context.organizationId) {
      throw new DenyByDefaultError("Discipline is not bound to the authorized Organization");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.discipline.update({
        where: { id: row.id },
        data: {
          name: input.name !== undefined ? input.name.trim() : row.name,
          active: input.active ?? row.active,
          sortOrder: input.sortOrder === undefined ? row.sortOrder : input.sortOrder,
        },
      });
      await this.audit.insert(
        {
          organizationId: next.organizationId,
          actorUserId: session.userId,
          eventType: "DISCIPLINE_UPDATED",
          resourceType: "discipline",
          resourceId: next.id,
          correlationId: currentCorrelationId(),
          payload: redactSecrets({ code: next.code, active: next.active }),
        },
        tx,
      );
      await this.foundation.appendOutbox(
        OUTBOX_EVENT_TYPES.DisciplineUpdated,
        { organizationId: next.organizationId, disciplineId: next.id, code: next.code },
        currentCorrelationId(),
        tx,
      );
      return this.toDto(next);
    });
    return updated;
  }

  private async assertCatalogVisible(session: RequestSession, organizationId: string) {
    if (await this.canManageCatalogs(session)) {
      return;
    }
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: session.userId },
      },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new DenyByDefaultError("ACTIVE membership is required");
    }
    const projectMembership = await this.prisma.projectMembership.findFirst({
      where: {
        organizationMembershipId: membership.id,
        status: "ACTIVE",
        project: { organizationId },
      },
      include: {
        roleAssignments: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
      },
    });
    const hasRead = projectMembership?.roleAssignments.some((assignment) =>
      assignment.role.rolePermissions.some((row) => row.permission.code === "project.read"),
    );
    if (!hasRead) {
      throw new DenyByDefaultError("Missing permission project.read");
    }
  }

  private async canManageCatalogs(session: RequestSession): Promise<boolean> {
    try {
      await this.authz.assert(session, "organization.manage_catalogs");
      return true;
    } catch {
      return false;
    }
  }

  private rethrowUnique(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new OperationsStateError("Discipline code must be unique (case-insensitive) in the Organization");
    }
    const message = error instanceof Error ? error.message : "";
    if (/disciplines_org_code_ci/i.test(message)) {
      throw new OperationsStateError("Discipline code must be unique (case-insensitive) in the Organization");
    }
  }

  toDto(row: {
    id: string;
    organizationId: string;
    code: string;
    name: string;
    active: boolean;
    sortOrder: number | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      code: row.code,
      name: row.name,
      active: row.active,
      sortOrder: row.sortOrder,
      normalizedCode: normalizeCatalogCode(row.code),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
