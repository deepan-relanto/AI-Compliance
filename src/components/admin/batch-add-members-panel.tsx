"use client";

import { EmployeePicker } from "@/components/admin/employee-picker";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { invalidateLearnerDashboardClientCache } from "@/lib/progress-api";
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
  const sessionEmail =
    useAuthStore((s) => s.user?.username)?.trim().toLowerCase() ?? "";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [addingSelf, setAddingSelf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exclude = new Set(existingEmails.map((e) => e.toLowerCase()));
  const alreadyMember = Boolean(sessionEmail && exclude.has(sessionEmail));

  const addEmails = async (emails: string[]) => {
    const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", employeeEmails: emails }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Could not add members.");
    }
    invalidateLearnerDashboardClientCache();
  };

  const handleAdd = async () => {
    if (!selected.size) {
      setError("Select at least one employee.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addEmails([...selected]);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add members.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMyself = async () => {
    if (!sessionEmail || alreadyMember) return;
    setAddingSelf(true);
    setError(null);
    try {
      await addEmails([sessionEmail]);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add you to this batch.");
    } finally {
      setAddingSelf(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-[#2e3192]/15 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-[#2e3192]" />
          <h3 className="text-base font-semibold text-zinc-900">Add members to batch</h3>
        </div>
        {sessionEmail && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleAddMyself()}
            disabled={alreadyMember || addingSelf || submitting}
          >
            {addingSelf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            {alreadyMember ? "You are already in this batch" : "Add myself"}
          </Button>
        )}
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
        <Button variant="outline" onClick={onCancel} disabled={submitting || addingSelf}>
          Cancel
        </Button>
        <Button onClick={() => void handleAdd()} disabled={submitting || addingSelf}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add ${selected.size} member(s)`}
        </Button>
      </div>
    </div>
  );
}
