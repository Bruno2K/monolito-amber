import { redirect } from "next/navigation";
import { destinationAfterAuth } from "../lib/guards";
import { loadSession } from "../lib/server-session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await loadSession();
  const session = result.ok
    ? result.body
    : { authenticated: false, userId: null, email: null, displayName: null, activeOrganizationId: null };
  redirect(destinationAfterAuth(session));
}
