"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { Award, Flame, Target, Zap } from "lucide-react";
export interface GamificationBadge {
  id: string;
  name: string;
  description: string;
}

/** How long each badge toast stays on screen before the next one (if queued). */
export const BADGE_DISPLAY_MS = 4200;

const BADGE_ICONS: Record<string, typeof Award> = {
  starter: Award,
  quickLearner: Target,
  streakMaster: Flame,
  champion: Zap,
  perfect: Award,
};

interface BadgeUnlockProps {
  badge: GamificationBadge | null;
  onClose: () => void;
}

export function BadgeUnlock({ badge, onClose }: BadgeUnlockProps) {
  const Icon = badge ? (BADGE_ICONS[badge.id] ?? Award) : Award;

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          key={badge.id}
          initial={{ opacity: 0, y: -28, scale: 0.82 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: [0.82, 1.08, 1],
          }}
          exit={{ opacity: 0, y: -16, scale: 0.92 }}
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 24,
            scale: { duration: 0.45, times: [0, 0.55, 1] },
          }}
          className="pointer-events-none fixed left-1/2 top-16 z-[88] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2"
          onAnimationComplete={() => {
            window.setTimeout(onClose, BADGE_DISPLAY_MS);
          }}
        >
          <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[0_16px_48px_rgba(46,49,146,0.2)]">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#2e3192] via-[#3d42a8] to-[#f15a24]" />
            <motion.div
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: BADGE_DISPLAY_MS / 1000, ease: "linear" }}
              className="h-0.5 bg-[#2e3192]/30"
            />
            <div className="p-4">
              <div className="flex items-start gap-3">
                <motion.div
                  initial={{ rotate: -12, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 480, damping: 18, delay: 0.08 }}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white shadow-md",
                    badge.id === "streakMaster"
                      ? "bg-gradient-to-br from-[#2e3192] to-[#3d42a8]"
                      : badge.id === "quickLearner"
                        ? "bg-gradient-to-br from-[#3d42a8] to-[#f15a24]"
                        : "bg-gradient-to-br from-[#2e3192] via-[#3d42a8] to-[#f15a24]",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </motion.div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#2e3192]">
                    Badge unlocked
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold text-zinc-950">
                    {badge.name}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600">
                    {badge.description}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
