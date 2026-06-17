/** Compliance = POSH/security PDF + AI quiz. Course = multi-step academy + admin question bank. */
export type ModuleKind = "compliance" | "course";

export const MODULE_KIND_LABELS: Record<ModuleKind, string> = {
  compliance: "Compliance",
  course: "Course",
};

export function normalizeModuleKind(value: unknown): ModuleKind {
  return value === "course" ? "course" : "compliance";
}

/** DB flag plus course-* module ids created by the course builder. */
export function resolveModuleKind(
  moduleKind: unknown,
  moduleId?: string,
): ModuleKind {
  if (moduleKind === "course") return "course";
  if (moduleId && String(moduleId).startsWith("course-")) return "course";
  return "compliance";
}
