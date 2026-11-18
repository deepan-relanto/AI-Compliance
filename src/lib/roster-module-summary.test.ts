import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeRosterModule } from "./roster-module-summary";

describe("summarizeRosterModule", () => {
  it("keeps started + notStarted equal to the live roster", () => {
    const summary = summarizeRosterModule({
      memberCount: 22,
      assessments: [
        ...Array.from({ length: 12 }, () => ({
          status: "completed",
          scorePercent: 90,
          mcqTotal: 10,
        })),
        ...Array.from({ length: 10 }, () => ({ status: "not_started" })),
      ],
    });
    assert.equal(summary.started, 12);
    assert.equal(summary.completed, 12);
    assert.equal(summary.notStarted, 10);
    assert.equal(summary.started + summary.notStarted, 22);
    assert.equal(22 - summary.completed, summary.notStarted);
  });

  it("does not let missing rows or short assessment lists break the roster total", () => {
    const summary = summarizeRosterModule({
      memberCount: 22,
      assessments: Array.from({ length: 12 }, () => ({
        status: "completed",
        scorePercent: 80,
        mcqTotal: 10,
      })),
    });
    assert.equal(summary.completed, 12);
    assert.equal(summary.notStarted, 10);
    assert.equal(summary.started + summary.notStarted, 22);
  });
});
