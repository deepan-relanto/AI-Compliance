"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Mail, Search, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

export interface BatchMember {
  email: string;
  displayName: string;
  role: string;
}

interface BatchMembersListProps {
  members: BatchMember[];
  batchLabel: string;
  batchId?: string;
  analyticsHref?: string;
  onMemberRemoved?: () => void;
}

export function BatchMembersList({
  members,
  batchLabel,
  batchId,
  analyticsHref = "/admin/analytics",
  onMemberRemoved,
}: BatchMembersListProps) {
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter(
      (m) =>
        m.email.toLowerCase().includes(term) ||
        m.displayName.toLowerCase().includes(term),
    );
  }, [members, search]);

  const handleRemove = async (email: string) => {
    if (!batchId || !confirm(`Remove ${email} from ${batchLabel}?`)) return;
    setRemoving(email);
    try {
      const res = await fetch(`/api/batches/${encodeURIComponent(batchId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", employeeEmails: [email] }),
      });
      const data = await res.json();
      if (data.ok) onMemberRemoved?.();
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b border-zinc-100 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="section-label">Roster</p>
              <h2 className="mt-1 text-base font-semibold text-zinc-900">Batch members</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {members.length} learner{members.length !== 1 ? "s" : ""} in{" "}
                <span className="font-medium text-zinc-700">{batchLabel}</span>. Scores in{" "}
                <Link href={analyticsHref} className="font-medium text-[#2e3192] hover:underline">
                  Analytics
                </Link>
                .
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="h-9 w-full min-w-[200px] rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15 sm:w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {members.length === 0 ? (
            <div className="empty-state mx-6 my-10 border-dashed py-12">
              <User className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium text-zinc-600">No learners in this batch</p>
              <p className="mt-1 text-xs text-zinc-400">Use Add members to assign people from the HR directory.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state mx-6 my-10 border-dashed py-12">
              <p className="text-sm font-medium text-zinc-600">No matches for &ldquo;{search}&rdquo;</p>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-2 text-xs font-medium text-[#2e3192] hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {filtered.map((member) => (
                <li
                  key={member.email}
                  className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-zinc-50/80"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#2e3192]/15 bg-[#2e3192]/6 text-sm font-semibold text-[#2e3192]">
                    {(member.displayName || member.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{member.displayName}</p>
                    <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-zinc-500">
                      <Mail className="h-3 w-3 shrink-0" />
                      {member.email}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                      member.role === "admin"
                        ? "bg-[#2e3192]/10 text-[#2e3192]"
                        : "bg-zinc-100 text-zinc-600",
                    )}
                  >
                    {member.role}
                  </span>
                  {batchId && member.role !== "admin" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={removing === member.email}
                      onClick={() => void handleRemove(member.email)}
                    >
                      {removing === member.email ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
