import { requireAdminSession } from "@/lib/api-admin";
import { getSql } from "@/lib/db";
import { sendModuleInvitationEmails } from "@/lib/services/training-notification-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — resend invitation emails for a published module (admin). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { id } = await params;
  const forceResend =
    req.nextUrl.searchParams.get("forceResend") === "1" ||
    req.nextUrl.searchParams.get("forceResend") === "true";
  const sql = getSql();
  const result = await sendModuleInvitationEmails(sql, id, { forceResend });
  return NextResponse.json(result);
}
