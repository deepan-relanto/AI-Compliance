import { auth } from "@/auth";
import {
  canOpenAdminPages,
  canOpenLearnerPages,
  isAdminAppPath,
  isLearnerAppPath,
} from "@/lib/access-policy";
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

  // Server-side role gate — do not rely on client RouteGuard alone.
  // Admins may also open learner pages so they can take assigned training.
  if (isAdminAppPath(pathname) && !canOpenAdminPages(role)) {
    const dest = role === "user" ? "/dashboard" : "/login";
    return NextResponse.redirect(new URL(dest, req.nextUrl.origin));
  }

  if (isAdminApiPath(pathname) && !canOpenAdminPages(role)) {
    return NextResponse.json({ ok: false, error: "Admin only." }, { status: 403 });
  }

  if (isLearnerAppPath(pathname) && role && !canOpenLearnerPages(role)) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|glb|mjs)$).*)",
  ],
};
