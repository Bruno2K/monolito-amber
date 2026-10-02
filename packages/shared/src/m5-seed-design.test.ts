import { describe, expect, it } from "vitest";
import { M3_SEED_TEAMS, M3_SEED_USERS } from "./m3-seed-design.js";
import {
  M5_SEED_APPLIED_IN_M51,
  M5_SEED_CALENDARS_APPLIED_IN_M52,
  M5_SEED_CALENDARS,
  M5_SEED_CONVERSATIONS,
  M5_SEED_EVENTS,
  M5_SEED_GRANTS,
  M5_SEED_NEGATIVES,
  M5_SEED_PROHIBITED,
} from "./m5-seed-design.js";

describe("M5.1 seed/fixture plan", () => {
  it("is not applied in this WI and reuses existing M3 identities", () => {
    expect(M5_SEED_APPLIED_IN_M51).toBe(false);
    expect(M5_SEED_CALENDARS_APPLIED_IN_M52).toBe(true);
    const userKeys = new Set(M3_SEED_USERS.map((user) => user.key));
    const teamKeys = new Set(M3_SEED_TEAMS.map((team) => team.key));
    for (const calendar of M5_SEED_CALENDARS) {
      expect(userKeys.has(calendar.ownerUserKey), calendar.ownerUserKey).toBe(true);
    }
    for (const grant of M5_SEED_GRANTS) {
      if (grant.userKey) {
        expect(userKeys.has(grant.userKey)).toBe(true);
      }
      if (grant.teamKey) {
        expect(teamKeys.has(grant.teamKey)).toBe(true);
      }
    }
    for (const conversation of M5_SEED_CONVERSATIONS) {
      if (conversation.userKeys) {
        expect(userKeys.has(conversation.userKeys[0])).toBe(true);
        expect(userKeys.has(conversation.userKeys[1])).toBe(true);
      }
      if (conversation.teamKey) {
        expect(teamKeys.has(conversation.teamKey)).toBe(true);
      }
    }
    expect(M5_SEED_EVENTS.some((event) => event.kind === "REFERENCED")).toBe(true);
    expect(M5_SEED_NEGATIVES.orgAdminDoesNotReadDirectMessages).toBe(true);
  });

  it("does not plan ResourceAllocation, attachments, moderation, or cloud fixtures", () => {
    const blob = JSON.stringify({
      calendars: M5_SEED_CALENDARS,
      grants: M5_SEED_GRANTS,
      events: M5_SEED_EVENTS,
      conversations: M5_SEED_CONVERSATIONS,
    });
    for (const token of M5_SEED_PROHIBITED) {
      expect(blob.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });
});
