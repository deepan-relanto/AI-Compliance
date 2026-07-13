"use client";

import type { EmployeeFacets } from "@/lib/employee-types";
import { cn } from "@/lib/utils";
import { Calendar, Filter, X } from "lucide-react";

export interface EmployeeFiltersState {
  search: string;
  departments: string[];
  locations: string[];
  genders: string[];
  jobTitles: string[];
  workerTypes: string[];
  dateJoinedFrom: string;
  dateJoinedTo: string;
  unassignedOnly: boolean;
}

export const emptyEmployeeFilters = (): EmployeeFiltersState => ({
  search: "",
  departments: [],
  locations: [],
  genders: [],
  jobTitles: [],
  workerTypes: [],
  dateJoinedFrom: "",
  dateJoinedTo: "",
  unassignedOnly: false,
});

interface EmployeeFilterBarProps {
  facets: EmployeeFacets | null;
  filters: EmployeeFiltersState;
  onChange: (next: EmployeeFiltersState) => void;
  showUnassignedToggle?: boolean;
}

function PillGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (!options.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</p>
      <div className="max-h-36 overflow-y-auto pr-1">
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => {
            const active = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onToggle(opt)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-[#2e3192] bg-[#2e3192] text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#2e3192]/20 bg-[#2e3192]/8 px-2.5 py-1 text-xs font-medium text-[#2e3192]">
      {label}
      <button type="button" onClick={onRemove} className="rounded-full p-0.5 hover:bg-[#2e3192]/15">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function EmployeeFilterBar({
  facets,
  filters,
  onChange,
  showUnassignedToggle = true,
}: EmployeeFilterBarProps) {
  const toggle = (key: keyof EmployeeFiltersState, value: string) => {
    const arr = filters[key] as string[];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    onChange({ ...filters, [key]: next });
  };

  const activeCount =
    filters.departments.length +
    filters.locations.length +
    filters.genders.length +
    filters.jobTitles.length +
    filters.workerTypes.length +
    (filters.dateJoinedFrom ? 1 : 0) +
    (filters.dateJoinedTo ? 1 : 0) +
    (filters.unassignedOnly ? 1 : 0);

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200/90 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-800">
          <Filter className="h-4 w-4 text-[#2e3192]" />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-[#2e3192] px-2 py-0.5 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(emptyEmployeeFilters())}
            className="text-xs font-medium text-zinc-500 hover:text-[#2e3192]"
          >
            Clear all
          </button>
        )}
      </div>

      <input
        type="search"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        placeholder="Search name, email, employee #, job title…"
        className="h-10 w-full rounded-lg border border-zinc-200 px-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-[#2e3192]/40 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/15"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PillGroup
          label="Department"
          options={facets?.departments ?? []}
          selected={filters.departments}
          onToggle={(v) => toggle("departments", v)}
        />
        <PillGroup
          label="Location"
          options={facets?.locations ?? []}
          selected={filters.locations}
          onToggle={(v) => toggle("locations", v)}
        />
        <PillGroup
          label="Gender"
          options={facets?.genders ?? []}
          selected={filters.genders}
          onToggle={(v) => toggle("genders", v)}
        />
        <PillGroup
          label="Job title"
          options={facets?.jobTitles ?? []}
          selected={filters.jobTitles}
          onToggle={(v) => toggle("jobTitles", v)}
        />
        <PillGroup
          label="Worker type"
          options={facets?.workerTypes ?? []}
          selected={filters.workerTypes}
          onToggle={(v) => toggle("workerTypes", v)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
          <Calendar className="h-3.5 w-3.5 text-[#f15a24]" />
          Date joined
        </div>
        <input
          type="date"
          value={filters.dateJoinedFrom}
          min={facets?.dateJoinedMin ?? undefined}
          max={filters.dateJoinedTo || facets?.dateJoinedMax || undefined}
          onChange={(e) => onChange({ ...filters, dateJoinedFrom: e.target.value })}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs"
        />
        <span className="text-xs text-zinc-400">to</span>
        <input
          type="date"
          value={filters.dateJoinedTo}
          min={filters.dateJoinedFrom || facets?.dateJoinedMin || undefined}
          max={facets?.dateJoinedMax ?? undefined}
          onChange={(e) => onChange({ ...filters, dateJoinedTo: e.target.value })}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs"
        />
        {showUnassignedToggle && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-600">
            <input
              type="checkbox"
              checked={filters.unassignedOnly}
              onChange={(e) => onChange({ ...filters, unassignedOnly: e.target.checked })}
              className="rounded border-zinc-300 text-[#2e3192] focus:ring-[#2e3192]/30"
            />
            Unassigned only
          </label>
        )}
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 pt-3">
          {filters.departments.map((d) => (
            <ActiveChip key={`d-${d}`} label={d} onRemove={() => toggle("departments", d)} />
          ))}
          {filters.locations.map((d) => (
            <ActiveChip key={`l-${d}`} label={d} onRemove={() => toggle("locations", d)} />
          ))}
          {filters.genders.map((d) => (
            <ActiveChip key={`g-${d}`} label={d} onRemove={() => toggle("genders", d)} />
          ))}
          {filters.jobTitles.map((d) => (
            <ActiveChip key={`j-${d}`} label={d} onRemove={() => toggle("jobTitles", d)} />
          ))}
          {filters.workerTypes.map((d) => (
            <ActiveChip key={`w-${d}`} label={d} onRemove={() => toggle("workerTypes", d)} />
          ))}
          {filters.dateJoinedFrom && (
            <ActiveChip
              label={`Joined from ${filters.dateJoinedFrom}`}
              onRemove={() => onChange({ ...filters, dateJoinedFrom: "" })}
            />
          )}
          {filters.dateJoinedTo && (
            <ActiveChip
              label={`Joined to ${filters.dateJoinedTo}`}
              onRemove={() => onChange({ ...filters, dateJoinedTo: "" })}
            />
          )}
        </div>
      )}
    </div>
  );
}
