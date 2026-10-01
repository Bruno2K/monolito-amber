import type { IconName } from "../../lib/nav";

function Svg({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {children}
    </svg>
  );
}

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Icon({ name }: { name: IconName }) {
  switch (name) {
    case "folder":
      return (
        <Svg>
          <path d="M2.5 4.5h4l1 1.5h6v7h-11v-8.5z" {...stroke} />
        </Svg>
      );
    case "calendar":
      return (
        <Svg>
          <rect x="2.5" y="3.5" width="11" height="10" rx="1.2" {...stroke} />
          <path d="M2.5 6.5h11M5.5 2.5v2M10.5 2.5v2" {...stroke} />
        </Svg>
      );
    case "clock":
      return (
        <Svg>
          <circle cx="8" cy="8" r="5.5" {...stroke} />
          <path d="M8 5v3.2l2 1.3" {...stroke} />
        </Svg>
      );
    case "layout":
      return (
        <Svg>
          <rect x="2.5" y="3" width="11" height="10" rx="1.2" {...stroke} />
          <path d="M2.5 6.5h11M6.5 6.5v6.5" {...stroke} />
        </Svg>
      );
    case "layers":
      return (
        <Svg>
          <path d="M2.5 5.5H9.5V12.5H3.5C2.9 12.5 2.5 12.1 2.5 11.5V5.5Z" {...stroke} />
          <path d="M5.5 3.5H12.5C13.1 3.5 13.5 3.9 13.5 4.5V11.5" {...stroke} />
        </Svg>
      );
    case "people":
      return (
        <Svg>
          <circle cx="6" cy="6" r="2" {...stroke} />
          <path d="M2.5 12.5c.4-2 1.8-3 3.5-3s3.1 1 3.5 3" {...stroke} />
          <circle cx="11" cy="6.2" r="1.6" {...stroke} />
          <path d="M10.2 9.6c1.4.3 2.4 1.2 2.8 2.9" {...stroke} />
        </Svg>
      );
    case "file":
      return (
        <Svg>
          <path d="M4.5 2.5h5l2.5 2.5v8.5h-7.5v-11z" {...stroke} />
          <path d="M9.5 2.5v2.5h2.5" {...stroke} />
        </Svg>
      );
    case "shield":
      return (
        <Svg>
          <path d="M8 2.5 13 4.5v4.2c0 2.6-2 4.5-5 5.3-3-.8-5-2.7-5-5.3V4.5L8 2.5z" {...stroke} />
        </Svg>
      );
    case "activity":
      return (
        <Svg>
          <path d="M2.5 10.5h2l1.5-5 2 8 2-6 1.5 3h2" {...stroke} />
        </Svg>
      );
    default:
      return null;
  }
}

export function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M9 3.5 4.5 7 9 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function NavChevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.5 2.5 8 6 4.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M9 2.5a4.5 4.5 0 0 0-4.5 4.5v2.1L3 11.5h12l-1.5-2.4V7A4.5 4.5 0 0 0 9 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7.2 13.5a1.8 1.8 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="m10.2 10.2 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function StatusDot() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden="true">
      <circle cx="3" cy="3" r="3" fill="#10b981" />
    </svg>
  );
}
