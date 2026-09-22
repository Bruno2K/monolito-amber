"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, ErrorText, Field } from "../../components/ui";
import { api, type SessionView } from "../../lib/api";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const { status, body } = await api<SessionView>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (status >= 400) {
      setError("Invalid email or password");
      return;
    }
    if (body.status === "mfa_required" && body.mfaToken) {
      router.push(`/mfa/challenge?token=${encodeURIComponent(body.mfaToken)}`);
      return;
    }
    if (body.mfa?.required && !body.mfa.enrolled) {
      router.push("/mfa/enroll");
      return;
    }
    router.push("/org-switch");
  }

  return (
    <>
      <Banner>Authentication — not a product screen</Banner>
      <h1>Sign in</h1>
      <form onSubmit={onSubmit}>
        <Field id="email" label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        <Button>Sign in</Button>
      </form>
      <p>
        <a href="/password/reset">Forgot password</a>
      </p>
    </>
  );
}
