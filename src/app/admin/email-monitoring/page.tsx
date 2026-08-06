"use client";

import { EmailMonitoringPanel } from "@/components/admin/email-monitoring-panel";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";

export default function AdminEmailMonitoringPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        wide
        title="Email monitoring"
        subtitle="Logged invitations, not-started reminders, failed-learner guidance, and completion emails across Compliance and Courses."
      >
        <EmailMonitoringPanel />
      </AdminShell>
    </RouteGuard>
  );
}
