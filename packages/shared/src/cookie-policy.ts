import { SESSION_ABSOLUTE_MS, SESSION_COOKIE_NAME, SESSION_COOKIE_SAMESITE } from "./session.js";

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: typeof SESSION_COOKIE_SAMESITE;
  path: "/";
  maxAge: number;
}

export function sessionCookieName(): string {
  return process.env.SESSION_COOKIE_NAME ?? SESSION_COOKIE_NAME;
}

export function sessionCookieSecure(nodeEnv = process.env.NODE_ENV, explicit = process.env.SESSION_COOKIE_SECURE): boolean {
  if (explicit === "true") {
    return true;
  }
  if (explicit === "false") {
    return false;
  }
  return nodeEnv === "production";
}

export function sessionCookieOptions(): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: SESSION_COOKIE_SAMESITE,
    path: "/",
    maxAge: SESSION_ABSOLUTE_MS,
  };
}
