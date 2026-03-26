import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  // Skip auth for the login page, auth API, and static assets
  const path = req.nextUrl.pathname;
  if (
    path === "/login" ||
    path.startsWith("/api/auth") ||
    path.startsWith("/_next") ||
    path.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("site-auth");
  if (cookie?.value === "authenticated") {
    return NextResponse.next();
  }

  // Redirect to login, preserving the original URL
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
