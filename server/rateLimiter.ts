export type SendLimitConfig = {
  tokensPerMinute: number;
  bucketSize: number;
};

export type TokenConsumeResult = {
  allowed: boolean;
  retryAfterMs: number;
};

type BucketState = {
  tokens: number;
  lastRefillAt: number;
  tokensPerMinute: number;
  bucketSize: number;
};

const MIN_RETRY_AFTER_MS = 250;
const FALLBACK_RETRY_AFTER_MS = 60_000;

const toSafeNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const clampNonNegative = (value: number): number => Math.max(0, value);

export class SessionTokenBucketLimiter {
  private buckets = new Map<string, BucketState>();
  private readonly nowProvider: () => number;

  constructor(nowProvider?: () => number) {
    this.nowProvider = nowProvider ?? (() => Date.now());
  }

  private getNow(): number {
    return this.nowProvider();
  }

  private normalizeConfig(config: SendLimitConfig): SendLimitConfig {
    return {
      tokensPerMinute: clampNonNegative(
        Math.floor(toSafeNumber(config.tokensPerMinute, 0))
      ),
      bucketSize: clampNonNegative(Math.floor(toSafeNumber(config.bucketSize, 0))),
    };
  }

  configureSession(sessionId: string, config: SendLimitConfig): void {
    if (!sessionId) return;

    const now = this.getNow();
    const normalized = this.normalizeConfig(config);
    const existing = this.buckets.get(sessionId);

    if (!existing) {
      this.buckets.set(sessionId, {
        tokens: normalized.bucketSize,
        lastRefillAt: now,
        tokensPerMinute: normalized.tokensPerMinute,
        bucketSize: normalized.bucketSize,
      });
      return;
    }

    this.refillBucket(existing, now);
    existing.tokensPerMinute = normalized.tokensPerMinute;
    existing.bucketSize = normalized.bucketSize;
    existing.tokens = Math.min(existing.tokens, normalized.bucketSize);
    existing.lastRefillAt = now;
  }

  private refillBucket(state: BucketState, now: number): void {
    if (now <= state.lastRefillAt) {
      return;
    }

    if (state.tokensPerMinute <= 0 || state.bucketSize <= 0) {
      state.tokens = 0;
      state.lastRefillAt = now;
      return;
    }

    const elapsedMs = now - state.lastRefillAt;
    const refill = (elapsedMs * state.tokensPerMinute) / 60_000;
    state.tokens = Math.min(state.bucketSize, state.tokens + refill);
    state.lastRefillAt = now;
  }

  tryConsume(sessionId: string, tokens = 1): TokenConsumeResult {
    if (!sessionId) {
      return { allowed: false, retryAfterMs: FALLBACK_RETRY_AFTER_MS };
    }
    const tokensNeeded = clampNonNegative(toSafeNumber(tokens, 1));
    if (tokensNeeded <= 0) {
      return { allowed: true, retryAfterMs: 0 };
    }

    const state = this.buckets.get(sessionId);
    if (!state) {
      return { allowed: false, retryAfterMs: FALLBACK_RETRY_AFTER_MS };
    }

    const now = this.getNow();
    this.refillBucket(state, now);

    if (state.tokensPerMinute <= 0 || state.bucketSize <= 0) {
      return { allowed: false, retryAfterMs: FALLBACK_RETRY_AFTER_MS };
    }

    if (state.tokens >= tokensNeeded) {
      state.tokens -= tokensNeeded;
      return { allowed: true, retryAfterMs: 0 };
    }

    const missingTokens = tokensNeeded - state.tokens;
    const retryAfterMs = Math.max(
      MIN_RETRY_AFTER_MS,
      Math.ceil((missingTokens * 60_000) / state.tokensPerMinute)
    );

    return {
      allowed: false,
      retryAfterMs,
    };
  }

  resetSession(sessionId: string): void {
    this.buckets.delete(sessionId);
  }

  clear(): void {
    this.buckets.clear();
  }
}

export const rateLimiter = new SessionTokenBucketLimiter();
