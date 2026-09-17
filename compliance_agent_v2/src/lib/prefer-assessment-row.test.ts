import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPreferredAssessment,
  uniqueAssessmentsByModule,
} from "./prefer-assessment-row";

function row(
  partial: Partial<{
    moduleId: string;
    status: string;
    scorePercent: number | null;
    completedAt: string | null;
    lastAccessedAt: string | null;
    updatedAt: string | null;
    startedAt: string | null;
  }>,
) {
  return {
    moduleId: "ai-basics",
    status: "completed",
    scorePercent: 100,
    completedAt: "2026-09-03T07:04:36.897Z",
    lastAccessedAt: "2026-09-03T07:05:18.715Z",
    updatedAt: "2026-09-03T07:05:18.715Z",
    startedAt: "2026-09-03T06:51:14.997Z",
    ...partial,
  };
}

describe("prefer-assessment-row", () => {
  it("keeps completed over a twin in_progress stamp", () => {
    assert.equal(
      isPreferredAssessment(
        row({ status: "completed" }),
        row({ status: "in_progress", scorePercent: null, completedAt: null }),
      ),
      true,
    );
  });

  it("collapses two completed dual-batch rows into one", () => {
    const unique = uniqueAssessmentsByModule([
      row({ startedAt: "2026-09-03T06:51:14.997Z" }),
      row({ startedAt: "2026-09-03T06:51:19.603Z" }),
    ]);
    assert.equal(unique.length, 1);
  });

  it("does not merge different courses for the same person", () => {
    const unique = uniqueAssessmentsByModule([
      row({ moduleId: "ai-basics" }),
      row({ moduleId: "responsible-ai" }),
    ]);
    assert.equal(unique.length, 2);
  });

  it("prefers the higher score when both dual-batch attempts completed", () => {
    assert.equal(
      isPreferredAssessment(
        row({ scorePercent: 100 }),
        row({ scorePercent: 80 }),
      ),
      true,
    );
  });
});
