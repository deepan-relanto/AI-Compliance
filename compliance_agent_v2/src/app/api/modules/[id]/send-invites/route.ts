import { auth } from "@/auth";
import { getSql } from "@/lib/db";
import { sendModuleInvitationEmails } from "@/lib/services/training-notification-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — resend invitation emails for a published module (admin). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ ok: false, message: "Admin only." }, { status: 403 });
  }

  const { id } = await params;
  const sql = getSql();
  const result = await sendModuleInvitationEmails(sql, id);
  return NextResponse.json(result);
}
