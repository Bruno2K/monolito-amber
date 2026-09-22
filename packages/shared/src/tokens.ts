import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokensEqual(leftHash: string, rightHash: string): boolean {
  const a = Buffer.from(leftHash, "hex");
  const b = Buffer.from(rightHash, "hex");
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export const SECRET_PAYLOAD_KEYS = [
  "password",
  "token",
  "secret",
  "hash",
  "recoveryCode",
  "recoveryCodes",
  "totp",
  "otp",
  "cookie",
  "signedUrl",
  "uploadUrl",
  "downloadUrl",
  "presigned",
] as const;

export function redactSecrets(payload: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (SECRET_PAYLOAD_KEYS.some((secret) => key.toLowerCase().includes(secret.toLowerCase()))) {
      redacted[key] = "[redacted]";
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      redacted[key] = redactSecrets(value as Record<string, unknown>);
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}
