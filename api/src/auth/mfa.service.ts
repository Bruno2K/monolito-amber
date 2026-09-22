import { Injectable } from "@nestjs/common";
import { Secret, TOTP, URI } from "otpauth";
import {
  MFA_CHALLENGE_TTL_MINUTES,
  MfaChallengeError,
  hashToken,
  randomToken,
} from "@amber/shared";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret, encryptSecret } from "./crypto";
import { createHash, randomBytes } from "node:crypto";

const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService) {}

  createSecret(): { secret: string; otpauth: string } {
    const totp = new TOTP({
      issuer: "Amber",
      label: "Amber",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: new Secret({ size: 20 }),
    });
    return { secret: totp.secret.base32, otpauth: totp.toString() };
  }

  verifyTotp(secretBase32: string, code: string): boolean {
    const totp = new TOTP({
      issuer: "Amber",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });
    return totp.validate({ token: code.replace(/\s/g, ""), window: 1 }) !== null;
  }

  encrypt(secret: string): { secretEncrypted: string; secretHash: string } {
    return {
      secretEncrypted: encryptSecret(secret),
      secretHash: createHash("sha256").update(secret).digest("hex"),
    };
  }

  decrypt(secretEncrypted: string): string {
    return decryptSecret(secretEncrypted);
  }

  parseOtpauth(uri: string): string {
    const parsed = URI.parse(uri);
    if (!(parsed instanceof TOTP)) {
      throw new MfaChallengeError("Unsupported MFA method");
    }
    return parsed.secret.base32;
  }

  generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => randomBytes(5).toString("hex"));
  }

  hashRecoveryCode(code: string): string {
    return hashToken(code.trim().toLowerCase());
  }

  async issueChallenge(userId: string, purpose: string): Promise<string> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_MINUTES * 60 * 1000);
    await this.prisma.mfaChallenge.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        purpose,
        expiresAt,
      },
    });
    return token;
  }

  async consumeChallenge(token: string, purpose: string): Promise<{ id: string; userId: string }> {
    const row = await this.prisma.mfaChallenge.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new MfaChallengeError();
    }
    await this.prisma.mfaChallenge.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });
    return { id: row.id, userId: row.userId };
  }
}
