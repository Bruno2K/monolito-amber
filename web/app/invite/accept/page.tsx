"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, ErrorText, Field } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function InviteAcceptPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const { status } = await api("/api/v1/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token, displayName, password }),
    });
    if (status >= 400) {
      setError("Invitation is invalid or expired");
      return;
    }
    router.push("/org-switch");
  }

  return (
    <>
      <Banner>Invite accept — not a product screen</Banner>
      <h1>Accept invitation</h1>
      <form onSubmit={onSubmit}>
        <Field id="token" label="Invitation token" autoComplete="off" required value={token} onChange={(e) => setToken(e.target.value)} />
        <Field id="name" label="Display name" autoComplete="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          hint="At least 12 characters. No composition rules."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        <Button>Accept and continue</Button>
      </form>
    </>
  );
}
