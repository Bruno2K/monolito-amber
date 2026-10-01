import { describe, expect, it } from "vitest";
import { breadcrumbsFor, isGlobalPath, matchNavItem, resolveNavHref, GLOBAL_NAV, PROJECT_NAV } from "./nav";

describe("shell navigation", () => {
  it("distinguishes Global vs Project active routes", () => {
    expect(matchNavItem("/projects")?.id).toBe("projects");
    expect(matchNavItem("/projects")?.group).toBe("global");
    expect(isGlobalPath("/projects")).toBe(true);
    expect(matchNavItem("/projects/abc/overview", "abc")?.id).toBe("overview");
    expect(matchNavItem("/projects/abc/overview", "abc")?.group).toBe("project");
    expect(isGlobalPath("/projects/abc/overview")).toBe(false);
  });

  it("does not resolve coming-later M4+ items to product hrefs", () => {
    const planning = PROJECT_NAV.find((item) => item.id === "planning");
    const calendars = GLOBAL_NAV.find((item) => item.id === "calendars");
    expect(resolveNavHref(planning!, "abc")).toBeNull();
    expect(resolveNavHref(calendars!, null)).toBeNull();
    expect(PROJECT_NAV.every((item) => item.id !== "planner")).toBe(true);
  });

  it("builds breadcrumbs that name Global or Project context", () => {
    const global = breadcrumbsFor({ pathname: "/projects" });
    expect(global[0]?.label).toBe("Global");
    expect(global.some((crumb) => crumb.current && crumb.label === "Todos os Projetos")).toBe(true);
    const project = breadcrumbsFor({
      pathname: "/projects/abc/deliverables",
      projectId: "abc",
      projectName: "Aurora",
    });
    expect(project[0]?.label).toBe("Projetos");
    expect(project.map((crumb) => crumb.label)).toContain("Aurora");
    expect(project.map((crumb) => crumb.label)).toContain("Entregas");
  });
});
