export type NavGroup = "global" | "project";
export type NavAvailability = "available" | "coming-later";
export type IconName =
  | "folder"
  | "calendar"
  | "clock"
  | "layout"
  | "layers"
  | "people"
  | "file"
  | "shield"
  | "activity"
  | "structure";

export interface NavItemDef {
  id: string;
  label: string;
  group: NavGroup;
  /** Path template; omit when the item is not delivered. */
  href?: string;
  availability: NavAvailability;
  icon: IconName;
  hasChildren?: boolean;
}

export const GLOBAL_NAV: readonly NavItemDef[] = [
  {
    id: "projects",
    label: "Todos os Projetos",
    group: "global",
    href: "/projects",
    availability: "available",
    icon: "folder",
  },
  {
    id: "calendars",
    label: "Meus Calendários",
    group: "global",
    availability: "coming-later",
    icon: "calendar",
  },
  {
    id: "messages",
    label: "Mensagens",
    group: "global",
    availability: "coming-later",
    icon: "clock",
  },
];

export const PROJECT_NAV: readonly NavItemDef[] = [
  {
    id: "overview",
    label: "Visão Geral",
    group: "project",
    href: "/projects/:projectId/overview",
    availability: "available",
    icon: "layout",
  },
  {
    id: "structure",
    label: "Estrutura",
    group: "project",
    href: "/projects/:projectId/structure",
    availability: "available",
    icon: "structure",
  },
  {
    id: "planning",
    label: "Planejamento",
    group: "project",
    availability: "coming-later",
    icon: "calendar",
  },
  {
    id: "deliverables",
    label: "Entregas",
    group: "project",
    href: "/projects/:projectId/deliverables",
    availability: "available",
    icon: "layers",
  },
  {
    id: "coordination",
    label: "Coordenação",
    group: "project",
    availability: "coming-later",
    icon: "people",
    hasChildren: true,
  },
  {
    id: "documents",
    label: "Documentos",
    group: "project",
    availability: "coming-later",
    icon: "file",
  },
  {
    id: "team",
    label: "Equipe",
    group: "project",
    availability: "coming-later",
    icon: "people",
  },
  {
    id: "governance",
    label: "Governança",
    group: "project",
    availability: "coming-later",
    icon: "shield",
    hasChildren: true,
  },
  {
    id: "activity",
    label: "Atividade",
    group: "project",
    availability: "coming-later",
    icon: "activity",
  },
];

export const SHELL_NAV = [...GLOBAL_NAV, ...PROJECT_NAV] as const;

export function resolveNavHref(item: NavItemDef, projectId?: string | null): string | null {
  if (item.availability !== "available" || !item.href) {
    return null;
  }
  if (item.href.includes(":projectId")) {
    if (!projectId) {
      return null;
    }
    return item.href.replace(":projectId", projectId);
  }
  return item.href;
}

export function matchNavItem(pathname: string, projectId?: string | null): NavItemDef | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/projects") {
    return GLOBAL_NAV[0] ?? null;
  }
  for (const item of PROJECT_NAV) {
    const href = resolveNavHref(item, projectId);
    if (href && (normalized === href || normalized.startsWith(`${href}/`))) {
      return item;
    }
  }
  return null;
}

export function isGlobalPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/projects" || normalized === "/org-switch";
}

export interface Breadcrumb {
  label: string;
  href?: string;
  current?: boolean;
}

export function breadcrumbsFor(input: {
  pathname: string;
  projectName?: string | null;
  projectId?: string | null;
}): Breadcrumb[] {
  const active = matchNavItem(input.pathname, input.projectId);
  if (isGlobalPath(input.pathname) || !input.projectId || !input.projectName) {
    return [
      { label: "Global" },
      { label: active?.label ?? "Todos os Projetos", href: "/projects", current: true },
    ];
  }
  const crumbs: Breadcrumb[] = [
    { label: "Projetos", href: "/projects" },
    {
      label: input.projectName,
      href: `/projects/${input.projectId}/overview`,
      current: !active || active.id === "overview",
    },
  ];
  if (active && active.id !== "overview") {
    crumbs.push({ label: active.label, current: true });
  }
  return crumbs;
}
