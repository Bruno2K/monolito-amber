import { Injectable } from "@nestjs/common";
import {
  HUB_SIGNAL_CATALOG,
  OperationsStateError,
  clampHubListLimit,
  decodeHubCursor,
  encodeHubCursor,
  hasPermission,
  isHubStale,
  relatedSourcePermission,
  selectCurrentPhase,
  zeroFilledDeliverableCounts,
  type DeliverableStatus,
} from "@amber/shared";
import type { RequestSession } from "../auth/session.types";
import { PrismaService } from "../prisma/prisma.service";
import { HubCacheService } from "./hub.cache";
import { OperationsAccess } from "./operations.access";

export interface ProjectHubQuery {
  limit?: number;
  overdueCursor?: string;
  blockedCursor?: string;
  lateCursor?: string;
  ownerGapCursor?: string;
  milestoneCursor?: string;
  refresh?: string;
}

type ListedItem = {
  id: string;
  code?: string | null;
  title: string;
  status: string;
  dueAt: Date | null;
  phaseId?: string;
  blockedReason?: string | null;
};

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function page<T>(rows: T[], take: number, encode: (row: T) => string) {
  const items = rows.slice(0, take);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > take && last ? encode(last) : null,
    returned: items.length,
  };
}

function parseCursor(cursor: string | undefined): Record<string, string> | null {
  if (!cursor) {
    return null;
  }
  return decodeHubCursor(cursor);
}

function dueIdAdvance(cursor: Record<string, string> | null) {
  if (!cursor?.dueAt || !cursor.id) {
    return {};
  }
  const dueAt = new Date(cursor.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    throw new OperationsStateError("Invalid hub list cursor");
  }
  return {
    OR: [{ dueAt: { gt: dueAt } }, { dueAt, id: { gt: cursor.id } }],
  };
}

function idAdvance(cursor: Record<string, string> | null) {
  if (!cursor?.id) {
    return {};
  }
  return { id: { gt: cursor.id } };
}

function wantsFresh(refresh: string | undefined): boolean {
  if (!refresh) {
    return true;
  }
  const normalized = refresh.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false" && normalized !== "no";
}

