"use client";

import { BrandPanelHeader } from "@/components/employee/brand-panel-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Clock,
  Copy,
  Eye,
  Maximize2,
  Shield,
  Sparkles,
} from "lucide-react";

interface ProctorRulesModalProps {
  open: boolean;
  moduleTitle: string;
  onAccept: () => void;
  eyebrow?: string;
}

const RULES = [
  { icon: Maximize2, text: "Remain in fullscreen for the duration of the session." },
  { icon: Ban, text: "Do not switch tabs, minimize the window, or open other applications." },
  { icon: Copy, text: "Copying, screenshots, and printing are prohibited." },
  { icon: Eye, text: "Session activity is monitored. Three warnings will end the attempt." },
  { icon: Clock, text: "The session timer begins when you start the assessment." },
];

export function ProctorRulesModal({
  open,
  moduleTitle,
  onAccept,
  eyebrow = "Proctored compliance training",
}: ProctorRulesModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-zinc-950/65 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-elevated)]">
              <BrandPanelHeader
                eyebrow={eyebrow}
                title={moduleTitle}
                description="Review the session requirements below, then begin your assessment."
                icon={Shield}
              />

              <div className="px-6 py-5">
                <ul className="space-y-2">
                  {RULES.map((rule, index) => (
                    <motion.li
                      key={rule.text}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08 + index * 0.05 }}
                      className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/90 px-3.5 py-3 text-sm text-zinc-700"
                    >
                      <rule.icon
                        className="mt-0.5 h-4 w-4 shrink-0 text-[#2e3192]"
                        strokeWidth={1.75}
                      />
                      <span className="leading-snug">{rule.text}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
                <Button
                  className={cn(
                    "w-full cursor-pointer bg-gradient-to-r from-[#2e3192] to-[#3d42a8] text-white",
                    "hover:from-[#353a9e] hover:to-[#4a50b5] shadow-sm",
                  )}
                  size="lg"
                  onClick={onAccept}
                >
                  <Sparkles className="h-4 w-4" />
                  I understand — begin assessment
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
