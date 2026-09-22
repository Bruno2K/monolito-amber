import { expect } from "vitest";
import { Secret, TOTP, URI } from "otpauth";
import request from "supertest";

type TestAgent = ReturnType<typeof request.agent>;

export function totpFromSecret(secretBase32: string): string {
  const totp = new TOTP({
    issuer: "Amber",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
  return totp.generate();
}

export function secretFromOtpauth(otpauth: string): string {
  const parsed = URI.parse(otpauth);
  if (!(parsed instanceof TOTP)) {
    throw new Error("Expected a TOTP otpauth URI");
  }
  return parsed.secret.base32;
}

export async function enrollTotp(agent: TestAgent): Promise<{ secret: string; recoveryCodes: string[] }> {
  const start = await agent.post("/api/v1/auth/mfa/enroll");
  expect(start.status).toBeLessThan(400);
  const secret = secretFromOtpauth(start.body.otpauth);
  const verify = await agent.post("/api/v1/auth/mfa/enroll/verify").send({
    challengeToken: start.body.challengeToken,
    totp: totpFromSecret(secret),
  });
  expect(verify.status).toBeLessThan(400);
  return { secret, recoveryCodes: verify.body.recoveryCodes };
}

export async function loginWithOptionalMfa(
  agent: TestAgent,
  input: { email: string; password: string; secret?: string },
) {
  const login = await agent.post("/api/v1/auth/login").send({
    email: input.email,
    password: input.password,
  });
  if (login.body.status === "mfa_required") {
    expect(input.secret).toBeTruthy();
    const challenge = await agent.post("/api/v1/auth/mfa/challenge").send({
      mfaToken: login.body.mfaToken,
      totp: totpFromSecret(input.secret as string),
    });
    expect(challenge.status).toBeLessThan(400);
    return challenge;
  }
  return login;
}
