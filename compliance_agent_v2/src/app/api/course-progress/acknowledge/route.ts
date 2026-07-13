import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { saveAcknowledgementDb } from "@/lib/services/course-progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — save learner training acknowledgement attestation */
export async function POST(req: NextRequest) {
  try {
    const {
      userEmail,
      moduleId,
      moduleTitle,
      feedbackRequired,
      signatureName,
      digitalSignature,
    } = await req.json();
    if (!moduleId || !moduleTitle) {
      return NextResponse.json(
        { ok: false, message: "moduleId and moduleTitle are required." },
        { status: 400 },
      );
    }
    if (!signatureName || !digitalSignature) {
      return NextResponse.json(
        { ok: false, message: "signatureName and digitalSignature are required." },
        { status: 400 },
      );
    }

    const access = await requireLearnerModuleAccess(moduleId, userEmail);
    if (!access.ok) return access.response;

    const sql = getSql();
    await saveAcknowledgementDb(sql, {
      userEmail: access.email,
      moduleId,
      moduleTitle,
      feedbackRequired: Boolean(feedbackRequired),
      signatureName: String(signatureName),
      digitalSignature: String(digitalSignature),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save acknowledgement";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

