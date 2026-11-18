import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  isPublicPath,
  isProtectedPagePath,
} from "@/lib/auth/route-permissions";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Always allow public paths (landing page "/", "/auth/signin", static assets, health/auth APIs)
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2. Do not redirect API routes to HTML pages; API routes return JSON 401/403 via requireAuth/requireRole
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 3. Check auth session cookie
  const token =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value ||
    request.cookies.get("next-auth.session-token")?.value ||
    request.cookies.get("__Secure-next-auth.session-token")?.value;

  // 4. Redirect unauthenticated users accessing any protected application page route
  if (!token && isProtectedPagePath(pathname)) {
    const signInUrl = new URL("/auth/signin", request.url);
    const callbackUrl = search ? `${pathname}${search}` : pathname;
    signInUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
