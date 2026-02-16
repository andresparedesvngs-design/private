import { describe, expect, it } from "vitest";
import {
  DAY_WINDOW_MS,
  HOUR_WINDOW_MS,
  computeSessionHealth,
  normalizeCountersWindow,
  policyAdjustLimits,
} from "./healthPolicy";

describe("healthPolicy", () => {
  it("normalizes counters window and resets when windows expire", () => {
    const now = new Date("2026-02-12T12:00:00.000Z");
    const counters = {
      dayCount: 99,
      dayStart: new Date(now.getTime() - DAY_WINDOW_MS - 1000),
      hourCount: 10,
      hourStart: new Date(now.getTime() - HOUR_WINDOW_MS - 1000),
    };

    const normalized = normalizeCountersWindow(counters, now);
    expect(normalized.changed).toBe(true);
    expect(normalized.value.dayCount).toBe(0);
    expect(normalized.value.hourCount).toBe(0);
    expect(normalized.value.dayStart?.toISOString()).toBe(now.toISOString());
    expect(normalized.value.hourStart?.toISOString()).toBe(now.toISOString());
  });

  it("sets cooldown when auth_failure pattern is detected", () => {
    const now = new Date("2026-02-12T12:00:00.000Z");
    const session: any = {
      status: "auth_failed",
      authFailureCount: 2,
      lastAuthFailureAt: new Date(now.getTime() - 60_000),
      strikeCount: 0,
      lastStrikeAt: null,
      lastStrikeReason: null,
      cooldownUntil: null,
    };

    const result = computeSessionHealth(
      session,
      { sent24h: 0, delivered24h: 0, read24h: 0, failed24h: 0 },
      { now }
    );

    expect(result.healthStatus).toBe("cooldown");
    expect(result.cooldownUntil).not.toBeNull();
    expect(result.strikeCount).toBeGreaterThanOrEqual(1);
  });

  it("reduces limits on risky and zeros them on cooldown", () => {
    const now = new Date("2026-02-12T12:00:00.000Z");
    const base: any = {
      sendLimits: { tokensPerMinute: 10, bucketSize: 10, dailyMax: 100, hourlyMax: 50 },
      lastLimitUpdateAt: null,
      limitChangeReason: null,
      cooldownUntil: null,
    };

    const risky = policyAdjustLimits({ ...base, healthStatus: "risky" }, { now });
    expect(risky.sendLimits.tokensPerMinute).toBeLessThanOrEqual(10);
    expect(risky.sendLimits.dailyMax).toBeLessThanOrEqual(100);

    const cooldown = policyAdjustLimits(
      { ...base, healthStatus: "cooldown", cooldownUntil: new Date(now.getTime() + 3600_000) },
      { now }
    );
    expect(cooldown.sendLimits.tokensPerMinute).toBe(0);
    expect(cooldown.sendLimits.dailyMax).toBe(0);
  });
});

