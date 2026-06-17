import { getMicrosoftAuthConfig } from "@/lib/auth-config";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET — safe auth setup check (no secrets returned). */
export async function GET() {
  const cfg = getMicrosoftAuthConfig();
  return NextResponse.json({
    ok: true,
    configured: cfg.isConfigured,
    callbackUrl: cfg.callbackUrl,
    issues: cfg.issues,
    hints:
      cfg.issues.includes("AUTH_AZURE_AD_CLIENT_SECRET_IS_SECRET_ID_NOT_VALUE")
        ? [
            "Your .env has the Azure Secret ID, not the secret Value.",
            "In Azure → Certificates & secrets → + New client secret → copy the Value immediately into AUTH_AZURE_AD_CLIENT_SECRET.",
          ]
        : cfg.issues.length > 0
          ? ["Add missing variables to .env and restart: npm run dev"]
          : [],
  });
}
