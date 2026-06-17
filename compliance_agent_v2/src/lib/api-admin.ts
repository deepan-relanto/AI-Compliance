import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function requireAdminSession() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return { session: null, error: NextResponse.json({ ok: false, error: "Admin only." }, { status: 403 }) };
  }
  return { session, error: null };
}
