"use client";

import { EmailMonitoringPanel } from "@/components/admin/email-monitoring-panel";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default function AdminEmailMonitoringPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        wide
        title="Email monitoring"
        subtitle="Logged invitations, not-started reminders, failed-learner guidance, and completion emails across Compliance and Courses."
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
              Loading email monitoring…
            </div>
          }
        >
          <EmailMonitoringPanel />
        </Suspense>
      </AdminShell>
    </RouteGuard>
  );
}
