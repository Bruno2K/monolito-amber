import type { Response } from "express";
import { sessionCookieName, sessionCookieOptions } from "@amber/shared";

export function setSessionCookie(res: Response, token: string): void {
  const options = sessionCookieOptions();
  res.cookie(sessionCookieName(), token, options);
}

export function clearSessionCookie(res: Response): void {
  const options = sessionCookieOptions();
  res.clearCookie(sessionCookieName(), { path: options.path, sameSite: options.sameSite, secure: options.secure });
}

export function readSessionToken(cookies: Record<string, string> | undefined, headerToken?: string): string | undefined {
  return cookies?.[sessionCookieName()] ?? headerToken;
}
