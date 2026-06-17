"use client";

import { EmployeePicker } from "@/components/admin/employee-picker";
import { Button } from "@/components/ui/button";
import { invalidateBatchesClientCache } from "@/hooks/use-batches";
import { Loader2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function BatchCreatePanel({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [batchName, setBatchName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!batchName.trim()) {
      setError("Enter a batch name.");
      return;
    }
    if (!selected.size) {
      setError("Select at least one employee.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: batchName.trim(),
          description: description.trim(),
          employeeEmails: [...selected],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not create batch.");
        return;
      }
      invalidateBatchesClientCache();
      router.push(`/admin/batch/${encodeURIComponent(data.batch.id)}`);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[#2e3192]/15 bg-gradient-to-r from-[#2e3192]/6 via-white to-[#f15a24]/6 p-5">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#2e3192]" />
          <h2 className="text-lg font-semibold text-zinc-900">Create training batch</h2>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          Filter the HR directory, select employees, and name your batch.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-zinc-500">Batch name *</label>
            <input
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="e.g. Relanto Leaders Q3"
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note for admins"
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15"
            />
          </div>
        </div>
      </div>

      <EmployeePicker selectedEmails={selected} onSelectionChange={setSelected} />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={() => void handleCreate()} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating…
            </>
          ) : (
            <>Create batch ({selected.size})</>
          )}
        </Button>
      </div>
    </div>
  );
}
