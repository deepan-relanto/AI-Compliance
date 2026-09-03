import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAttributedBatchId } from "./batch-attribution";

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
