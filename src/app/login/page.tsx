import { LoginForm } from "@/components/auth/login-form";
import { LoginRedirect } from "@/components/auth/login-redirect";
import { RelantoLogo } from "@/components/brand/relanto-logo";
import { CheckCircle2, Shield } from "lucide-react";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const highlights = [
  "Gated slide pathways with validated MCQs",
  "Proctored fullscreen sessions",
  "Batch assignment and live monitoring",
];

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={null}>
        <LoginRedirect />
      </Suspense>
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Left — original light brand panel */}
        <div className="relative hidden overflow-hidden border-r border-zinc-200/80 bg-zinc-50 lg:block">
          <div className="grid-pattern-light absolute inset-0 opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-br from-[#2e3192]/[0.04] via-transparent to-[#f15a24]/[0.03]" />
          <div className="relative flex h-full flex-col justify-between p-12 xl:p-14">
            <RelantoLogo size="lg" showTagline />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#f15a24]">
                Compliance Agent
              </p>
              <h2 className="mt-4 max-w-md text-[1.75rem] font-semibold leading-snug tracking-tight text-zinc-900 text-balance">
                Enforce engagement. Validate understanding.
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
                Mandatory training with checkpoint gates, integrity monitoring, and
                administrative oversight — for the{" "}
                <span className="font-medium text-zinc-700">relanto.ai</span> organization.
              </p>
              <ul className="mt-8 space-y-3">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-600">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                      strokeWidth={1.75}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>© 2026 Relanto</span>
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" strokeWidth={1.75} />
                Enterprise training
              </span>
            </div>
          </div>
        </div>

        {/* Right — sign-in card */}
        <div className="flex items-center justify-center bg-[#f8f9fb] px-6 py-12 sm:px-14">
          <div className="w-full max-w-[400px]">
            <Suspense
              fallback={
                <div className="h-48 animate-pulse rounded-xl bg-zinc-100" />
              }
            >
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
