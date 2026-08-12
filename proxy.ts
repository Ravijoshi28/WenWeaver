import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const refreshToken = request.cookies.get("refreshToken")?.value;
  const pathname = request.nextUrl.pathname;

  const protectedRoutes = ["/main", "/dashboard", "/projects", "/profile"];

  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtected && !refreshToken) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  if (
    refreshToken &&
    (pathname === "/auth/login" || pathname === "/auth/signup")
  ) {
    return NextResponse.redirect(new URL("/main/project", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/main/:path*",
    "/dashboard/:path*",
    "/projects/:path*",
    "/profile/:path*",
    "/auth/:path*",
    "/auth/login",
    "/auth/register",
  ],
};