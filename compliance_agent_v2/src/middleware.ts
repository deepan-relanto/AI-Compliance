import { auth } from "@/auth";
import { NextResponse } from "next/server";

const LOCAL_ADMIN_BYPASS =
  process.env.NEXT_PUBLIC_LOCAL_ADMIN_BYPASS === "true";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/mail",
  "/submitted",
  "/api/files/course-assets",
];

export default auth((req) => {
  if (LOCAL_ADMIN_BYPASS) {
    return NextResponse.next();
  }
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();
  if (!req.auth) {
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
