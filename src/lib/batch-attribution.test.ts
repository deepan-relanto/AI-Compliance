import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  moduleVisibleOnBatch,
  resolveAttributedBatchId,
} from "./batch-attribution";

describe("resolveAttributedBatchId", () => {
  it("keeps the stored batch when that batch still has the module assigned", () => {
    assert.equal(
      resolveAttributedBatchId({
        storedBatchId: "hyderabad",
        storedBatchHasAssignment: true,
        membershipAssignedBatchIds: ["planning"],
      }),
      "hyderabad",
    );
  });

  it("reattributes to the assigned membership when the stored batch does not own the module", () => {
    assert.equal(
      resolveAttributedBatchId({
        storedBatchId: "hyderabad",
        storedBatchHasAssignment: false,
        membershipAssignedBatchIds: ["planning"],
      }),
      "planning",
    );
  });

  it("uses assignment membership when the stored batch is missing", () => {
    assert.equal(
      resolveAttributedBatchId({
        storedBatchId: null,
        storedBatchHasAssignment: false,
        membershipAssignedBatchIds: ["planning", "other"],
      }),
      "planning",
    );
  });

  it("falls back to the stored batch when nothing is currently assigned", () => {
    assert.equal(
      resolveAttributedBatchId({
        storedBatchId: "hyderabad",
        storedBatchHasAssignment: false,
        membershipAssignedBatchIds: [],
      }),
      "hyderabad",
    );
  });
});

describe("moduleVisibleOnBatch", () => {
  it("shows currently assigned modules", () => {
    assert.equal(
      moduleVisibleOnBatch({
        currentlyAssigned: true,
        hasInviteForBatch: false,
        hasProgressOnBatch: false,
        assignedToOtherBatch: false,
      }),
      true,
    );
  });

  it("shows previously invited modules after republish moved the junction", () => {
    assert.equal(
      moduleVisibleOnBatch({
        currentlyAssigned: false,
        hasInviteForBatch: true,
        hasProgressOnBatch: true,
        assignedToOtherBatch: true,
      }),
      true,
    );
  });

  it("hides mis-stamped progress when another batch owns the assignment and there was no invite", () => {
    assert.equal(
      moduleVisibleOnBatch({
        currentlyAssigned: false,
        hasInviteForBatch: false,
        hasProgressOnBatch: true,
        assignedToOtherBatch: true,
      }),
      false,
    );
  });

  it("shows orphan progress when the module is not assigned elsewhere", () => {
    assert.equal(
      moduleVisibleOnBatch({
        currentlyAssigned: false,
        hasInviteForBatch: false,
        hasProgressOnBatch: true,
        assignedToOtherBatch: false,
      }),
      true,
    );
  });
});
