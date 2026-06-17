import { NextResponse } from "next/server";

/** Legacy password login — replaced by Microsoft Entra ID (NextAuth). */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Password login is disabled. Use Continue with Microsoft on the login page.",
    },
    { status: 410 },
  );
}
