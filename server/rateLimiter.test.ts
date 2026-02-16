import { describe, expect, it } from "vitest";
import { SessionTokenBucketLimiter } from "./rateLimiter";

describe("SessionTokenBucketLimiter", () => {
  it("consumes tokens up to burst and refills over time", () => {
    let now = 0;
    const limiter = new SessionTokenBucketLimiter(() => now);

    limiter.configureSession("s1", { tokensPerMinute: 60, bucketSize: 10 }); // ~1 token/sec

    for (let i = 0; i < 10; i += 1) {
      const res = limiter.tryConsume("s1");
      expect(res.allowed).toBe(true);
    }

    const blocked = limiter.tryConsume("s1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);

    now += 2000; // +2 tokens
    const ok = limiter.tryConsume("s1");
    expect(ok.allowed).toBe(true);
  });

  it("blocks when session is not configured", () => {
    const limiter = new SessionTokenBucketLimiter(() => 0);
    const res = limiter.tryConsume("missing");
    expect(res.allowed).toBe(false);
    expect(res.retryAfterMs).toBeGreaterThan(0);
  });
});

