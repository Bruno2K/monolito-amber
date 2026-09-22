"use client";

import { FormEvent, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function OrgSwitchPage() {
  const [organizationId, setOrganizationId] = useState("");
  const [tokenHash, setTokenHash] = useState("");
  const [result, setResult] = useState<string>("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`${apiBase}/api/v1/auth/active-organization`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-token-hash": tokenHash,
      },
      body: JSON.stringify({ organizationId }),
    });
    const body = await response.text();
    setResult(`${response.status} ${body}`);
  }

  return (
    <>
      <h1>Organization switch stub</h1>
      <p>
        Path/body <code>organizationId</code> is a routing hint. The API re-validates ACTIVE
        membership and binds the session server-side. Forged org ids are denied.
      </p>
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="token">Session token hash (dev stub header)</label>
        <input
          id="token"
          value={tokenHash}
          onChange={(e) => setTokenHash(e.target.value)}
          autoComplete="off"
        />
        <label htmlFor="org">Target organization id</label>
        <input
          id="org"
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          autoComplete="off"
        />
        <button type="submit">Switch organization</button>
      </form>
      {result ? (
        <pre className="card">
          <code>{result}</code>
        </pre>
      ) : null}
    </>
  );
}
