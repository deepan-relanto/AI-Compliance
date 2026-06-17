"use client";

import { FeedbackTable } from "@/components/admin/feedback-table";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";

export default function AdminFeedbackPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        wide
        title="Feedback"
        subtitle="Search, filter by batch, and export learner feedback from completed assessments."
      >
        <FeedbackTable />
      </AdminShell>
    </RouteGuard>
  );
}
