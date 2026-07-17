import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/mail",
  "/submitted",
  "/api/files/course-assets",
  "/avatars",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  const role = req.auth.user?.role;
  const isAdminPath =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const isLearnerPath =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/training/");

  // Server-side role gate — do not rely on client RouteGuard alone.
  if (isAdminPath && role !== "admin") {
    const dest = role === "user" ? "/dashboard" : "/login";
    return NextResponse.redirect(new URL(dest, req.nextUrl.origin));
  }

  if (isLearnerPath && role === "admin") {
    return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|mjs)$).*)",
  ],
};
