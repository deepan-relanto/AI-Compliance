import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRateLimit, rateLimitKey } from "./request-rate-limit";

describe("request-rate-limit", () => {
  it("allows requests within the window", () => {
    const key = rateLimitKey("test", "127.0.0.1", "a");
    assert.equal(checkRateLimit(key, 3, 60_000).ok, true);
    assert.equal(checkRateLimit(key, 3, 60_000).ok, true);
    assert.equal(checkRateLimit(key, 3, 60_000).ok, true);
  });

  it("blocks requests above the limit", () => {
    const key = rateLimitKey("test", "127.0.0.2", "b");
    assert.equal(checkRateLimit(key, 2, 60_000).ok, true);
    assert.equal(checkRateLimit(key, 2, 60_000).ok, true);
    const blocked = checkRateLimit(key, 2, 60_000);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.ok(blocked.retryAfterMs > 0);
    }
  });
});
