"use client";

import { MonitoringPanel } from "@/components/admin/monitoring-panel";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";

export default function AdminMonitoringPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        title="Assessment Monitoring"
        subtitle="Real-time integrity logs, user compliance tracking, and automated focus alerts."
      >
        <MonitoringPanel />
      </AdminShell>
    </RouteGuard>
  );
}
