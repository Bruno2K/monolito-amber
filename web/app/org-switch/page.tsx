"use client";

import { FormEvent, useState } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function OrgSwitchStubPage() {
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
      <p className="shell-banner">Foundation stub — not a product screen</p>
      <h1>Org-switch stub</h1>
      <p>
        Exercises session-bound Organization binding. Path/body <code>organizationId</code> is a
        routing hint only; the API re-validates ACTIVE membership and binds the session
        server-side.
      </p>
      <form onSubmit={onSubmit}>
        <label htmlFor="token">Session token hash (dev header)</label>
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
        <pre>
          <code>{result}</code>
        </pre>
      ) : null}
    </>
  );
}
