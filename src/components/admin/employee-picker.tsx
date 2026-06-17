"use client";

import type { EmployeeFacets, EmployeeRecord } from "@/lib/employee-types";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmployeeFilterBar,
  emptyEmployeeFilters,
  type EmployeeFiltersState,
} from "@/components/admin/employee-filter-bar";

function appendAll(params: URLSearchParams, key: string, values: string[]) {
  for (const value of values) params.append(key, value);
}

function buildQuery(filters: EmployeeFiltersState, page: number) {
  const p = new URLSearchParams();
  if (filters.search) p.set("search", filters.search);
  appendAll(p, "departments", filters.departments);
  appendAll(p, "locations", filters.locations);
  appendAll(p, "genders", filters.genders);
  appendAll(p, "jobTitles", filters.jobTitles);
  appendAll(p, "workerTypes", filters.workerTypes);
  if (filters.dateJoinedFrom) p.set("dateJoinedFrom", filters.dateJoinedFrom);
  if (filters.dateJoinedTo) p.set("dateJoinedTo", filters.dateJoinedTo);
  if (filters.unassignedOnly) p.set("unassignedOnly", "1");
  p.set("page", String(page));
  p.set("limit", "50");
  return p.toString();
}

interface EmployeePickerProps {
  selectedEmails: Set<string>;
  onSelectionChange: (emails: Set<string>) => void;
  excludeEmails?: Set<string>;
  showUnassignedToggle?: boolean;
}

export function EmployeePicker({
  selectedEmails,
  onSelectionChange,
  excludeEmails,
  showUnassignedToggle = true,
}: EmployeePickerProps) {
  const [facets, setFacets] = useState<EmployeeFacets | null>(null);
  const [filters, setFilters] = useState<EmployeeFiltersState>(emptyEmployeeFilters());
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employees?facets=1")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setFacets(d.facets);
      });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/employees?${buildQuery(filters, page)}`);
      const data = await res.json();
      if (data.ok) {
        setEmployees(data.employees ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(total / 50));
  const visible = useMemo(
    () =>
      excludeEmails?.size
        ? employees.filter((e) => !excludeEmails.has(e.workEmail.toLowerCase()))
        : employees,
    [employees, excludeEmails],
  );

  const toggleOne = (email: string) => {
    const next = new Set(selectedEmails);
    const key = email.toLowerCase();
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  };

  const togglePage = () => {
    const next = new Set(selectedEmails);
    const allSelected = visible.every((e) => next.has(e.workEmail.toLowerCase()));
    for (const e of visible) {
      const key = e.workEmail.toLowerCase();
      if (allSelected) next.delete(key);
      else next.add(key);
    }
    onSelectionChange(next);
  };

  return (
    <div className="space-y-4">
      <EmployeeFilterBar
        facets={facets}
        filters={filters}
        onChange={setFilters}
        showUnassignedToggle={showUnassignedToggle}
      />

      <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
          <p className="text-sm text-zinc-600">
            <span className="font-semibold text-zinc-900">{total}</span> match
            {total !== 1 ? "es" : ""} ·{" "}
            <span className="font-semibold text-[#2e3192]">{selectedEmails.size}</span> selected
          </p>
          <button
            type="button"
            onClick={togglePage}
            className="text-xs font-medium text-[#2e3192] hover:underline"
          >
            {visible.every((e) => selectedEmails.has(e.workEmail.toLowerCase()))
              ? "Deselect page"
              : "Select page"}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin text-[#2e3192]" />
            Loading employees…
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-500">No employees match these filters.</div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-zinc-100 bg-zinc-50 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="w-10 px-4 py-2.5" />
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Location</th>
                  <th className="px-3 py-2.5">Joined</th>
                  <th className="px-3 py-2.5">Batch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {visible.map((emp) => {
                  const checked = selectedEmails.has(emp.workEmail.toLowerCase());
                  return (
                    <tr
                      key={emp.id}
                      className={cn("cursor-pointer hover:bg-zinc-50/80", checked && "bg-[#2e3192]/5")}
                      onClick={() => toggleOne(emp.workEmail)}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          className="rounded border-zinc-300 text-[#2e3192]"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-zinc-900">{emp.name}</td>
                      <td className="px-3 py-3 font-mono text-xs text-zinc-500">{emp.workEmail}</td>
                      <td className="px-3 py-3 text-zinc-600">{emp.department ?? "—"}</td>
                      <td className="px-3 py-3 text-zinc-600">{emp.location ?? "—"}</td>
                      <td className="px-3 py-3 text-zinc-600">{emp.dateJoined ?? "—"}</td>
                      <td className="px-3 py-3">
                        {emp.batchLabel ? (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                            {emp.batchLabel}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">Unassigned</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
