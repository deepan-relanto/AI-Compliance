"use client";

import { EmployeePicker } from "@/components/admin/employee-picker";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";

interface BatchAddMembersPanelProps {
  batchId: string;
  existingEmails: string[];
  onAdded: () => void;
  onCancel: () => void;
}

export function BatchAddMembersPanel({
  batchId,
  existingEmails,
  onAdded,
  onCancel,
}: BatchAddMembersPanelProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exclude = new Set(existingEmails.map((e) => e.toLowerCase()));

  const handleAdd = async () => {
    if (!selected.size) {
      setError("Select at least one employee.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", employeeEmails: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not add members.");
        return;
      }
      onAdded();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-[#2e3192]/15 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-[#2e3192]" />
        <h3 className="text-base font-semibold text-zinc-900">Add members to batch</h3>
      </div>

      <EmployeePicker
        selectedEmails={selected}
        onSelectionChange={setSelected}
        excludeEmails={exclude}
        showUnassignedToggle
      />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={() => void handleAdd()} disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${selected.size} member(s)`}
        </Button>
      </div>
    </div>
  );
}
