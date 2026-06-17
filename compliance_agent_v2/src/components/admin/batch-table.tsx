"use client";

import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { EmployeeProgress } from "@/lib/types";
import { cn } from "@/lib/utils";

interface BatchTableProps {
  rows: EmployeeProgress[];
  title?: string;
}

export function BatchTable({
  rows,
  title = "Learner progress",
}: BatchTableProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Individual completion and MCQ performance
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="empty-state mx-6 my-8 border-dashed py-12">
            <p className="text-sm font-medium text-zinc-600">No learner sessions yet</p>
            <p className="mt-1 max-w-sm text-xs text-zinc-400">
              Progress and scores appear here once learners start assigned training modules.
            </p>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/80 text-xs font-medium text-zinc-500">
                <th className="px-6 py-3">Employee</th>
                <th className="px-6 py-3">Module</th>
                <th className="px-6 py-3">Progress</th>
                <th className="px-6 py-3">MCQ pass</th>
                <th className="px-6 py-3">Time</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={`${row.username}-${row.moduleId}`}
                  className={cn(
                    "border-b border-zinc-50 transition-colors hover:bg-zinc-50/50",
                    i === rows.length - 1 && "border-0",
                  )}
                >
                  <td className="px-6 py-3.5 font-mono text-xs text-zinc-600">
                    {row.username}
                  </td>
                  <td className="px-6 py-3.5 text-zinc-800">{row.moduleTitle}</td>
                  <td className="px-6 py-3.5 tabular-nums text-zinc-600">
                    {row.progressPercent}%
                  </td>
                  <td className="px-6 py-3.5 tabular-nums text-zinc-600">
                    {row.scorePercent != null ? `${row.scorePercent}%` : `${row.mcqPassRate}%`}
                  </td>
                  <td className="px-6 py-3.5 tabular-nums text-zinc-500">
                    {row.timeSpentMinutes}m
                  </td>
                  <td className="px-6 py-3.5">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
