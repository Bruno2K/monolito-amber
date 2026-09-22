import { describe, expect, it } from "vitest";
import { ScanFailClosedError } from "./errors.js";
import {
  assertFileAccessAllowed,
  assertUploadWhenScannerAvailable,
  evaluateFileAccess,
} from "./scan-status.js";

describe("F-08 malware fail-closed (fail closed if skipped)", () => {
  it("denies download/preview while PENDING", () => {
    const decision = evaluateFileAccess("PENDING", "download");
    expect(decision.allowed).toBe(false);
    expect(() => assertFileAccessAllowed("PENDING", "preview")).toThrow(ScanFailClosedError);
  });

  it("allows authorized access only when CLEAN", () => {
    expect(evaluateFileAccess("CLEAN", "download").allowed).toBe(true);
    assertFileAccessAllowed("CLEAN", "download");
  });

  it("denies BLOCKED and requires a security event", () => {
    const decision = evaluateFileAccess("BLOCKED", "download");
    expect(decision.allowed).toBe(false);
    expect(decision.emitSecurityEvent).toBe(true);
    expect(() => assertFileAccessAllowed("BLOCKED", "preview")).toThrow(ScanFailClosedError);
  });

  it("fails closed for new uploads when scanner is unavailable", () => {
    expect(() => assertUploadWhenScannerAvailable(false)).toThrow(ScanFailClosedError);
    assertUploadWhenScannerAvailable(true);
  });
});
