"use client";

import { FormEvent, useEffect, useState } from "react";
import { Banner, Button, ErrorText, Field } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function MfaEnrollPage() {
  const [otpauth, setOtpauth] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [totp, setTotp] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void api<{ otpauth: string; challengeToken: string }>("/api/v1/auth/mfa/enroll", { method: "POST" }).then(
      ({ status, body }) => {
        if (status >= 400) {
          setError("Sign in before enrolling MFA");
          return;
        }
        setOtpauth(body.otpauth);
        setChallengeToken(body.challengeToken);
      },
    );
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const { status, body } = await api<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/enroll/verify", {
      method: "POST",
      body: JSON.stringify({ challengeToken, totp }),
    });
    if (status >= 400) {
      setError("Invalid authenticator code");
      return;
    }
    setCodes(body.recoveryCodes);
  }

  return (
    <>
      <Banner>MFA enrollment — not a product screen</Banner>
      <h1>Enroll authenticator</h1>
      <p>Organization Administrators and Governance Approvers must enroll TOTP.</p>
      {otpauth ? (
        <p>
          Add this otpauth URI to your authenticator: <code>{otpauth}</code>
        </p>
      ) : null}
      <form onSubmit={onSubmit}>
        <Field id="totp" label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" required value={totp} onChange={(e) => setTotp(e.target.value)} />
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
    </>
  );
}
