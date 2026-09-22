"use client";

import { FormEvent, useState } from "react";
import { Banner, Button, ErrorText, Field } from "../../../components/ui";
import { api } from "../../../lib/api";

export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    setError("");
    await api("/api/v1/auth/password/forgot", { method: "POST", body: JSON.stringify({ email }) });
    setMessage("If an account exists, a reset token was issued.");
  }

  async function consumeReset(event: FormEvent) {
    event.preventDefault();
    setError("");
    const { status } = await api("/api/v1/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
    if (status >= 400) {
      setError("Reset token is invalid or expired");
      return;
    }
    setMessage("Password updated. You can sign in.");
  }

  return (
    <>
      <Banner>Password reset — not a product screen</Banner>
      <h1>Reset password</h1>
      <form onSubmit={requestReset}>
        <Field id="email" label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button>Send reset</Button>
      </form>
      <form onSubmit={consumeReset}>
        <Field id="token" label="Reset token" autoComplete="off" required value={token} onChange={(e) => setToken(e.target.value)} />
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button>Set new password</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      {message ? <p>{message}</p> : null}
    </>
  );
}
