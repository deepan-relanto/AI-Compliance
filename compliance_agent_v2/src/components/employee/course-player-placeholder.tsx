"use client";

import { Button } from "@/components/ui/button";
import { EmployeeShell } from "@/components/layout/employee-shell";
import { GraduationCap } from "lucide-react";
import { useRouter } from "next/navigation";

interface CoursePlayerPlaceholderProps {
  moduleTitle: string;
}

/** Shown until the full course step player (PDF → video → mind map → quiz) ships. */
export function CoursePlayerPlaceholder({ moduleTitle }: CoursePlayerPlaceholderProps) {
  const router = useRouter();

  return (
    <EmployeeShell title="Course" subtitle={moduleTitle}>
      <div className="surface-card mx-auto flex max-w-lg flex-col items-center gap-4 p-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#2e3192]/10">
          <GraduationCap className="h-7 w-7 text-[#2e3192]" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">Course player coming soon</h2>
        <p className="text-sm leading-relaxed text-zinc-600">
          <span className="font-medium">{moduleTitle}</span> is assigned to you. The full learning
          path — PDF, video, mind map, infographic, and quiz — will open here in the next release.
        </p>
        <p className="text-xs text-zinc-500">
          This course is mandatory with proctored training and a 70% pass requirement, same as
          compliance modules.
        </p>
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>
          Back to My training
        </Button>
      </div>
    </EmployeeShell>
  );
}
