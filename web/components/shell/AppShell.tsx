"use client";

import type { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { StateScreen } from "./StateScreen";
import { useShell } from "../session/ShellProvider";
import { userFacingMessage } from "../../lib/errors";
import { useSidebarCollapsed } from "../../lib/sidebar-collapse";

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useShell();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  return (
    <div className="shell-root" data-collapsed={collapsed ? "true" : undefined}>
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      <div className="shell-main-column">
        <Header />
        <main className="shell-content" id="main-content">
          {state.status === "error" && state.error ? (
            <StateScreen kind="error" detail={userFacingMessage("error", state.error)} />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
