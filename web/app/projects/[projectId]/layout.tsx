import { redirect } from "next/navigation";
import { ProjectBinder } from "../../../components/shell/ProjectBinder";
import { StateScreen } from "../../../components/shell/StateScreen";
import { resolveProjectAccess } from "../../../lib/server-session";
import { postAuthDestination, signInPathForExpiry } from "../../../lib/guards";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const result = await resolveProjectAccess(projectId);

  if (result.kind === "unauthenticated" || result.kind === "expired") {
    redirect(signInPathForExpiry());
  }
  if (result.kind === "no-org") {
    redirect("/org-switch");
  }
  if (result.session) {
    const dest = postAuthDestination(result.session);
    if (dest !== "/projects") {
      redirect(dest);
    }
  }

  if (result.kind !== "ok") {
    return (
      <ProjectBinder project={null} access={result.kind}>
        <StateScreen
          kind={result.kind}
          action={
            result.kind === "no-permission" || result.kind === "inactive"
              ? { href: "/projects", label: "Voltar aos projetos visíveis" }
              : undefined
          }
        />
      </ProjectBinder>
    );
  }

  return (
    <ProjectBinder project={result.project} access="ok">
      {children}
    </ProjectBinder>
  );
}
