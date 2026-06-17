"use client";

import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { ContentLibraryHub } from "@/components/admin/content-library-hub";

export default function AdminUploadPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        title="Content library"
        subtitle="Compliance assessments (AI-generated quizzes) and mandatory courses (admin question banks). Assign batches from each track."
      >
        <ContentLibraryHub />
      </AdminShell>
    </RouteGuard>
  );
}
