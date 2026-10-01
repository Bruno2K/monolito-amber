"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, IdentityFrame } from "../../components/ui";
import { api } from "../../lib/api";
import { StateScreen } from "../../components/shell/StateScreen";
import type { OrganizationRow } from "../../lib/types";

export default function OrgSwitchPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await api<OrganizationRow[]>("/api/v1/organizations");
    if (!result.ok) {
      if (result.status === 401) {
        router.replace("/sign-in");
        return;
      }
      setError("Sign in to switch organization");
      setLoading(false);
      return;
    }
    setOrgs(result.body);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSwitch(event: FormEvent, organizationId: string) {
    event.preventDefault();
    const result = await api("/api/v1/auth/active-organization", {
      method: "POST",
      body: JSON.stringify({ organizationId }),
    });
    if (!result.ok) {
      setError("Organization switch denied");
      return;
    }
    router.push("/projects");
  }

  const activeOrgs = orgs.filter((org) => org.status === "ACTIVE");

  return (
    <IdentityFrame title="Switch organization" banner="Org switcher — session-bound tenant, not a product screen">
      <p>The active Organization is stored on the server session. Client org ids are never authority.</p>
      <ErrorText>{error}</ErrorText>
      {loading ? <StateScreen kind="loading" /> : null}
      {!loading && activeOrgs.length === 0 ? (
        <StateScreen kind="no-org" detail="Nenhuma Organization ACTIVE está disponível para esta sessão." />
      ) : null}
      <ul className="org-list">
        {orgs.map((org) => (
          <li key={org.id}>
            <strong>{org.name}</strong> — {org.status} / {org.type}
            {org.active ? " (active)" : null}
            {!org.active && org.status === "ACTIVE" ? (
              <form onSubmit={(event) => onSwitch(event, org.id)}>
                <Button>Switch</Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </IdentityFrame>
  );
}
