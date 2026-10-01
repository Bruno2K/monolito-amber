"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ErrorText, Field, IdentityFrame } from "../../components/ui";
import { api, type SessionView } from "../../lib/api";
import { destinationAfterAuth } from "../../lib/guards";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const { ok, body } = await api<SessionView>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!ok || !body) {
      setError("Invalid email or password");
      return;
    }
    if (body.status === "mfa_required" && body.mfaToken) {
      router.push(`/mfa/challenge?token=${encodeURIComponent(body.mfaToken)}`);
      return;
    }
    router.push(destinationAfterAuth(body, params.get("next")));
  }

  return (
    <form onSubmit={onSubmit}>
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
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
  );
}

export default function SignInPage() {
  return (
    <IdentityFrame title="Sign in" banner="Authentication — not a product screen">
      <Suspense fallback={<p>Loading…</p>}>
        <SignInForm />
      </Suspense>
      <p>
        <a href="/password/reset">Forgot password</a>
      </p>
    </IdentityFrame>
  );
}
