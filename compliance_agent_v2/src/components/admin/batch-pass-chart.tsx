"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface BatchPassChartProps {
  label: string;
  pass: number;
  fail: number;
  compliance: number;
}

export function BatchPassChart({
  label,
  pass,
  fail,
  compliance,
}: BatchPassChartProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-zinc-900">Pass / fail rate</h2>
        <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <span>MCQ outcomes</span>
            <span className="tabular-nums">
              {pass}% pass · {fail}% fail
            </span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-md bg-zinc-100">
            <div className="bg-emerald-500/90" style={{ width: `${pass}%` }} />
            <div className="bg-red-400/80" style={{ width: `${fail}%` }} />
          </div>
        </div>
        <p className="text-sm text-zinc-600">
          <span className="font-semibold text-zinc-900">{compliance}%</span> overall
          batch compliance
        </p>
      </CardContent>
    </Card>
  );
}
