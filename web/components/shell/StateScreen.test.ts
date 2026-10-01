import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StateScreen } from "./StateScreen";

describe("StateScreen", () => {
  it("exposes named states for empty, denied, inactive, and loading", () => {
    for (const kind of ["loading", "empty", "no-org", "no-project", "no-permission", "inactive", "error"] as const) {
      const html = renderToStaticMarkup(createElement(StateScreen, { kind }));
      expect(html).toContain(`data-state="${kind}"`);
    }
  });
});
