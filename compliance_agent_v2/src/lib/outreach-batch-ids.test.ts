import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseStringIdList,
  resolveOutreachBatchIds,
} from "./outreach-batch-ids";

describe("resolveOutreachBatchIds", () => {
  it("restricts send to the selected batches", () => {
    assert.deepEqual(
      resolveOutreachBatchIds({ batchIds: ["planning_team"] }),
      ["planning_team"],
    );
  });

  it("keeps a single batchId from the batch marks page", () => {
    assert.deepEqual(
      resolveOutreachBatchIds({ batchId: "support_function_batch_2" }),
      ["support_function_batch_2"],
    );
  });

  it("does not expand a Planning assign into every assigned cohort", () => {
    assert.deepEqual(
      resolveOutreachBatchIds({
        batchIds: ["planning_team"],
        batchId: undefined,
      }),
      ["planning_team"],
    );
  });

  it("treats all as unrestricted so first-time publish can mail every selected roster", () => {
    assert.equal(resolveOutreachBatchIds({ batchIds: ["all"] }), null);
    assert.equal(resolveOutreachBatchIds({}), null);
  });
});

describe("parseStringIdList", () => {
  it("keeps trimmed strings and drops everything else", () => {
    assert.deepEqual(
      parseStringIdList([" planning_team ", "", 12, null, "hyderabad_onsite"]),
      ["planning_team", "hyderabad_onsite"],
    );
  });

  it("returns an empty list for non-arrays", () => {
    assert.deepEqual(parseStringIdList(undefined), []);
    assert.deepEqual(parseStringIdList("planning_team"), []);
  });
});
