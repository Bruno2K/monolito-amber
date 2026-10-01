"use client";

import Link from "next/link";
import { StateScreen } from "../../components/shell/StateScreen";
import { useShell } from "../../components/session/ShellProvider";

export default function ProjectsPage() {
  const { state } = useShell();
  const visible = state.projects.filter((row) => !row.archivedAt);

  if (state.status === "loading" && visible.length === 0 && !state.session?.activeOrganizationId) {
    return <StateScreen kind="loading" />;
  }

  if (visible.length === 0) {
    return (
      <div className="projects-page">
        <StateScreen kind="empty" />
      </div>
    );
  }

  return (
    <div className="projects-page">
      <h1>Todos os Projetos</h1>
      <p>Projetos com ProjectMembership ACTIVE e permissão project.read na Organization da sessão.</p>
      <ul className="project-card-list">
        {visible.map((project) => (
          <li key={project.id}>
            <Link className="project-card" href={`/projects/${project.id}/overview`}>
              <strong>{project.name}</strong>
              <span>{project.status ?? "ACTIVE"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
