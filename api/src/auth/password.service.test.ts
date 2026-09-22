import { describe, expect, it } from "vitest";
import { PasswordPolicyError } from "@amber/shared";
import { PasswordService } from "./password.service";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes with argon2id and verifies", async () => {
    const password = "twelve-chars-ok";
    const stored = await service.hash(password);
    expect(stored.algorithm).toBe("argon2id");
    expect(stored.hash).toMatch(/^\$argon2id\$/);
    expect(await service.verify(stored.hash, password)).toBe(true);
    expect(await service.verify(stored.hash, "wrong-password-12")).toBe(false);
  });

  it("rejects passwords under 12 characters", async () => {
    await expect(service.hash("short")).rejects.toBeInstanceOf(PasswordPolicyError);
  });
});
