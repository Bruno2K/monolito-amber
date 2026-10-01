export const DELIVERABLE_STATUS_ORDER = [
  "PLANNED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "APPROVED",
  "DELIVERED",
  "CANCELLED",
] as const;

export interface HubSignalEnvelope {
  origin: string;
  derivation: string;
}

export interface HubListItem {
  id: string;
  kind?: "DELIVERABLE" | "WORK_PACKAGE";
  code?: string | null;
  title: string;
  status: string;
  dueAt?: string | null;
  blockedReason?: string | null;
  href?: { ui: string; api: string };
}

export interface HubListPage {
  origin: string;
  derivation: string;
  items: HubListItem[];
  nextCursor: string | null;
  returned: number;
}

export interface RelatedSource {
  origin: string;
  derivation: string;
  permission: string;
  count: number;
  api: string;
}

export interface ProjectHubResponse {
  generatedAt: string;
  stale: boolean;
  freshness: {
    generatedAt: string;
    sourceMaxUpdatedAt: string | null;
    lagMs: number;
    stale: boolean;
    servedFromCache: boolean;
  };
  project: { id: string; name: string; archivedAt: string | null; organizationId: string };
  currentPhase: HubSignalEnvelope & {
    value: {
      id: string;
      name: string;
      sequence: number;
      status: string;
      plannedStartAt: string | null;
      plannedEndAt: string | null;
      href: { ui: string; api: string };
    } | null;
    activePhaseCount: number;
  };
  deliverableCountsByStatus: HubSignalEnvelope & {
    counts: Record<string, number>;
  };
  overdueDeliverables: HubListPage;
  blockedWorkPackages: HubListPage;
  lateWorkPackages: HubListPage;
  ownerGaps: HubListPage;
  upcomingMilestones: HubSignalEnvelope & {
    items: Array<{
      id: string;
      title: string;
      recordedStatus: string;
      derivedStatus: string;
      targetDate: string | null;
    }>;
    nextCursor: string | null;
    returned: number;
  };
  relatedSources: HubSignalEnvelope & {
    sources: {
      documents?: RelatedSource;
      issues?: RelatedSource;
      tasks?: RelatedSource;
      gates?: RelatedSource;
    };
  };
  lastMaterialActivity: {
    origin: string;
    derivation: string;
    items: Array<{
      id: string;
      eventType: string;
      resourceType: string;
      resourceId: string | null;
      createdAt: string | null;
    }>;
    returned: number;
  } | null;
  links: {
    structure: string;
    deliverables: string;
    workPackages: string;
  };
}

export function hubItemLabel(item: HubListItem): string {
  return item.code ? `${item.code} · ${item.title}` : item.title;
}

export function uniqueHubItems(items: HubListItem[]): HubListItem[] {
  const seen = new Set<string>();
  const unique: HubListItem[] = [];
  for (const item of items) {
    const key = `${item.kind ?? "row"}-${item.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

export function relatedSourceKeys(sources: ProjectHubResponse["relatedSources"]["sources"]): string[] {
  return Object.keys(sources).filter((key) => sources[key as keyof typeof sources]);
}
