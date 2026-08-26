import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessAppPath,
  canOpenAdminPages,
  canOpenLearnerPages,
  isRosterMemberRole,
  LEARNER_PAGE_ROLES,
  preferredClientRole,
} from "./access-policy";

describe("access-policy", () => {
  it("lets admins and learners open dashboard and training", () => {
    assert.equal(canOpenLearnerPages("admin"), true);
    assert.equal(canOpenLearnerPages("user"), true);
    assert.equal(canAccessAppPath("/dashboard", "admin"), true);
    assert.equal(canAccessAppPath("/training/module_1", "admin"), true);
    assert.equal(canAccessAppPath("/dashboard", "user"), true);
    assert.equal(canAccessAppPath("/training/module_1", "user"), true);
  });

  it("blocks learners from the admin console", () => {
    assert.equal(canOpenAdminPages("user"), false);
    assert.equal(canAccessAppPath("/admin", "user"), false);
    assert.equal(canAccessAppPath("/admin/batches", "user"), false);
    assert.equal(canAccessAppPath("/admin", "admin"), true);
  });

  it("never demotes an admin when merging client role sources", () => {
    assert.equal(preferredClientRole("user", "admin"), "admin");
    assert.equal(preferredClientRole(undefined, "admin", "user"), "admin");
    assert.equal(preferredClientRole("user", undefined, null), "user");
  });

  it("treats admin as a roster member role for outreach", () => {
    assert.equal(isRosterMemberRole("admin"), true);
    assert.equal(isRosterMemberRole("user"), true);
    assert.equal(isRosterMemberRole("guest"), false);
    assert.deepEqual(LEARNER_PAGE_ROLES, ["user", "admin"]);
  });
});
