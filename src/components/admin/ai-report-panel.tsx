"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Bot, Sparkles } from "lucide-react";

function renderLine(line: string, key: number) {
  if (line.startsWith("## ")) {
    return (
      <h3 key={key} className="mt-4 first:mt-0 text-base font-semibold text-zinc-900">
        {line.replace("## ", "")}
      </h3>
    );
  }
  if (line.match(/^\d+\./)) {
    return (
      <li key={key} className="ml-4 mt-1 list-decimal text-sm text-zinc-600">
        {line.replace(/^\d+\.\s*/, "")}
      </li>
    );
  }
  if (line.startsWith("- ")) {
    return (
      <li key={key} className="ml-4 mt-1 list-disc text-sm text-zinc-600">
        {line.slice(2)}
      </li>
    );
  }
  if (!line.trim()) return <div key={key} className="h-2" />;
  return (
    <p key={key} className="mt-2 text-sm leading-relaxed text-zinc-600">
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") ? (
          <strong key={i} className="font-medium text-zinc-800">
            {part.replace(/\*\*/g, "")}
          </strong>
        ) : (
          part
        ),
      )}
    </p>
  );
}

interface AiReportPanelProps {
  content: string;
}

export function AiReportPanel({ content }: AiReportPanelProps) {
  const lines = content.split("\n");

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#2e3192]/8">
            <Bot className="h-4 w-4 text-[#2e3192]" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">AI compliance report</h2>
            <p className="flex items-center gap-1 text-xs text-zinc-500">
              <Sparkles className="h-3 w-3 text-[#f15a24]" />
              Gemini insights (mock)
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-md border border-zinc-100 bg-zinc-50/80 p-5"
        >
          {lines.map((line, i) => renderLine(line, i))}
        </motion.div>
      </CardContent>
    </Card>
  );
}
