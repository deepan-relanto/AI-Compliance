import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/submitted",
  "/avatars",
];

/** Admin-only API prefixes (defense in depth; routes also call requireAdminSession). */
const ADMIN_API_PREFIXES = [
  "/api/assessments",
  "/api/courses",
  "/api/monitoring",
  "/api/course-monitoring",
  "/api/analytics",
  "/api/progress/admin",
  "/api/course-progress/admin",
  "/api/content",
  "/api/convert",
  "/api/employees",
  "/api/mail",
];

function isAdminApiPath(pathname: string): boolean {
  return ADMIN_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    // APIs get 401 JSON; pages redirect to login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
    }
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

  if (isAdminApiPath(pathname) && role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only." }, { status: 403 });
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
