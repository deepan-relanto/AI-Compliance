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
import {
  EmployeeSelectionList,
  type SelectedEmployeePreview,
} from "@/components/admin/employee-selection-list";

function appendAll(params: URLSearchParams, key: string, values: string[]) {
  for (const value of values) params.append(key, value);
}

function buildQuery(filters: EmployeeFiltersState, page: number, all = false) {
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
  if (all) p.set("all", "1");
  else {
    p.set("page", String(page));
    p.set("limit", "50");
  }
  return p.toString();
}

function toPreview(emp: EmployeeRecord): SelectedEmployeePreview {
  return {
    workEmail: emp.workEmail,
    name: emp.name,
    department: emp.department,
    location: emp.location,
  };
}

function applyExclude(
  employees: EmployeeRecord[],
  excludeEmails?: Set<string>,
): EmployeeRecord[] {
  if (!excludeEmails?.size) return employees;
  return employees.filter((e) => !excludeEmails.has(e.workEmail.toLowerCase()));
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
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<Map<string, SelectedEmployeePreview>>(
    new Map(),
  );
  const [filteredEmployees, setFilteredEmployees] = useState<EmployeeRecord[] | null>(null);

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
    setFilteredEmployees(null);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/employees?${buildQuery(filters, 1, true)}`);
        const data = await res.json();
        if (!cancelled && data.ok) {
          setFilteredEmployees((data.employees ?? []) as EmployeeRecord[]);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [filters]);

  useEffect(() => {
    setSelectedDetails((prev) => {
      const next = new Map<string, SelectedEmployeePreview>();
      for (const [key, value] of prev) {
        if (selectedEmails.has(key)) next.set(key, value);
      }
      return next;
    });
  }, [selectedEmails]);

  const totalPages = Math.max(1, Math.ceil(total / 50));
  const visible = useMemo(
    () => applyExclude(employees, excludeEmails),
    [employees, excludeEmails],
  );

  const selectableTotal = useMemo(() => {
    if (!filteredEmployees) return total;
    return applyExclude(filteredEmployees, excludeEmails).length;
  }, [filteredEmployees, excludeEmails, total]);

  const updateSelection = (
    nextEmails: Set<string>,
    nextDetails: Map<string, SelectedEmployeePreview>,
  ) => {
    setSelectedDetails(nextDetails);
    onSelectionChange(nextEmails);
  };

  const toggleOne = (emp: EmployeeRecord) => {
    const next = new Set(selectedEmails);
    const nextDetails = new Map(selectedDetails);
    const key = emp.workEmail.toLowerCase();
    if (next.has(key)) {
      next.delete(key);
      nextDetails.delete(key);
    } else {
      next.add(key);
      nextDetails.set(key, toPreview(emp));
    }
    updateSelection(next, nextDetails);
  };

  const togglePage = () => {
    const next = new Set(selectedEmails);
    const nextDetails = new Map(selectedDetails);
    const allSelected = visible.every((e) => next.has(e.workEmail.toLowerCase()));
    for (const e of visible) {
      const key = e.workEmail.toLowerCase();
      if (allSelected) {
        next.delete(key);
        nextDetails.delete(key);
      } else {
        next.add(key);
        nextDetails.set(key, toPreview(e));
      }
    }
    updateSelection(next, nextDetails);
  };

  const fetchFilteredEmployees = useCallback(async () => {
    if (filteredEmployees) return filteredEmployees;
    const res = await fetch(`/api/employees?${buildQuery(filters, 1, true)}`);
    const data = await res.json();
    if (!data.ok) return [];
    const rows = (data.employees ?? []) as EmployeeRecord[];
    setFilteredEmployees(rows);
    return rows;
  }, [filteredEmployees, filters]);

  const toggleAllFiltered = async () => {
    setSelectingAll(true);
    try {
      const rows = await fetchFilteredEmployees();
      const matching = applyExclude(rows, excludeEmails);
      const allSelected =
        matching.length > 0 &&
        matching.every((e) => selectedEmails.has(e.workEmail.toLowerCase()));
      const next = new Set(selectedEmails);
      const nextDetails = new Map(selectedDetails);
      for (const e of matching) {
        const key = e.workEmail.toLowerCase();
        if (allSelected) {
          next.delete(key);
          nextDetails.delete(key);
        } else {
          next.add(key);
          nextDetails.set(key, toPreview(e));
        }
      }
      updateSelection(next, nextDetails);
    } finally {
      setSelectingAll(false);
    }
  };

  const removeSelected = (email: string) => {
    const key = email.toLowerCase();
    const next = new Set(selectedEmails);
    const nextDetails = new Map(selectedDetails);
    next.delete(key);
    nextDetails.delete(key);
    updateSelection(next, nextDetails);
  };

  const clearAllSelected = () => {
    updateSelection(new Set(), new Map());
  };

  const allFilteredSelected = useMemo(() => {
    if (!filteredEmployees?.length) return false;
    const matching = applyExclude(filteredEmployees, excludeEmails);
    return (
      matching.length > 0 &&
      matching.every((e) => selectedEmails.has(e.workEmail.toLowerCase()))
    );
  }, [filteredEmployees, excludeEmails, selectedEmails]);

  const allPageSelected =
    visible.length > 0 && visible.every((e) => selectedEmails.has(e.workEmail.toLowerCase()));

  const selectedPreview = useMemo(
    () =>
      [...selectedDetails.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [selectedDetails],
  );

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
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void toggleAllFiltered()}
              disabled={selectingAll || total === 0}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2e3192] hover:underline disabled:opacity-40"
            >
              {selectingAll && <Loader2 className="h-3 w-3 animate-spin" />}
              {allFilteredSelected
                ? `Deselect all filtered (${selectableTotal})`
                : `Select all filtered (${total})`}
            </button>
            <span className="text-zinc-300">·</span>
            <button
              type="button"
              onClick={togglePage}
              disabled={visible.length === 0}
              className="text-xs font-medium text-[#2e3192] hover:underline disabled:opacity-40"
            >
              {allPageSelected ? "Deselect page" : "Select page"}
            </button>
          </div>
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
                      onClick={() => toggleOne(emp)}
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

      <EmployeeSelectionList
        selected={selectedPreview}
        loading={selectingAll}
        onRemove={removeSelected}
        onClearAll={selectedEmails.size > 0 ? clearAllSelected : undefined}
      />
    </div>
  );
}
