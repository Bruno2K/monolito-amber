"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorText, Field, IdentityFrame } from "../../../components/ui";
import { api, type SessionView } from "../../../lib/api";
import { destinationAfterAuth } from "../../../lib/guards";

function ChallengeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mfaToken, setMfaToken] = useState(params.get("token") ?? "");
  const [totp, setTotp] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await api("/api/v1/auth/mfa/challenge", {
      method: "POST",
      body: JSON.stringify({ mfaToken, totp: totp || undefined, recoveryCode: recoveryCode || undefined }),
    });
    if (!result.ok) {
      setError("Invalid or expired MFA challenge");
      return;
    }
    const session = await api<SessionView>("/api/v1/auth/session");
    router.push(session.ok ? destinationAfterAuth(session.body) : "/org-switch");
  }

  return (
    <form onSubmit={onSubmit}>
      <Field
        id="mfaToken"
        label="MFA challenge token"
        autoComplete="off"
        required
        value={mfaToken}
        onChange={(e) => setMfaToken(e.target.value)}
      />
      <Field
        id="totp"
        label="Authenticator code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={totp}
        onChange={(e) => setTotp(e.target.value)}
      />
      <Field
        id="recovery"
        label="Recovery code"
        autoComplete="off"
        value={recoveryCode}
        onChange={(e) => setRecoveryCode(e.target.value)}
      />
      <ErrorText>{error}</ErrorText>
      <Button>Continue</Button>
    </form>
  );
}

export default function MfaChallengePage() {
  return (
    <IdentityFrame title="Verify it is you" banner="MFA challenge — not a product screen">
      <Suspense fallback={<p>Loading challenge…</p>}>
        <ChallengeForm />
      </Suspense>
    </IdentityFrame>
  );
}
