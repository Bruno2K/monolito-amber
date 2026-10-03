import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE = process.env.SESSION_COOKIE_NAME ?? "amber_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/projects") && !pathname.startsWith("/calendars") && !pathname.startsWith("/messages")) {
    return NextResponse.next();
  }
  if (!request.cookies.get(COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/projects/:path*", "/calendars/:path*", "/messages/:path*"],
};
