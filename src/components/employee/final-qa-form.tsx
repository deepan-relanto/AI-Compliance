"use client";

import { Button } from "@/components/ui/button";
import { submitCourseFeedback, submitFeedback } from "@/lib/feedback-store";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Check, MessageSquare, Star } from "lucide-react";
import { useState } from "react";

interface FinalQaFormProps {
  moduleTitle: string;
  moduleId: string;
  userId: string;
  onSuccess?: () => void;
  size?: "default" | "large";
  /** When true, parent shows the completion notice instead of inline success UI. */
  deferSuccessToParent?: boolean;
  /** When false, feedback message is optional (learner may skip on parent screen). */
  messageRequired?: boolean;
  /** When true, learner must select a 1–5 star rating before submitting. */
  ratingRequired?: boolean;
  /** Persist into course_feedback_entries when "course". */
  track?: "compliance" | "course";
}

export function FinalQaForm({
  moduleTitle,
  moduleId,
  userId,
  onSuccess,
  size = "default",
  deferSuccessToParent = false,
  messageRequired = true,
  ratingRequired = false,
  track = "compliance",
}: FinalQaFormProps) {
  const large = size === "large";
  const batchId = useAuthStore((s) => s.user?.batchId);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit =
    message.trim().length > 0 && (!ratingRequired || rating >= 1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const ratingPrefix = rating > 0 ? `[Rating: ${rating}/5] ` : "";
    const text = ratingPrefix + message.trim();
    if (track === "course") {
      submitCourseFeedback(userId, moduleId, moduleTitle, text, batchId);
    } else {
      submitFeedback(userId, moduleId, moduleTitle, text, batchId);
    }
    setSubmitted(true);
    if (onSuccess) {
      onSuccess();
    }
  };

  if (submitted && !deferSuccessToParent) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "rounded-xl border border-emerald-200 bg-emerald-50 text-center",
          large ? "px-10 py-16" : "px-6 py-12",
        )}
      >
        <Check
          className={cn("mx-auto text-emerald-600", large ? "h-12 w-12" : "h-8 w-8")}
          strokeWidth={1.5}
        />
        <p className={cn("font-semibold text-zinc-900", large ? "mt-6 text-2xl" : "mt-4 text-lg")}>
          Feedback submitted
        </p>
        <p className="mt-2 text-sm text-zinc-600">
          Routed to administrators for{" "}
          <span className="font-medium">{moduleTitle}</span>.
        </p>
      </motion.div>
    );
  }

  if (submitted && deferSuccessToParent) {
    return (
      <div
        className={cn(
          "rounded-xl border border-zinc-200 bg-zinc-50 text-center text-sm text-zinc-500",
          large ? "px-8 py-10" : "px-6 py-8",
        )}
      >
        Feedback received. Please confirm completion in the dialog.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-[var(--shadow-card)]",
        large ? "p-0" : "p-0 shadow-sm",
      )}
    >
      <div className="h-1 w-full bg-gradient-to-r from-[#2e3192] via-[#3d42a8] to-[#f15a24]" />
      <div className={cn(large ? "p-5 sm:p-6" : "p-6")}>
      <div className={cn("flex items-center", large ? "gap-3" : "gap-2")}>
        <MessageSquare
          className={cn("text-[#2e3192]", large ? "h-6 w-6" : "h-4 w-4")}
          strokeWidth={1.75}
        />
        <h3
          className={cn(
            "font-semibold text-zinc-900",
            large ? "text-xl tracking-tight" : "text-sm",
          )}
        >
          Training feedback
        </h3>
      </div>
      <p className={cn("text-zinc-500", large ? "mt-2 text-base leading-relaxed" : "mt-1 text-sm")}>
        {messageRequired && ratingRequired
          ? "Both a star rating and written feedback are required to complete your training."
          : messageRequired
            ? "Share your experience or questions before your completion is finalized."
            : ratingRequired
              ? "Please rate this module before finishing."
              : "Optional — help us improve this module with a quick rating or comment."}
      </p>

      <form onSubmit={handleSubmit} className={cn(large ? "mt-5 space-y-4" : "mt-4 space-y-3")}>
        <div>
          <p
            className={cn(
              "font-medium text-zinc-500",
              large ? "mb-3 text-sm" : "mb-1.5 text-xs",
            )}
          >
            Rating{" "}
            {ratingRequired ? (
              <span className="text-[#f15a24]">(required)</span>
            ) : (
              <span className="text-zinc-400">(optional)</span>
            )}
          </p>
          <div className={cn("flex", large ? "gap-2" : "gap-1")}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() =>
                  setRating(
                    ratingRequired ? star : star === rating ? 0 : star,
                  )
                }
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                className={cn(
                  "rounded transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e3192]/30",
                  large ? "p-1" : "p-0.5",
                )}
                aria-label={`Rate ${star} out of 5`}
              >
                <Star
                  className={cn("transition-colors", large ? "h-7 w-7" : "h-5 w-5")}
                  fill={(hoveredStar || rating) >= star ? "#f15a24" : "none"}
                  stroke={(hoveredStar || rating) >= star ? "#f15a24" : "#d4d4d8"}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p
            className={cn(
              "font-medium text-zinc-500",
              large ? "mb-2 text-sm" : "mb-1.5 text-xs",
            )}
          >
            Written feedback{" "}
            {messageRequired ? (
              <span className="text-[#f15a24]">(required)</span>
            ) : (
              <span className="text-zinc-400">(optional)</span>
            )}
          </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Share what worked well, what was unclear, or how we can improve…"
          rows={large ? 4 : 3}
          required={messageRequired}
          className={cn(
            "training-form-input flex w-full cursor-text select-text resize-none rounded-lg border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2e3192]/25",
            large ? "px-4 py-3 text-base" : "px-3 py-2 text-sm",
          )}
        />
        </div>
        <Button
          type="submit"
          size={large ? "lg" : "md"}
          disabled={!canSubmit}
          className={cn(
            "cursor-pointer bg-gradient-to-r from-[#2e3192] to-[#3d42a8] text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50",
            large ? "w-full" : undefined,
          )}
        >
          Submit feedback & complete training
        </Button>
      </form>
      </div>
    </div>
  );
}
