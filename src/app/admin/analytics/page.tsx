"use client";

import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const batchId = searchParams.get("batch") ?? undefined;

  return <AnalyticsDashboard initialBatchId={batchId} />;
}

export default function AdminAnalyticsPage() {
  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        wide
        title="Analytics"
        subtitle="Organization-wide trends, exports, and historical compliance data."
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
              Loading analytics…
            </div>
          }
        >
          <AnalyticsContent />
        </Suspense>
      </AdminShell>
    </RouteGuard>
  );
}
