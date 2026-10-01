import { describe, expect, it } from "vitest";
import {
  hubInventedHealthStatus,
  hubMutatesDomainSources,
  overdueIsDeliverableStatus,
  teamMembershipImpliesProjectMembership,
  teamOwnerGrantsProjectAccess,
} from "@amber/shared";

describe("M3.6 Project Hub security floors", () => {
  it("is a derived read model: no domain mutation, no parallel health SoT, no OVERDUE status", () => {
    expect(hubMutatesDomainSources()).toBe(false);
    expect(hubInventedHealthStatus()).toBe(false);
    expect(overdueIsDeliverableStatus()).toBe(false);
  });

  it("does not treat Team membership as Project access", () => {
    expect(teamMembershipImpliesProjectMembership()).toBe(false);
    expect(teamOwnerGrantsProjectAccess()).toBe(false);
  });
});
