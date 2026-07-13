"use client";

import { cn } from "@/lib/utils";
import {
  isValidSignatureName,
  normalizeSignatureName,
  renderTypedSignaturePng,
} from "@/lib/signature-canvas";
import { Pinyon_Script } from "next/font/google";
import { PenLine } from "lucide-react";
import { useCallback, useEffect, useId, useRef } from "react";

const signatureFont = Pinyon_Script({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export interface TypedSignatureFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSignatureReady: (dataUrl: string | null) => void;
  autoFocus?: boolean;
  className?: string;
}

export function TypedSignatureField({
  value,
  onChange,
  onSignatureReady,
  autoFocus = false,
  className,
}: TypedSignatureFieldProps) {
  const inputId = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const normalized = normalizeSignatureName(value);
  const valid = isValidSignatureName(normalized);
  const fontFamily = signatureFont.style.fontFamily;

  const syncSignatureAsset = useCallback(
    async (name: string) => {
      const trimmed = normalizeSignatureName(name);
      if (!isValidSignatureName(trimmed)) {
        onSignatureReady(null);
        return;
      }
      const dataUrl = await renderTypedSignaturePng(trimmed, fontFamily);
      onSignatureReady(dataUrl);
    },
    [fontFamily, onSignatureReady],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void syncSignatureAsset(value);
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, syncSignatureAsset]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-1.5">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5"
        >
          <PenLine className="h-3.5 w-3.5 text-[#2e3192]" aria-hidden />
          Type your full legal name
        </label>
        <input
          id={inputId}
          type="text"
          autoComplete="name"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Jane Smith"
          className={cn(
            "training-form-input w-full rounded-md border bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm transition-colors",
            "placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#2e3192]/25 focus:border-[#2e3192]/40",
            "cursor-text select-text",
            value.length > 0 && !valid ? "border-amber-300" : "border-zinc-200",
          )}
        />
        <p className="text-[10px] text-zinc-500 leading-normal">
          Your name appears as your electronic signature below. By submitting, you attest to the
          statements above.
        </p>
        {value.length > 0 && !valid && (
          <p className="text-[10px] font-medium text-amber-700">
            Enter at least 2 characters using letters, spaces, hyphens, or apostrophes.
          </p>
        )}
      </div>

      {valid && (
        <div
          className="relative overflow-hidden rounded-lg border border-zinc-200/90 bg-gradient-to-b from-white via-white to-zinc-50 px-6 py-4.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
          aria-live="polite"
        >
          <div
            className="pointer-events-none absolute inset-x-10 bottom-[2.2rem] h-px bg-gradient-to-r from-transparent via-zinc-300/90 to-transparent"
            aria-hidden
          />
          <p
            className={cn(
              "relative text-center leading-none tracking-wide text-[#1a2d52]",
              "text-[2.2rem] sm:text-[2.6rem]",
              signatureFont.className,
            )}
          >
            {normalized}
          </p>
          <p className="relative mt-4 text-center text-[9px] font-medium uppercase tracking-[0.22em] text-zinc-400">
            Electronic signature
          </p>
        </div>
      )}
    </div>
  );
}
