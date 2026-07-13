import { auth } from "@/auth";
import { getSql } from "@/lib/db";
import {
  verifyModuleAccess,
  type ModuleAccessDenyCode,
} from "@/lib/services/module-access-service";
import { emailsMatch } from "@/lib/training-link";
import { NextResponse } from "next/server";

export async function getSessionEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email?.trim().toLowerCase() ?? null;
}

export type SessionCheckResult =
  | { ok: true; email: string }
  | { ok: false; response: NextResponse };

export async function requireSessionEmail(
  claimedEmail?: string | null,
): Promise<SessionCheckResult> {
  const sessionEmail = await getSessionEmail();
  if (!sessionEmail) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: "Sign in required." },
        { status: 401 },
      ),
    };
  }

  if (claimedEmail && !emailsMatch(sessionEmail, claimedEmail)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          message: "You can only access your own training records.",
          code: "wrong_recipient" satisfies ModuleAccessDenyCode,
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true, email: sessionEmail };
}

export type LearnerModuleCheckResult =
  | { ok: true; email: string; batchId: string }
  | { ok: false; response: NextResponse };

/** Session email must match claimed email (if any) and user batch must be assigned the module. */
export async function requireLearnerModuleAccess(
  moduleId: string,
  claimedEmail?: string | null,
  intendedEmail?: string | null,
): Promise<LearnerModuleCheckResult> {
  const sessionCheck = await requireSessionEmail(claimedEmail);
  if (!sessionCheck.ok) return sessionCheck;

  const sql = getSql();
  const access = await verifyModuleAccess(
    sql,
    sessionCheck.email,
    moduleId,
    intendedEmail,
  );
  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, message: access.message, code: access.code },
        { status: access.code === "not_found" ? 404 : 403 },
      ),
    };
  }

  return { ok: true, email: sessionCheck.email, batchId: access.batchId };
}
