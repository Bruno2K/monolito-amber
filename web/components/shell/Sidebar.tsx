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
}: {
  item: NavItemDef;
  projectId?: string | null;
  active: boolean;
}) {
  const href = resolveNavHref(item, projectId);
  const comingLater = item.availability === "coming-later" || !href;
  const className = `nav-item${active ? " is-active" : ""}${comingLater ? " is-disabled" : ""}`;
  const inner = (
    <>
      <span className="nav-icon">
        <Icon name={item.icon} />
      </span>
      <span className="nav-label">{item.label}</span>
      {item.hasChildren ? (
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
    <Link className={className} href={href} aria-current={active ? "page" : undefined}>
      {inner}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { state, switchOrganization } = useShell();
  const session = state.session;
  const activeOrg = state.organizations.find((org) => org.active) ?? state.organizations.find((org) => org.id === session?.activeOrganizationId);
  const projectId = state.currentProject?.id ?? null;
  const activeItem = matchNavItem(pathname, projectId);

  return (
    <aside className="shell-sidebar" data-node-id="230:142">
      <div className="sidebar-brand">
        <div className="logo-row">
          <span className="logo-mark" aria-hidden="true">
            A
          </span>
          <span className="brand-name">AMBER</span>
          <span className="brand-badge">BIM</span>
        </div>
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
      </div>

      <nav className="sidebar-nav" aria-label="Navegação do aplicativo">
        <div className="nav-group" aria-labelledby="nav-global">
          <p id="nav-global" className="nav-group-label">
            Global
          </p>
          {GLOBAL_NAV.map((item) => (
            <NavButton key={item.id} item={item} active={activeItem?.id === item.id} />
          ))}
        </div>
        <div className="nav-group" aria-labelledby="nav-project">
          <p id="nav-project" className="nav-group-label">
            Projeto
          </p>
          {PROJECT_NAV.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              projectId={projectId}
              active={activeItem?.id === item.id}
            />
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        <p className="sidebar-version">
          <span className="version-dot" aria-hidden="true" />
          local
        </p>
        <span className="sidebar-collapse" aria-hidden="true">
          <ChevronLeft />
        </span>
      </div>
    </aside>
  );
}
