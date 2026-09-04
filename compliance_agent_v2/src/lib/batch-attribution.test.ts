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
        hasAttributedProgress: false,
      }),
      true,
    );
  });

  it("shows previously invited modules after republish moved the junction", () => {
    assert.equal(
      moduleVisibleOnBatch({
        currentlyAssigned: false,
        hasInviteForBatch: true,
        hasAttributedProgress: false,
      }),
      true,
    );
  });

  it("shows modules with progress attributed to this batch", () => {
    assert.equal(
      moduleVisibleOnBatch({
        currentlyAssigned: false,
        hasInviteForBatch: false,
        hasAttributedProgress: true,
      }),
      true,
    );
  });

  it("hides modules with no assignment, invite, or attributed progress", () => {
    assert.equal(
      moduleVisibleOnBatch({
        currentlyAssigned: false,
        hasInviteForBatch: false,
        hasAttributedProgress: false,
      }),
      false,
    );
  });
});
