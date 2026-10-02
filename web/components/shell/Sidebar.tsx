"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GLOBAL_NAV, PROJECT_NAV, matchNavItem, resolveNavHref } from "../../lib/nav";
import type { NavItemDef } from "../../lib/nav";
import { ChevronDown, ChevronLeft, Icon, NavChevron } from "./Icons";
import { useShell } from "../session/ShellProvider";

function orgHue(id: string): string {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return `hsl(${hash} 45% 42%)`;
}

function NavButton({
  item,
  projectId,
  active,
  collapsed,
}: {
  item: NavItemDef;
  projectId?: string | null;
  active: boolean;
  collapsed: boolean;
}) {
  const href = resolveNavHref(item, projectId);
  const comingLater = item.availability === "coming-later" || !href;
  const className = `nav-item${active ? " is-active" : ""}${comingLater ? " is-disabled" : ""}`;
  const showChevron = Boolean(item.hasChildren && !comingLater);
  const inner = (
    <>
      <span className="nav-icon">
        <Icon name={item.icon} />
      </span>
      <span className={collapsed ? "nav-label sr-only" : "nav-label"}>{item.label}</span>
      {showChevron ? (
        <span className="nav-chevron">
          <NavChevron />
        </span>
      ) : null}
      {active ? <span className="nav-active-dot" aria-hidden="true" /> : null}
    </>
  );

  if (comingLater) {
    return (
      <span className={className} aria-disabled="true" title="Disponível em um marco posterior">
        {inner}
        <span className="sr-only">Indisponível neste marco</span>
      </span>
    );
  }

  return (
    <Link
      className={className}
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
    >
      {inner}
    </Link>
  );
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();
  const { state, switchOrganization } = useShell();
  const session = state.session;
  const activeOrg = state.organizations.find((org) => org.active) ?? state.organizations.find((org) => org.id === session?.activeOrganizationId);
  const projectId = state.currentProject?.id ?? null;
  const activeItem = matchNavItem(pathname, projectId);

  return (
    <aside className="shell-sidebar" data-node-id="230:142" data-collapsed={collapsed ? "true" : undefined}>
      <div className="sidebar-brand">
        <div className="logo-row">
          <span className="logo-mark" aria-hidden="true">
            A
          </span>
          <span className={collapsed ? "brand-name sr-only" : "brand-name"}>AMBER</span>
          <span className={collapsed ? "brand-badge sr-only" : "brand-badge"}>BIM</span>
        </div>
        {collapsed ? null : (
          <>
            <label className="sr-only" htmlFor="org-switcher">
              Organization ativa
            </label>
            <div className="org-selector">
              <span className="org-swatch" style={{ background: activeOrg ? orgHue(activeOrg.id) : "#374151" }} aria-hidden="true" />
              <select
                id="org-switcher"
                value={session?.activeOrganizationId ?? ""}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next && next !== session?.activeOrganizationId) {
                    void switchOrganization(next);
                  }
                }}
                aria-label="Trocar Organization"
              >
                {!state.organizations.some((org) => org.id === session?.activeOrganizationId) ? (
                  <option value={session?.activeOrganizationId ?? ""}>Organization</option>
                ) : null}
                {state.organizations
                  .filter((org) => org.status === "ACTIVE")
                  .map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
              </select>
              <span className="org-chevron" aria-hidden="true">
                <ChevronDown />
              </span>
            </div>
          </>
        )}
      </div>

      <nav id="shell-sidebar-nav" className="sidebar-nav" aria-label="Navegação do aplicativo">
        <div className="nav-group" aria-labelledby="nav-global">
          <p id="nav-global" className={collapsed ? "nav-group-label sr-only" : "nav-group-label"}>
            Global
          </p>
          {GLOBAL_NAV.map((item) => (
            <NavButton key={item.id} item={item} active={activeItem?.id === item.id} collapsed={collapsed} />
          ))}
        </div>
        <div className="nav-group" aria-labelledby="nav-project">
          <p id="nav-project" className={collapsed ? "nav-group-label sr-only" : "nav-group-label"}>
            Projeto
          </p>
          {PROJECT_NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              projectId={projectId}
              active={activeItem?.id === item.id}
              collapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        <p className={collapsed ? "sidebar-version sr-only" : "sidebar-version"}>
          <span className="version-dot" aria-hidden="true" />
          local
        </p>
        <button
          type="button"
          className="sidebar-collapse"
          aria-expanded={!collapsed}
          aria-controls="shell-sidebar-nav"
          onClick={onToggleCollapse}
        >
          <ChevronLeft />
          <span className="sr-only">{collapsed ? "Expandir navegação" : "Recolher navegação"}</span>
        </button>
      </div>
    </aside>
  );
}
