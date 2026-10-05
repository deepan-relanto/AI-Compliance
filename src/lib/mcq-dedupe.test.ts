import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assignedComplianceMcqCount,
  gateCountForSlides,
} from "./mcq-dedupe";

describe("gateCountForSlides", () => {
  it("counts one gate every 3 slides from slide 3", () => {
    assert.equal(gateCountForSlides(22), 7);
    assert.equal(gateCountForSlides(21), 7);
    assert.equal(gateCountForSlides(3), 1);
  });
});

describe("assignedComplianceMcqCount", () => {
  it("caps the question bank to the slide gate count", () => {
    assert.equal(assignedComplianceMcqCount(22, 10), 7);
    assert.equal(assignedComplianceMcqCount(22, 5), 5);
    assert.equal(assignedComplianceMcqCount(22, 0), 0);
  });
});
