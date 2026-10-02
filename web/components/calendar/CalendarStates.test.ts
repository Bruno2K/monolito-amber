import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarStates } from "./CalendarStates";

describe("CalendarStates", () => {
  it("exposes empty, filtered, loading, error, denied, revoked, inactive and archived", () => {
    for (const state of ["loading", "empty", "filtered-empty", "error", "no-permission", "revoked", "inactive", "archived"] as const) {
      const html = renderToStaticMarkup(createElement(CalendarStates, { state }));
      expect(html).toContain(`data-state="${state}"`);
      expect(html).not.toContain("gate.override");
    }
  });
});
