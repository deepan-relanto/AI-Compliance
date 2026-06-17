import type { ModuleKind } from "@/lib/module-kind";

export interface BatchAssessmentResult {
  moduleId: string;
  moduleTitle: string;
  status: string;
  scorePercent: number | null;
  mcqCorrect: number;
  mcqTotal: number;
  retakeCount: number;
  completedAt: string | null;
  updatedAt: string | null;
  lastAccessedAt: string | null;
}

export interface BatchLearnerPerformance {
  email: string;
  displayName: string;
  assessments: BatchAssessmentResult[];
}

export interface BatchPerformancePayload {
  track: ModuleKind;
  batch: {
    id: string;
    label: string;
    description: string;
    memberCount: number;
  };
  summary: {
    modulesAssigned: number;
    learnersStarted: number;
    completed: number;
    inProgress: number;
    avgScore: number | null;
    passRate: number | null;
    compliance: number;
  };
  modules: { id: string; title: string }[];
  learners: BatchLearnerPerformance[];
  generatedAt: string;
}
