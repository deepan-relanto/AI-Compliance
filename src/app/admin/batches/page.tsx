"use client";

import { BatchCreatePanel } from "@/components/admin/batch-create-panel";
import { BatchPicker } from "@/components/admin/batch-picker";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { cn } from "@/lib/utils";
import { LayoutGrid, Plus } from "lucide-react";
import { useState } from "react";

type Tab = "list" | "create";

export default function AdminBatchesPage() {
  const [tab, setTab] = useState<Tab>("list");

  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        title="Batches"
        subtitle="Create batches from the HR directory, manage rosters, and assign training."
        wide
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setTab("list")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === "list" ? "bg-[#2e3192] text-white" : "text-zinc-600 hover:bg-zinc-50",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              All batches
            </button>
            <button
              type="button"
              onClick={() => setTab("create")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === "create" ? "bg-[#2e3192] text-white" : "text-zinc-600 hover:bg-zinc-50",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Create batch
            </button>
          </div>
        </div>

        {tab === "list" ? <BatchPicker /> : <BatchCreatePanel onCancel={() => setTab("list")} />}
      </AdminShell>
    </RouteGuard>
  );
}
