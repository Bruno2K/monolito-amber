"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { breadcrumbsFor } from "../../lib/nav";
import { BellIcon, SearchIcon } from "./Icons";
import { useShell } from "../session/ShellProvider";

function initials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function roleLabel(templateKey: string | undefined): string {
  if (!templateKey) {
    return "";
  }
  return templateKey.replaceAll("_", " ");
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, logout } = useShell();
  const project = state.currentProject;
  const crumbs = breadcrumbsFor({
    pathname,
    projectName: project?.name,
    projectId: project?.id,
  });
  const isProject = Boolean(project);
  const visibleProjects = state.projects.filter((row) => !row.archivedAt);
  const displayName = state.session?.displayName ?? state.session?.email ?? "Usuário";
  const templateKey = project?.roles?.[0]?.templateKey;

  return (
    <header className="shell-header" data-node-id="230:216">
      <div className="header-left">
        <nav className="breadcrumbs" aria-label="Trilha de navegação">
          {crumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="crumb">
              {index > 0 ? (
                <span className="crumb-sep" aria-hidden="true">
                  /
                </span>
              ) : null}
              {crumb.href && !crumb.current ? (
                <Link href={crumb.href}>{crumb.label}</Link>
              ) : (
                <span className={crumb.current ? "crumb-current" : undefined} aria-current={crumb.current ? "page" : undefined}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
        {isProject ? (
          <span className="status-badge status-active">Ativo</span>
        ) : (
          <span className="status-badge status-global">Global</span>
        )}
        {visibleProjects.length > 0 ? (
          <label className="sr-only" htmlFor="project-switcher">
            Projeto visível
          </label>
        ) : null}
        {visibleProjects.length > 0 ? (
          <select
            id="project-switcher"
            className="project-switcher"
            value={project?.id ?? ""}
            onChange={(event) => {
              const id = event.target.value;
              if (id) {
                router.push(`/projects/${id}/overview`);
              } else {
                router.push("/projects");
              }
            }}
            aria-label="Selecionar projeto visível"
          >
            <option value="">Todos os Projetos</option>
            {visibleProjects.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="header-right">
        <div className="search-field" title="Busca disponível em um marco posterior">
          <SearchIcon />
          <input type="search" placeholder="Buscar..." disabled aria-label="Busca indisponível neste marco" />
          <kbd>⌘K</kbd>
        </div>
        <button type="button" className="icon-button" disabled aria-label="Notificações indisponíveis neste marco">
          <BellIcon />
        </button>
        <div className="header-divider" aria-hidden="true" />
        <div className="user-chip">
          <span className="avatar" aria-hidden="true">
            {initials(state.session?.displayName, state.session?.email)}
          </span>
          <span className="user-meta">
            <span className="user-name">{displayName}</span>
            {templateKey ? <span className="user-role">{roleLabel(templateKey)}</span> : null}
          </span>
          <button type="button" className="text-button" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
