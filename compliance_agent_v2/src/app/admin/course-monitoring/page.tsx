import { RouteGuard } from "@/components/auth/route-guard";
import { CourseMonitoringPanel } from "@/components/admin/course-monitoring-panel";
import { AdminShell } from "@/components/layout/admin-shell";

export default function CourseMonitoringPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        title="Course monitoring"
        subtitle="Proctor violations, retake reviews, and audit logs for AI course modules only."
      >
        <CourseMonitoringPanel />
      </AdminShell>
    </RouteGuard>
  );
}
