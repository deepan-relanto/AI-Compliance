import { requireLearnerModuleAccess } from "@/lib/api-session";
import { getSql } from "@/lib/db";
import { saveAcknowledgementDb } from "@/lib/services/progress-db-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** POST — save learner training acknowledgement attestation */
export async function POST(req: NextRequest) {
  try {
    const {
      userEmail,
      moduleId,
      moduleTitle,
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
    const result = await saveAcknowledgementDb(sql, {
      userEmail: access.email,
      moduleId,
      moduleTitle,
      signatureName: String(signatureName),
      digitalSignature: String(digitalSignature),
    });

    return NextResponse.json({
      ok: true,
      completed: result.completed,
      feedbackRequired: result.feedbackRequired,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save acknowledgement";
    const status = message.includes("passing score") ? 409 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
