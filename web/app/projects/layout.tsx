import { redirect } from "next/navigation";
import { AppShell } from "../../components/shell/AppShell";
import { ShellProvider } from "../../components/session/ShellProvider";
import { postAuthDestination } from "../../lib/guards";
import { loadOrganizations, loadSession, loadVisibleProjects } from "../../lib/server-session";

export const dynamic = "force-dynamic";

export default async function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const result = await loadSession();
  if (!result.ok || !result.body.authenticated) {
    redirect("/sign-in");
  }
  const session = result.body;
  const dest = postAuthDestination(session);
  if (dest !== "/projects") {
    redirect(dest);
  }

  const [orgs, projects] = await Promise.all([loadOrganizations(), loadVisibleProjects()]);

  return (
    <ShellProvider
      initialSession={session}
      initialOrganizations={orgs.ok ? orgs.body : []}
      initialProjects={projects.ok ? projects.body : []}
    >
      <AppShell>{children}</AppShell>
    </ShellProvider>
  );
}
