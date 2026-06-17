import { getSql } from "@/lib/db";
import { loadModuleDetail } from "@/lib/services/module-detail-service";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userEmail = req.nextUrl.searchParams.get("userEmail")?.trim() ?? "";
    const sql = getSql();
    const detail = await loadModuleDetail(sql, id, userEmail);

    if (!detail) {
      return NextResponse.json({ ok: false, error: "Module not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      module: detail.module,
      mcqs: detail.mcqs,
      steps: detail.steps ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load module";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
