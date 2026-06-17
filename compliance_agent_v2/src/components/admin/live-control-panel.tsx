"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Radio, RefreshCw, Send, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

const actions = [
  {
    id: "push-mcq",
    label: "Push override question",
    description: "Inject MCQ into all active sessions in this batch",
    icon: Send,
  },
  {
    id: "force-sync",
    label: "Force slide sync",
    description: "Align active learners to a specific slide",
    icon: RefreshCw,
  },
  {
    id: "update-slide",
    label: "Push slide content",
    description: "Broadcast revised slide without page refresh",
    icon: SlidersHorizontal,
  },
];

export function LiveControlPanel() {
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Live control</h2>
            <p className="text-xs text-zinc-500">Real-time session orchestration (mock)</p>
          </div>
          <motion.span
            animate={{ opacity: pulse ? [1, 0.5, 1] : 1 }}
            className="ml-auto flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Ready
          </motion.span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {actions.map((action) => (
          <div
            key={action.id}
            className="flex flex-col gap-3 rounded-md border border-zinc-100 bg-zinc-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex gap-3">
              <action.icon
                className="mt-0.5 h-4 w-4 shrink-0 text-[#f15a24]"
                strokeWidth={1.5}
              />
              <div>
                <p className="text-sm font-medium text-zinc-800">{action.label}</p>
                <p className="text-xs text-zinc-500">{action.description}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLastAction(action.label);
                setPulse(true);
                setTimeout(() => setPulse(false), 1200);
              }}
            >
              Execute
            </Button>
          </div>
        ))}
        {lastAction && (
          <p className="rounded-md border border-zinc-100 bg-white px-3 py-2 font-mono text-xs text-zinc-500">
            Simulated: {lastAction} · {new Date().toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
