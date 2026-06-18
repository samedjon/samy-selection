import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const adminCookie = request.cookies.get("samy_admin_session")?.value;
  let isAdminAuthenticated = false;
  try {
    if (adminCookie) {
      const parsed = JSON.parse(adminCookie);
      isAdminAuthenticated = !!(parsed.email && parsed.name);
    }
  } catch {
    isAdminAuthenticated = adminCookie === "authenticated";
  }

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login" || pathname === "/admin/register") {
      if (isAdminAuthenticated) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
      return NextResponse.next();
    }

    if (pathname.startsWith("/api/admin")) {
      return NextResponse.next();
    }

    if (!isAdminAuthenticated) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
