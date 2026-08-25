import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapAdminUserToEmployeeRecord } from "./admin-employee-record";

describe("mapAdminUserToEmployeeRecord", () => {
  it("turns an admin-only user into a picker row with an admin flag", () => {
    const row = mapAdminUserToEmployeeRecord({
      id: "user-1",
      email: "  Deepan.S@Relanto.ai ",
      displayName: "Deepan",
      batchId: null,
      batchLabel: null,
    });
    assert.equal(row.workEmail, "deepan.s@relanto.ai");
    assert.equal(row.name, "Deepan");
    assert.equal(row.department, "Admin");
    assert.equal(row.jobTitle, "Admin");
    assert.equal(row.isAdmin, true);
    assert.equal(row.employeeNumber, "");
    assert.equal(row.batchId, null);
  });

  it("falls back to the email local-part when display name is missing", () => {
    const row = mapAdminUserToEmployeeRecord({
      id: "user-2",
      email: "anumeha.goyal@relanto.ai",
    });
    assert.equal(row.name, "anumeha.goyal");
    assert.equal(row.isAdmin, true);
  });
});
