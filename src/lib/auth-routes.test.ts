import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePostLoginPath } from "./auth-routes";

describe("resolvePostLoginPath", () => {
  it("keeps a training callback for an admin so they can take assigned courses", () => {
    assert.equal(
      resolvePostLoginPath("/training/module_1?forEmail=deepan.s%40relanto.ai", "admin", "deepan.s@relanto.ai"),
      "/training/module_1?forEmail=deepan.s%40relanto.ai",
    );
    assert.equal(resolvePostLoginPath("/training/abc", "admin"), "/training/abc");
    assert.equal(resolvePostLoginPath("/dashboard", "admin"), "/dashboard");
  });

  it("still sends learners away from /admin and defaults admins to /admin", () => {
    assert.equal(resolvePostLoginPath("/admin/batches", "user"), "/dashboard");
    assert.equal(resolvePostLoginPath(null, "admin"), "/admin");
    assert.equal(resolvePostLoginPath(null, "user"), "/dashboard");
  });
});
