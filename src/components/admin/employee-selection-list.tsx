"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, Mail, Search, User, X } from "lucide-react";
import { useMemo, useState } from "react";

export interface SelectedEmployeePreview {
  workEmail: string;
  name: string;
  department: string | null;
  location: string | null;
}

interface EmployeeSelectionListProps {
  selected: SelectedEmployeePreview[];
  loading?: boolean;
  onRemove: (email: string) => void;
  onClearAll?: () => void;
}

export function EmployeeSelectionList({
  selected,
  loading = false,
  onRemove,
  onClearAll,
}: EmployeeSelectionListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = [...selected].sort((a, b) => a.name.localeCompare(b.name));
    if (!term) return sorted;
    return sorted.filter(
      (m) =>
        m.workEmail.toLowerCase().includes(term) ||
        m.name.toLowerCase().includes(term) ||
        (m.department ?? "").toLowerCase().includes(term) ||
        (m.location ?? "").toLowerCase().includes(term),
    );
  }, [selected, search]);

  return (
    <Card>
      <CardHeader className="border-b border-zinc-100 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-label">Selection</p>
            <h2 className="mt-1 text-base font-semibold text-zinc-900">Selected members</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2e3192]" />
                  Updating selection…
                </span>
              ) : (
                <>
                  {selected.length} employee{selected.length !== 1 ? "s" : ""} chosen for this batch.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 0 && onClearAll && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-medium text-zinc-500 hover:text-[#2e3192]"
              >
                Clear all
              </button>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search selected…"
                className="h-9 w-full min-w-[200px] rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15 sm:w-64"
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {selected.length === 0 ? (
          <div className="empty-state mx-6 my-10 border-dashed py-12">
            <User className="h-8 w-8 text-zinc-300" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium text-zinc-600">No employees selected yet</p>
            <p className="mt-1 text-xs text-zinc-400">
              Use the table above or Select all to add people from the filtered list.
            </p>
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
          <ul className="max-h-[320px] divide-y divide-zinc-100 overflow-y-auto">
            {filtered.map((member) => (
              <li
                key={member.workEmail}
                className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-zinc-50/80"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#2e3192]/15 bg-[#2e3192]/6 text-sm font-semibold text-[#2e3192]">
                  {(member.name || member.workEmail).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{member.name}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-zinc-500">
                    <Mail className="h-3 w-3 shrink-0" />
                    {member.workEmail}
                  </p>
                </div>
                {member.department && (
                  <span className="hidden shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 sm:inline">
                    {member.department}
                  </span>
                )}
                {member.location && (
                  <span
                    className={cn(
                      "hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 md:inline",
                      "bg-[#2e3192]/8 text-[#2e3192]",
                    )}
                  >
                    {member.location}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                  onClick={() => onRemove(member.workEmail)}
                  aria-label={`Remove ${member.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
