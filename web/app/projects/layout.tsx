import { redirect } from "next/navigation";
import { AppShell } from "../../components/shell/AppShell";
import { ShellProvider } from "../../components/session/ShellProvider";
import { postAuthDestination } from "../../lib/guards";
import { loadSession } from "../../lib/server-session";

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

  return (
    <ShellProvider initialSession={session}>
      <AppShell>{children}</AppShell>
    </ShellProvider>
  );
}
