import { Injectable } from "@nestjs/common";
import { hash as argon2Hash, verify as argon2Verify, argon2id } from "argon2";
import { assertPasswordPolicy, PASSWORD_ALGORITHM } from "@amber/shared";

export const ARGON2_PARAMETERS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private dummyHashPromise: Promise<string> | null = null;

  async hash(password: string): Promise<{ algorithm: string; hash: string; parameters: typeof ARGON2_PARAMETERS }> {
    assertPasswordPolicy(password);
    const hashed = await argon2Hash(password, ARGON2_PARAMETERS);
    return { algorithm: PASSWORD_ALGORITHM, hash: hashed, parameters: ARGON2_PARAMETERS };
  }

  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await argon2Verify(storedHash, password);
    } catch {
      return false;
    }
  }

  async dummyVerify(password: string): Promise<void> {
    const dummy = await this.dummyHash();
    await this.verify(dummy, password);
  }

  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= argon2Hash("timing-dummy-password-not-a-user-secret", ARGON2_PARAMETERS);
    return this.dummyHashPromise;
  }
}
