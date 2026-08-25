"use client";

import { BatchAddMembersPanel } from "@/components/admin/batch-add-members-panel";
import { BatchMembersList, type BatchMember } from "@/components/admin/batch-members-list";
import { RouteGuard } from "@/components/auth/route-guard";
import { AdminShell } from "@/components/layout/admin-shell";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";
import { BarChart3, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface BatchMeta {
  id: string;
  label: string;
  description: string;
  memberCount: number;
}

export default function BatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const batchId = typeof params.batchId === "string" ? params.batchId : "";
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingSelf, setAddingSelf] = useState(false);
  const [selfError, setSelfError] = useState<string | null>(null);
  const sessionEmail =
    useAuthStore((s) => s.user?.username)?.trim().toLowerCase() ?? "";

  const { data, isLoading, mutate } = useSWR(
    batchId ? `/api/batches/${encodeURIComponent(batchId)}` : null,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 15_000,
    },
  );

  const batch = data?.ok && data.batch ? {
    id: data.batch.id,
    label: data.batch.label,
    description: data.batch.description ?? "",
    memberCount: Number(data.batch.memberCount ?? 0),
  } : null;

  const members: BatchMember[] = data?.ok && Array.isArray(data.users) ? data.users : [];
  const alreadyMember = Boolean(
    sessionEmail && members.some((m) => m.email.toLowerCase() === sessionEmail),
  );

  const handleAddMyself = async () => {
    if (!sessionEmail || alreadyMember) return;
    setAddingSelf(true);
    setSelfError(null);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", employeeEmails: [sessionEmail] }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setSelfError(payload.error ?? "Could not add you to this batch.");
        return;
      }
      void mutate();
    } catch {
      setSelfError("Network error.");
    } finally {
      setAddingSelf(false);
    }
  };

  useEffect(() => {
    if (!isLoading && !batch) router.replace("/admin/batches");
  }, [isLoading, batch, router]);

  const handleDelete = async () => {
    if (!batch || !confirm(`Delete batch "${batch.label}"? Members will be unassigned.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) router.push("/admin/batches");
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
        Loading batch…
      </div>
    );
  }

  if (!batch) return null;

  return (
    <RouteGuard allowedRoles={["admin"]}>
      <AdminShell
        title={batch.label}
        subtitle={batch.description || "Learners assigned to this training batch."}
        backHref="/admin/batches"
        backLabel="All batches"
        wide
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
            <Users className="h-3.5 w-3.5 text-[#2e3192]" />
            {members.length} member{members.length !== 1 ? "s" : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleAddMyself()}
              disabled={alreadyMember || addingSelf || !sessionEmail}
            >
              {addingSelf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              {alreadyMember ? "You are in this batch" : "Add myself"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}>
              <UserPlus className="h-3.5 w-3.5" />
              {showAdd ? "Close" : "Add members"}
            </Button>
            <Link
              href={`/admin/analytics/batch/${encodeURIComponent(batchId)}?track=compliance`}
            >
              <Button variant="outline" size="sm">
                <BarChart3 className="h-3.5 w-3.5" />
                Analytics
              </Button>
            </Link>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete batch
            </Button>
          </div>
        </div>

        {selfError && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {selfError}
          </p>
        )}

        {showAdd && (
          <div className="mb-6">
            <BatchAddMembersPanel
              batchId={batchId}
              existingEmails={members.map((m) => m.email)}
              onAdded={() => {
                setShowAdd(false);
                void mutate();
              }}
              onCancel={() => setShowAdd(false)}
            />
          </div>
        )}

        <BatchMembersList
          members={members}
          batchLabel={batch.label}
          batchId={batchId}
          analyticsHref={`/admin/analytics/batch/${encodeURIComponent(batchId)}?track=compliance`}
          onMemberRemoved={() => void mutate()}
        />
      </AdminShell>
    </RouteGuard>
  );
}
