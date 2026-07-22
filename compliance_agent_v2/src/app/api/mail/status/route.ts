import { requireAdminSession } from "@/lib/api-admin";
import { getGraphMailConfig } from "@/lib/graph-mail-config";
import { verifyGraphMailPermission } from "@/lib/services/graph-mail-service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — Graph mail configuration + token check (no secrets returned). */
export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const cfg = getGraphMailConfig();
  const tokenCheck = cfg.isConfigured
    ? await verifyGraphMailPermission()
    : { ok: false, message: "Mail not fully configured." };

  return NextResponse.json({
    ok: cfg.isConfigured && tokenCheck.ok,
    configured: cfg.isConfigured,
    mailFrom: cfg.mailFrom || null,
    tokenOk: tokenCheck.ok,
    message: tokenCheck.message,
    issues: cfg.issues,
    hints:
      cfg.issues.includes("MAIL_FROM_ADDRESS")
        ? [
            "Set MAIL_FROM_ADDRESS in .env to your shared mailbox (e.g. training@relanto.ai).",
            "Azure → API permissions → Application Mail.Send → Grant admin consent.",
          ]
        : cfg.issues.includes("GRAPH_CLIENT_SECRET_IS_SECRET_ID_NOT_VALUE")
          ? ["Use the Azure secret Value in AUTH_AZURE_AD_CLIENT_SECRET, not the Secret ID."]
          : !tokenCheck.ok && cfg.isConfigured
            ? [
                "Application Mail.Send may lack admin consent.",
                "Ensure Exchange allows this app to send as MAIL_FROM_ADDRESS.",
              ]
            : cfg.issues.length > 0
              ? ["Add missing mail variables to .env and restart npm run dev"]
              : ["Graph mail is ready. Invitation emails send when publish completes."],
  });
}
