"use client";

import { useCallback, useEffect, useState } from "react";

/** Chrome-only preference. Do not fold this into domain `shell-state`. */
export const SIDEBAR_COLLAPSED_KEY = "amber.sidebar.collapsed";

export type SidebarCollapseStorage = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): SidebarCollapseStorage | null {
  try {
    if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
      return null;
    }
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readSidebarCollapsed(storage?: SidebarCollapseStorage | null): boolean {
  try {
    const store = storage === undefined ? defaultStorage() : storage;
    if (!store) {
      return false;
    }
    const value = store.getItem(SIDEBAR_COLLAPSED_KEY);
    return value === "1" || value === "true";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(
  collapsed: boolean,
  storage?: SidebarCollapseStorage | null,
): void {
  try {
    const store = storage === undefined ? defaultStorage() : storage;
    store?.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode / quota — keep the in-memory toggle working.
  }
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(readSidebarCollapsed());
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
