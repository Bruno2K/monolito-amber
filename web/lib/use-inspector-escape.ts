import { useEffect } from "react";

/**
 * Closes an inspector overlay on Escape and returns focus to the previously
 * focused control (list row / create button).
 */
export function useInspectorEscape(open: boolean, onClose: (id: null) => void): void {
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);
}
