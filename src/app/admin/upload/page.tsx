"use client";

import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { ContentLibraryHub } from "@/components/admin/content-library-hub";

export default function AdminUploadPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        title="Content library"
        subtitle="Upload PDFs, reuse existing assessments with questions, assign batches, and review learner scores."
      >
        <ContentLibraryHub />
      </AdminShell>
    </RouteGuard>
  );
}
