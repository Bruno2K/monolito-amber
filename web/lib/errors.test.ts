import { describe, expect, it } from "vitest";
import { classifyProblem, isSessionTerminal, normalizeProblem } from "./errors";

describe("error normalization", () => {
  it("maps RFC 7807 problem details", () => {
    const problem = normalizeProblem(403, {
      type: "https://amber.invalid/problems/tenancy_denied",
      title: "DenyByDefaultError",
      status: 403,
      detail: "Project is not bound to the authorized Organization",
      correlationId: "c-1",
      code: "TENANCY_DENIED",
    });
    expect(problem.code).toBe("TENANCY_DENIED");
    expect(problem.correlationId).toBe("c-1");
    expect(classifyProblem(problem)).toBe("no-permission");
  });

  it("treats session expiry/revocation as a secure terminal flow", () => {
    const expired = normalizeProblem(401, { code: "SESSION_EXPIRED", detail: "Session has expired" });
    const revoked = normalizeProblem(401, { code: "SESSION_REVOKED", detail: "Session has been revoked" });
    expect(isSessionTerminal(expired)).toBe(true);
    expect(isSessionTerminal(revoked)).toBe(true);
    expect(classifyProblem(expired)).toBe("expired");
    expect(classifyProblem(revoked)).toBe("expired");
  });

  it("maps no-org and inactive membership without treating URL as authority", () => {
    expect(
      classifyProblem(
        normalizeProblem(403, { code: "TENANCY_DENIED", detail: "Session has no active Organization; org-switch required" }),
      ),
    ).toBe("no-org");
    expect(
      classifyProblem(
        normalizeProblem(403, { code: "TENANCY_DENIED", detail: "Project membership is not ACTIVE" }),
      ),
    ).toBe("inactive");
    expect(classifyProblem(null, { archived: true })).toBe("inactive");
  });
});
