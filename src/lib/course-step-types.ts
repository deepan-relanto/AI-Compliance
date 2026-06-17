/** Ordered steps in a mandatory course bundle. */
export type CourseStepType =
  | "pdf"
  | "video"
  | "mindmap"
  | "infographic"
  | "quiz";

export const COURSE_STEP_ORDER: CourseStepType[] = [
  "pdf",
  "video",
  "mindmap",
  "infographic",
  "quiz",
];

export const COURSE_STEP_LABELS: Record<CourseStepType, string> = {
  pdf: "PDF guide",
  video: "Training video",
  mindmap: "Interactive mind map",
  infographic: "Infographics",
  quiz: "Assessment quiz",
};

export type CourseStepConfig = {
  assetUrl?: string;
  originalName?: string;
  mimeType?: string;
  pageCount?: number;
  questionCount?: number;
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
