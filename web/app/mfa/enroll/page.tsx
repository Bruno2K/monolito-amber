"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, ErrorText, Field, IdentityFrame } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function MfaEnrollPage() {
  const [otpauth, setOtpauth] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [totp, setTotp] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ otpauth: string; challengeToken: string }>("/api/v1/auth/mfa/enroll", { method: "POST" }).then((result) => {
      if (!result.ok) {
        setError("Sign in before enrolling MFA");
        return;
      }
      setOtpauth(result.body.otpauth);
      setChallengeToken(result.body.challengeToken);
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = await api<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/enroll/verify", {
      method: "POST",
      body: JSON.stringify({ challengeToken, totp }),
    });
    if (!result.ok) {
      setError("Invalid authenticator code");
      return;
    }
    setCodes(result.body.recoveryCodes);
  }

  return (
    <IdentityFrame title="Enroll authenticator" banner="MFA enrollment — not a product screen">
      <p>Organization Administrators and Governance Approvers must enroll TOTP.</p>
      {otpauth ? (
        <p>
          Add this otpauth URI to your authenticator: <code>{otpauth}</code>
        </p>
      ) : null}
      <form onSubmit={onSubmit}>
        <Field
          id="totp"
          label="Authenticator code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={totp}
          onChange={(e) => setTotp(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        <Button>Verify and generate recovery codes</Button>
      </form>
      {codes.length > 0 ? (
        <section>
          <h2>Recovery codes</h2>
          <p>Store these offline. They are shown once.</p>
          <ul>
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </IdentityFrame>
  );
}
