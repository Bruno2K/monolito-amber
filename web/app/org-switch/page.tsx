"use client";

import { FormEvent, useEffect, useState } from "react";
import { Banner, Button, ErrorText } from "../../components/ui";
import { api } from "../../lib/api";

interface OrgRow {
  id: string;
  name: string;
  status: string;
  type: string;
  active: boolean;
}

export default function OrgSwitchPage() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    const { status, body } = await api<OrgRow[]>("/api/v1/organizations");
    if (status >= 400) {
      setError("Sign in to switch organization");
      return;
    }
    setOrgs(body);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSwitch(event: FormEvent, organizationId: string) {
    event.preventDefault();
    const { status } = await api("/api/v1/auth/active-organization", {
      method: "POST",
      body: JSON.stringify({ organizationId }),
    });
    if (status >= 400) {
      setError("Organization switch denied");
      return;
    }
    await refresh();
  }

  return (
    <>
      <Banner>Org switcher — session-bound tenant, not a product screen</Banner>
      <h1>Switch organization</h1>
      <p>The active Organization is stored on the server session. Client org ids are never authority.</p>
      <ErrorText>{error}</ErrorText>
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
    </>
  );
}
