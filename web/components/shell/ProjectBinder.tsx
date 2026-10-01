"use client";

import { useEffect, type ReactNode } from "react";
import type { ProjectDetail, UiStateKind } from "../../lib/types";
import { useShell } from "../session/ShellProvider";

export function ProjectBinder({
  project,
  access,
  children,
}: {
  project: ProjectDetail | null;
  access: UiStateKind | "ok";
  children: ReactNode;
}) {
  const { bindProject } = useShell();

  useEffect(() => {
    bindProject(project, access);
    return () => bindProject(null);
  }, [access, bindProject, project]);

  return <>{children}</>;
}
