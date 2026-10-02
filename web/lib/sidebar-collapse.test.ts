import { describe, expect, it } from "vitest";
import {
  SIDEBAR_COLLAPSED_KEY,
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "./sidebar-collapse";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
  };
}

describe("sidebar collapse preference", () => {
  it("defaults to expanded when storage is empty or missing", () => {
    expect(readSidebarCollapsed(memoryStorage())).toBe(false);
    expect(readSidebarCollapsed(null)).toBe(false);
  });

  it("reads 1/true as collapsed and ignores other values", () => {
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_COLLAPSED_KEY]: "1" }))).toBe(true);
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_COLLAPSED_KEY]: "true" }))).toBe(true);
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_COLLAPSED_KEY]: "0" }))).toBe(false);
    expect(readSidebarCollapsed(memoryStorage({ [SIDEBAR_COLLAPSED_KEY]: "nope" }))).toBe(false);
  });

  it("persists only the chrome flag", () => {
    const storage = memoryStorage();
    writeSidebarCollapsed(true, storage);
    expect(storage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
    expect(readSidebarCollapsed(storage)).toBe(true);
    writeSidebarCollapsed(false, storage);
    expect(storage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("0");
    expect(readSidebarCollapsed(storage)).toBe(false);
  });

  it("swallows storage failures so the toggle still works in memory", () => {
    const broken: Storage = {
      get length() {
        return 0;
      },
      clear() {},
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {},
      key() {
        return null;
      },
    };
    expect(readSidebarCollapsed(broken)).toBe(false);
    expect(() => writeSidebarCollapsed(true, broken)).not.toThrow();
  });
});