@Injectable()
export class HubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OperationsAccess,
    private readonly cache: HubCacheService,
  ) {}

  async get(session: RequestSession, projectId: string, query: ProjectHubQuery) {
    const started = Date.now();
    let queryCount = 0;
    const counted = async <T>(promise: Promise<T>): Promise<T> => {
      queryCount += 1;
      return promise;
    };

    const bound = await this.access.requireProject(session, "project.read", projectId);
    const permissionFingerprint = [...new Set(bound.context.grants.flatMap((grant) => grant.permissions))]
      .sort()
      .join(",");
    const cacheKey = this.cache.key({ projectId, userId: session.userId, permissionFingerprint });
    const canDocuments = hasPermission(bound.context, "document.read");
    const canGates = hasPermission(bound.context, "gate.read");
    const canAudit =
      bound.context.membershipType !== "EXTERNAL" && hasPermission(bound.context, "organization.read_audit");
    const now = new Date();
    const take = clampHubListLimit(query.limit);
    const cached = this.cache.get<ReturnType<HubService["assemble"]>>(cacheKey);

    const sourceMax = async () => {
      const rows = await counted(
        this.prisma.$queryRaw<Array<{ source_max: Date | null }>>`
          SELECT GREATEST(
            (SELECT MAX(updated_at) FROM operations.phases WHERE project_id = ${projectId}::uuid AND organization_id = ${bound.organizationId}::uuid),
            (SELECT MAX(updated_at) FROM operations.deliverables WHERE project_id = ${projectId}::uuid AND organization_id = ${bound.organizationId}::uuid),
            (SELECT MAX(updated_at) FROM operations.work_packages WHERE project_id = ${projectId}::uuid AND organization_id = ${bound.organizationId}::uuid),
            (SELECT MAX(updated_at) FROM planning.milestones WHERE project_id = ${projectId}::uuid AND organization_id = ${bound.organizationId}::uuid)
          ) AS source_max
        `,
      );
      return rows[0]?.source_max ?? null;
    };

    if (cached) {
      const liveMax = await sourceMax();
      const stale = isHubStale({
        generatedAt: new Date(cached.generatedAt),
        sourceMaxUpdatedAt: liveMax,
        servedFromCache: true,
      });
      if (!wantsFresh(query.refresh) || !stale) {
        return {
          ...cached.payload,
          stale,
          freshness: {
            ...cached.payload.freshness,
            sourceMaxUpdatedAt: iso(liveMax) ?? cached.payload.freshness.sourceMaxUpdatedAt,
            lagMs: liveMax ? Math.max(0, liveMax.getTime() - new Date(cached.generatedAt).getTime()) : 0,
            stale,
            servedFromCache: true,
          },
          observability: {
            queryCount,
            elapsedMs: Date.now() - started,
            servedFromCache: true,
          },
        };
      }
    }

    const overdueCursor = parseCursor(query.overdueCursor);
    const blockedCursor = parseCursor(query.blockedCursor);
    const lateCursor = parseCursor(query.lateCursor);
    const ownerGapCursor = parseCursor(query.ownerGapCursor);
    const milestoneCursor = parseCursor(query.milestoneCursor);

    const [
      phases,
      deliverableGroups,
      overdueRows,
      blockedRows,
      lateRows,
      gapDeliverables,
      gapWorkPackages,
      milestoneRows,
      sourceMaxUpdatedAt,
      documentCount,
      issueCount,
      taskCount,
      gateCount,
      activityRows,
    ] = await Promise.all([
      counted(
        this.prisma.phase.findMany({
          where: { projectId, organizationId: bound.organizationId, archivedAt: null },
          orderBy: [{ sequence: "asc" }, { id: "asc" }],
          take: 50,
        }),
      ),
      counted(
        this.prisma.deliverable.groupBy({
          by: ["status"],
          where: { projectId, organizationId: bound.organizationId, archivedAt: null },
          _count: { _all: true },
        }),
      ),
      counted(
        this.prisma.deliverable.findMany({
          where: {
            projectId,
            organizationId: bound.organizationId,
            archivedAt: null,
            dueAt: { not: null, lt: now },
            status: { notIn: ["DELIVERED", "CANCELLED"] },
            ...dueIdAdvance(overdueCursor),
          },
          orderBy: [{ dueAt: "asc" }, { id: "asc" }],
          take: take + 1,
        }),
      ),
      counted(
        this.prisma.workPackage.findMany({
          where: {
            projectId,
            organizationId: bound.organizationId,
            archivedAt: null,
            status: "BLOCKED",
            ...idAdvance(blockedCursor),
          },
          orderBy: [{ id: "asc" }],
          take: take + 1,
        }),
      ),
      counted(
        this.prisma.workPackage.findMany({
          where: {
            projectId,
            organizationId: bound.organizationId,
            archivedAt: null,
            dueAt: { not: null, lt: now },
            status: { notIn: ["DONE", "CANCELLED"] },
            ...dueIdAdvance(lateCursor),
          },
          orderBy: [{ dueAt: "asc" }, { id: "asc" }],
          take: take + 1,
        }),
      ),
      counted(
        this.prisma.deliverable.findMany({
          where: {
            projectId,
            organizationId: bound.organizationId,
            archivedAt: null,
            ownerProjectMembershipId: null,
            ownerTeamId: null,
            ...idAdvance(ownerGapCursor),
          },
          orderBy: [{ id: "asc" }],
          take: take + 1,
          select: { id: true, code: true, title: true, status: true, dueAt: true, phaseId: true },
        }),
      ),
      counted(
        this.prisma.workPackage.findMany({
          where: {
            projectId,
            organizationId: bound.organizationId,
            archivedAt: null,
            ownerProjectMembershipId: null,
            ownerTeamId: null,
            ...idAdvance(ownerGapCursor),
          },
          orderBy: [{ id: "asc" }],
          take: take + 1,
          select: { id: true, code: true, title: true, status: true, dueAt: true, phaseId: true },
        }),
      ),
      counted(
        this.prisma.milestone.findMany({
          where: {
            projectId,
            organizationId: bound.organizationId,
            status: "PLANNED",
            targetDate: { not: null, gte: now },
            ...dueIdAdvance(milestoneCursor),
          },
          orderBy: [{ targetDate: "asc" }, { id: "asc" }],
          take: take + 1,
        }),
      ),
      sourceMax(),
      canDocuments
        ? counted(
            this.prisma.document.count({
              where: { projectId, organizationId: bound.organizationId, archivedAt: null },
            }),
          )
        : Promise.resolve(null),
      counted(
        this.prisma.issue.count({
          where: {
            projectId,
            organizationId: bound.organizationId,
            status: { notIn: ["CLOSED", "REJECTED", "CANCELLED"] },
          },
        }),
      ),
      counted(
        this.prisma.task.count({
          where: { projectId, organizationId: bound.organizationId, status: { notIn: ["DONE", "CANCELLED"] } },
        }),
      ),
      canGates
        ? counted(this.prisma.gate.count({ where: { projectId, organizationId: bound.organizationId } }))
        : Promise.resolve(null),
      canAudit
        ? counted(
            this.prisma.auditEvent.findMany({
              where: { projectId, organizationId: bound.organizationId },
              orderBy: { createdAt: "desc" },
              take,
              select: { id: true, eventType: true, resourceType: true, resourceId: true, createdAt: true },
            }),
          )
        : Promise.resolve(null),
    ]);

    const milestoneIds = milestoneRows.map((row) => row.id);
    const lateLinkedTasks =
      milestoneIds.length === 0
        ? []
        : await counted(
            this.prisma.task.findMany({
              where: {
                projectId,
                organizationId: bound.organizationId,
                milestoneId: { in: milestoneIds },
                status: { notIn: ["DONE", "CANCELLED"] },
                dueDate: { not: null, lt: now },
              },
              select: { milestoneId: true },
            }),
          );
    const lateByMilestone = new Set(lateLinkedTasks.map((row) => row.milestoneId).filter(Boolean) as string[]);

    const currentPhase = selectCurrentPhase(phases);
    const deliverableCounts = zeroFilledDeliverableCounts(
      deliverableGroups.map((row) => ({ status: row.status, count: row._count._all })),
    );

    const asDeliverable = (row: ListedItem) => ({
      id: row.id,
      kind: "DELIVERABLE" as const,
      code: row.code ?? null,
      title: row.title,
      status: row.status,
      dueAt: iso(row.dueAt),
      phaseId: row.phaseId ?? null,
      href: {
        ui: `/projects/${projectId}/deliverables?inspect=${row.id}`,
        api: `/api/v1/projects/${projectId}/deliverables/${row.id}`,
      },
    });
    const asWorkPackage = (row: ListedItem) => ({
      id: row.id,
      kind: "WORK_PACKAGE" as const,
      code: row.code ?? null,
      title: row.title,
      status: row.status,
      dueAt: iso(row.dueAt),
      phaseId: row.phaseId ?? null,
      blockedReason: row.blockedReason ?? null,
      href: {
        ui: `/projects/${projectId}/work-packages?inspect=${row.id}`,
        api: `/api/v1/projects/${projectId}/work-packages/${row.id}`,
      },
    });

    const ownerGapItems = [...gapDeliverables.map(asDeliverable), ...gapWorkPackages.map(asWorkPackage)]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, take + 1);

    const relatedSources: Record<string, unknown> = {};
    if (canDocuments && documentCount != null) {
      relatedSources.documents = {
        origin: "document.documents",
        derivation: HUB_SIGNAL_CATALOG.relatedSources.derivation,
        permission: relatedSourcePermission("documents"),
        count: documentCount,
        api: `/api/v1/projects/${projectId}/documents`,
      };
    }
    relatedSources.issues = {
      origin: "coordination.issues",
      derivation: HUB_SIGNAL_CATALOG.relatedSources.derivation,
      permission: relatedSourcePermission("issues"),
      count: issueCount,
      api: `/api/v1/projects/${projectId}/issues`,
    };
    relatedSources.tasks = {
      origin: "planning.tasks",
      derivation: HUB_SIGNAL_CATALOG.relatedSources.derivation,
      permission: relatedSourcePermission("tasks"),
      count: taskCount,
      api: `/api/v1/projects/${projectId}/tasks`,
    };
    if (canGates && gateCount != null) {
      relatedSources.gates = {
        origin: "governance.gates",
        derivation: HUB_SIGNAL_CATALOG.relatedSources.derivation,
        permission: relatedSourcePermission("gates"),
        count: gateCount,
        api: `/api/v1/projects/${projectId}/gates`,
      };
    }

    const generatedAt = new Date();
    const dto = this.assemble({
      project: {
        id: bound.project.id,
        name: bound.project.name,
        archivedAt: iso(bound.project.archivedAt),
        organizationId: bound.organizationId,
      },
      currentPhase: currentPhase
        ? {
            id: currentPhase.id,
            name: currentPhase.name,
            sequence: currentPhase.sequence,
            status: currentPhase.status,
            plannedStartAt: iso(currentPhase.plannedStartAt),
            plannedEndAt: iso(currentPhase.plannedEndAt),
            href: {
              ui: `/projects/${projectId}/structure?phase=${currentPhase.id}`,
              api: `/api/v1/projects/${projectId}/phases/${currentPhase.id}`,
            },
          }
        : null,
      activePhaseCount: phases.filter((row) => row.status === "ACTIVE").length,
      deliverableCounts,
      overdue: page(
        overdueRows.map(asDeliverable),
        take,
        (row) => encodeHubCursor({ dueAt: row.dueAt ?? "", id: row.id }),
      ),
      blocked: page(blockedRows.map(asWorkPackage), take, (row) => encodeHubCursor({ id: row.id })),
      late: page(
        lateRows.map(asWorkPackage),
        take,
        (row) => encodeHubCursor({ dueAt: row.dueAt ?? "", id: row.id }),
      ),
      ownerGaps: page(ownerGapItems, take, (row) => encodeHubCursor({ id: row.id, kind: row.kind })),
      milestones: page(
        milestoneRows.map((row) => ({
          id: row.id,
          title: row.title,
          recordedStatus: row.status,
          derivedStatus: lateByMilestone.has(row.id) ? "AT_RISK" : "PLANNED",
          targetDate: iso(row.targetDate),
        })),
        take,
        (row) => encodeHubCursor({ dueAt: row.targetDate ?? "", id: row.id }),
      ),
      relatedSources,
      activity: canAudit
        ? {
            ...HUB_SIGNAL_CATALOG.lastMaterialActivity,
            items: (activityRows ?? []).map((row) => ({
              id: row.id,
              eventType: row.eventType,
              resourceType: row.resourceType,
              resourceId: row.resourceId,
              createdAt: iso(row.createdAt),
            })),
            returned: (activityRows ?? []).length,
          }
        : null,
      generatedAt: generatedAt.toISOString(),
      sourceMaxUpdatedAt: iso(sourceMaxUpdatedAt),
      queryCount,
      elapsedMs: Date.now() - started,
      links: {
        structure: `/projects/${projectId}/structure`,
        deliverables: `/projects/${projectId}/deliverables`,
        workPackages: `/projects/${projectId}/work-packages`,
      },
    });

    this.cache.set(cacheKey, {
      payload: dto,
      storedAtMs: Date.now(),
      generatedAt: dto.generatedAt,
      sourceMaxUpdatedAt: dto.freshness.sourceMaxUpdatedAt,
      userId: session.userId,
      projectId,
    });
    return dto;
  }

  private assemble(input: {
    project: { id: string; name: string; archivedAt: string | null; organizationId: string };
    currentPhase: {
      id: string;
      name: string;
      sequence: number;
      status: string;
      plannedStartAt: string | null;
      plannedEndAt: string | null;
      href: { ui: string; api: string };
    } | null;
    activePhaseCount: number;
    deliverableCounts: Record<DeliverableStatus, number>;
    overdue: { items: unknown[]; nextCursor: string | null; returned: number };
    blocked: { items: unknown[]; nextCursor: string | null; returned: number };
    late: { items: unknown[]; nextCursor: string | null; returned: number };
    ownerGaps: { items: unknown[]; nextCursor: string | null; returned: number };
    milestones: { items: unknown[]; nextCursor: string | null; returned: number };
    relatedSources: Record<string, unknown>;
    activity: { origin: string; derivation: string; items: unknown[]; returned: number } | null;
    generatedAt: string;
    sourceMaxUpdatedAt: string | null;
    queryCount: number;
    elapsedMs: number;
    links: { structure: string; deliverables: string; workPackages: string };
  }) {
    return {
      generatedAt: input.generatedAt,
      stale: false,
      freshness: {
        generatedAt: input.generatedAt,
        sourceMaxUpdatedAt: input.sourceMaxUpdatedAt,
        lagMs: 0,
        stale: false,
        servedFromCache: false,
      },
      project: input.project,
      currentPhase: {
        ...HUB_SIGNAL_CATALOG.currentPhase,
        value: input.currentPhase,
        activePhaseCount: input.activePhaseCount,
      },
      deliverableCountsByStatus: {
        ...HUB_SIGNAL_CATALOG.deliverableCountsByStatus,
        counts: input.deliverableCounts,
      },
      overdueDeliverables: {
        ...HUB_SIGNAL_CATALOG.overdueDeliverables,
        ...input.overdue,
      },
      blockedWorkPackages: {
        ...HUB_SIGNAL_CATALOG.blockedWorkPackages,
        ...input.blocked,
      },
      lateWorkPackages: {
        ...HUB_SIGNAL_CATALOG.lateWorkPackages,
        ...input.late,
      },
      ownerGaps: {
        ...HUB_SIGNAL_CATALOG.ownerGaps,
        ...input.ownerGaps,
      },
      upcomingMilestones: {
        ...HUB_SIGNAL_CATALOG.upcomingMilestones,
        ...input.milestones,
      },
      relatedSources: {
        ...HUB_SIGNAL_CATALOG.relatedSources,
        sources: input.relatedSources,
      },
      lastMaterialActivity: input.activity,
      links: input.links,
      observability: {
        queryCount: input.queryCount,
        elapsedMs: input.elapsedMs,
        servedFromCache: false,
      },
    };
  }
}
