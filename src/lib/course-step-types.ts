/** Ordered steps in a mandatory course bundle. */
export type CourseStepType =
  | "pdf"
  | "scenarios"
  | "video"
  | "mindmap"
  | "infographic"
  | "quiz";

export const COURSE_STEP_ORDER: CourseStepType[] = [
  "pdf",
  "scenarios",
  "video",
  "mindmap",
  "infographic",
  "quiz",
];

export const COURSE_STEP_LABELS: Record<CourseStepType, string> = {
  pdf: "Interactive HTML lesson",
  scenarios: "Scenario-based learning",
  video: "Training video",
  mindmap: "Interactive HTML mind map",
  infographic: "Infographics",
  quiz: "Assessment quiz",
};

/** True when a course step asset should be rendered as embedded HTML. */
export function isHtmlCourseAsset(
  mimeType?: string | null,
  assetUrl?: string | null,
  originalName?: string | null,
): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("html")) return true;
  const url = (assetUrl ?? "").toLowerCase();
  if (url.endsWith(".html") || url.endsWith(".htm")) return true;
  const name = (originalName ?? "").toLowerCase();
  return name.endsWith(".html") || name.endsWith(".htm");
}

export type CourseStepConfig = {
  assetUrl?: string;
  originalName?: string;
  mimeType?: string;
  pageCount?: number;
  questionCount?: number;
  /** Byte size of the HTML/media asset — used to cache-bust iframe URLs. */
  sizeBytes?: number;
  /** Bumped on every content-kit sync so learners never see stale HTML. */
  contentRevision?: number;
};

export type CourseStepRow = {
  stepType: CourseStepType;
  stepOrder: number;
  title: string;
  config: CourseStepConfig;
};

export type CourseLibraryItem = {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  mcqCount: number;
  stepCount: number;
  batches: { id: string; label: string }[];
  canReuse: boolean;
  createdAt: string;
};
