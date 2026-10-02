import { describe, expect, it } from "vitest";
import { breadcrumbsFor, isGlobalPath, matchNavItem, resolveNavHref, GLOBAL_NAV, PROJECT_NAV } from "./nav";

describe("shell navigation", () => {
  it("distinguishes Global vs Project active routes", () => {
    expect(matchNavItem("/projects")?.id).toBe("projects");
    expect(matchNavItem("/projects")?.group).toBe("global");
    expect(isGlobalPath("/projects")).toBe(true);
    expect(isGlobalPath("/calendars")).toBe(true);
    expect(isGlobalPath("/calendars/schedule")).toBe(true);
    expect(matchNavItem("/projects/abc/overview", "abc")?.id).toBe("overview");
    expect(matchNavItem("/projects/abc/overview", "abc")?.group).toBe("project");
    expect(matchNavItem("/projects/abc/structure", "abc")?.id).toBe("structure");
    expect(matchNavItem("/projects/abc/work-packages", "abc")?.id).toBe("work-packages");
    expect(isGlobalPath("/projects/abc/overview")).toBe(false);
  });

  it("resolves Planejamento to /planner and keeps later M4+ items unavailable", () => {
    const planning = PROJECT_NAV.find((item) => item.id === "planning");
    const calendars = GLOBAL_NAV.find((item) => item.id === "calendars");
    const messages = GLOBAL_NAV.find((item) => item.id === "messages");
    expect(resolveNavHref(planning!, "abc")).toBe("/projects/abc/planner");
    expect(planning?.availability).toBe("available");
    expect(resolveNavHref(calendars!, null)).toBe("/calendars");
    expect(calendars?.availability).toBe("available");
    expect(resolveNavHref(messages!, null)).toBeNull();
    expect(matchNavItem("/calendars")?.id).toBe("calendars");
    expect(matchNavItem("/calendars/schedule")?.id).toBe("calendars");
    expect(matchNavItem("/projects/abc/planner", "abc")?.id).toBe("planning");
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
    const structure = breadcrumbsFor({
      pathname: "/projects/abc/structure",
      projectId: "abc",
      projectName: "Aurora",
    });
    expect(structure.map((crumb) => crumb.label)).toContain("Estrutura");
    const packages = breadcrumbsFor({
      pathname: "/projects/abc/work-packages",
      projectId: "abc",
      projectName: "Aurora",
    });
    expect(packages.map((crumb) => crumb.label)).toContain("Pacotes");
    const planner = breadcrumbsFor({
      pathname: "/projects/abc/planner",
      projectId: "abc",
      projectName: "Aurora",
    });
    expect(planner.map((crumb) => crumb.label)).toContain("Planejamento");
    const calendars = breadcrumbsFor({ pathname: "/calendars" });
    expect(calendars[0]?.label).toBe("Global");
    expect(calendars.some((crumb) => crumb.current && crumb.label === "Meus Calendários")).toBe(true);
    const schedule = breadcrumbsFor({ pathname: "/calendars/schedule" });
    expect(schedule.map((crumb) => crumb.label)).toContain("Minha Agenda");
  });
});
