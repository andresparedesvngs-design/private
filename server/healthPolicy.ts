export type SessionHealthStatus =
  | "unknown"
  | "healthy"
  | "warning"
  | "risky"
  | "cooldown"
  | "blocked";

export type SessionRecentStats = {
  sent24h: number;
  delivered24h: number;
  read24h: number;
  failed24h: number;
};

export type SessionSendLimits = {
  tokensPerMinute: number;
  bucketSize: number;
  dailyMax: number;
  hourlyMax: number;
};

export type SessionCountersWindow = {
  dayCount: number;
  dayStart: Date | null;
  hourCount: number;
  hourStart: Date | null;
};

export type ComputeHealthOptions = {
  forceCooldown?: boolean;
  strikeReason?: string;
  now?: Date;
};

export type HealthComputationResult = {
  healthStatus: SessionHealthStatus;
  healthScore: number;
  healthReason: string;
  healthUpdatedAt: Date;
  cooldownUntil: Date | null;
  strikeCount: number;
  lastStrikeAt: Date | null;
  lastStrikeReason: string | null;
};

export type PolicyAdjustResult = {
  changed: boolean;
  sendLimits: SessionSendLimits;
  lastLimitUpdateAt: Date | null;
  limitChangeReason: string | null;
};

const HEALTH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const HEALTH_RECENT_AUTH_WINDOW_MS = 6 * 60 * 60 * 1000;
const HEALTH_DISCONNECT_WINDOW_MS = 24 * 60 * 60 * 1000;
const HEALTH_RESET_STUCK_WINDOW_MS = 20 * 60 * 1000;
const HEALTH_STRIKE_DEDUP_WINDOW_MS = 60 * 60 * 1000;
const BLOCK_AFTER_STRIKES = 5;
const HEALTHY_LIMIT_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const DEFAULT_SEND_LIMITS: SessionSendLimits = {
  tokensPerMinute: 6,
  bucketSize: 10,
  dailyMax: 200,
  hourlyMax: 60,
};

const MAX_SEND_LIMITS: SessionSendLimits = {
  tokensPerMinute: 30,
  bucketSize: 60,
  dailyMax: 1200,
  hourlyMax: 300,
};

export const HOUR_WINDOW_MS = 60 * 60 * 1000;
export const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const hasStatus = (value: unknown, expected: string[]) => {
  const normalized = String(value ?? "").toLowerCase();
  return expected.includes(normalized);
};

export const normalizeSendLimits = (
  limits: Partial<SessionSendLimits> | null | undefined
): SessionSendLimits => {
  const normalized: SessionSendLimits = {
    tokensPerMinute: clamp(
      Math.floor(toNumber(limits?.tokensPerMinute, DEFAULT_SEND_LIMITS.tokensPerMinute)),
      0,
      MAX_SEND_LIMITS.tokensPerMinute
    ),
    bucketSize: clamp(
      Math.floor(toNumber(limits?.bucketSize, DEFAULT_SEND_LIMITS.bucketSize)),
      0,
      MAX_SEND_LIMITS.bucketSize
    ),
    dailyMax: clamp(
      Math.floor(toNumber(limits?.dailyMax, DEFAULT_SEND_LIMITS.dailyMax)),
      0,
      MAX_SEND_LIMITS.dailyMax
    ),
    hourlyMax: clamp(
      Math.floor(toNumber(limits?.hourlyMax, DEFAULT_SEND_LIMITS.hourlyMax)),
      0,
      MAX_SEND_LIMITS.hourlyMax
    ),
  };

  if (normalized.dailyMax === 0) {
    normalized.hourlyMax = 0;
  } else if (normalized.hourlyMax > normalized.dailyMax) {
    normalized.hourlyMax = normalized.dailyMax;
  }

  if (normalized.tokensPerMinute === 0) {
    normalized.bucketSize = 0;
  } else if (normalized.bucketSize === 0) {
    normalized.bucketSize = Math.min(
      normalized.tokensPerMinute,
      DEFAULT_SEND_LIMITS.bucketSize
    );
  }

  return normalized;
};

export const normalizeCountersWindow = (
  countersWindow: Partial<SessionCountersWindow> | null | undefined,
  now: Date = new Date()
): { value: SessionCountersWindow; changed: boolean } => {
  let changed = false;
  const nowMs = now.getTime();

  let dayStart = parseDate(countersWindow?.dayStart);
  let hourStart = parseDate(countersWindow?.hourStart);
  let dayCount = Math.max(0, Math.floor(toNumber(countersWindow?.dayCount, 0)));
  let hourCount = Math.max(0, Math.floor(toNumber(countersWindow?.hourCount, 0)));

  if (!dayStart) {
    dayStart = now;
    dayCount = 0;
    changed = true;
  } else if (nowMs - dayStart.getTime() >= DAY_WINDOW_MS) {
    dayStart = now;
    dayCount = 0;
    changed = true;
  }

  if (!hourStart) {
    hourStart = now;
    hourCount = 0;
    changed = true;
  } else if (nowMs - hourStart.getTime() >= HOUR_WINDOW_MS) {
    hourStart = now;
    hourCount = 0;
    changed = true;
  }

  if (dayCount !== toNumber(countersWindow?.dayCount, 0)) {
    changed = true;
  }
  if (hourCount !== toNumber(countersWindow?.hourCount, 0)) {
    changed = true;
  }

  return {
    value: {
      dayCount,
      dayStart,
      hourCount,
      hourStart,
    },
    changed,
  };
};

export const getWindowRetryAfterMs = (
  countersWindow: Partial<SessionCountersWindow> | null | undefined,
  scope: "day" | "hour",
  now: Date = new Date()
): number => {
  const start =
    scope === "day"
      ? parseDate(countersWindow?.dayStart)
      : parseDate(countersWindow?.hourStart);
  if (!start) return 0;
  const windowMs = scope === "day" ? DAY_WINDOW_MS : HOUR_WINDOW_MS;
  return Math.max(0, start.getTime() + windowMs - now.getTime());
};

export const computeSessionHealth = (
  session: any,
  recentStats: SessionRecentStats,
  options?: ComputeHealthOptions
): HealthComputationResult => {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();

  const sessionStatus = String(session?.status ?? "unknown").toLowerCase();
  const disconnectCount = toNumber(session?.disconnectCount, 0);
  const authFailureCount = toNumber(session?.authFailureCount, 0);
  const reconnectCount = toNumber(session?.reconnectCount, 0);
  const resetAuthCount = toNumber(session?.resetAuthCount, 0);

  const lastDisconnectAt = parseDate(session?.lastDisconnectAt);
  const lastAuthFailureAt = parseDate(session?.lastAuthFailureAt);
  const lastResetAuthAt = parseDate(session?.lastResetAuthAt);
  const lastStrikeAt = parseDate(session?.lastStrikeAt);

  let cooldownUntil = parseDate(session?.cooldownUntil);
  let strikeCount = toNumber(session?.strikeCount, 0);
  let lastStrikeReason = session?.lastStrikeReason
    ? String(session.lastStrikeReason)
    : null;

  const recentAuthFailure =
    !!lastAuthFailureAt &&
    nowMs - lastAuthFailureAt.getTime() <= HEALTH_RECENT_AUTH_WINDOW_MS;
  const recentDisconnect =
    !!lastDisconnectAt &&
    nowMs - lastDisconnectAt.getTime() <= HEALTH_DISCONNECT_WINDOW_MS;
  const recentReset =
    !!lastResetAuthAt &&
    nowMs - lastResetAuthAt.getTime() <= HEALTH_RESET_STUCK_WINDOW_MS;

  const authFailurePattern =
    recentAuthFailure && (authFailureCount >= 2 || sessionStatus === "auth_failed");
  const resetStuckPattern =
    recentReset &&
    resetAuthCount >= 1 &&
    hasStatus(sessionStatus, ["initializing", "reconnecting", "auth_failed"]);
  const disconnectBurst = recentDisconnect && disconnectCount >= 3;

  const sent24h = Math.max(0, Math.floor(toNumber(recentStats.sent24h, 0)));
  const delivered24h = Math.max(0, Math.floor(toNumber(recentStats.delivered24h, 0)));
  const read24h = Math.max(0, Math.floor(toNumber(recentStats.read24h, 0)));
  const failed24h = Math.max(0, Math.floor(toNumber(recentStats.failed24h, 0)));

  const failedRatio = sent24h > 0 ? failed24h / sent24h : 0;
  const readRatio = delivered24h > 0 ? read24h / delivered24h : 0;
  const deliveryFailuresHigh = (sent24h >= 20 && failedRatio >= 0.35) || failed24h >= 15;
  const readRatioLow = delivered24h >= 15 && readRatio < 0.2;

  const shouldTriggerCooldown = Boolean(
    options?.forceCooldown || authFailurePattern || resetStuckPattern
  );
  if (shouldTriggerCooldown) {
    const strikeReason =
      options?.strikeReason ??
      (resetStuckPattern ? "reset_auth_timeout" : "auth_failure_pattern");
    const duplicatedStrike =
      !!lastStrikeAt &&
      lastStrikeReason === strikeReason &&
      nowMs - lastStrikeAt.getTime() <= HEALTH_STRIKE_DEDUP_WINDOW_MS;
    if (!duplicatedStrike) {
      strikeCount += 1;
      lastStrikeReason = strikeReason;
    }
    const nextCooldown = new Date(nowMs + HEALTH_COOLDOWN_MS);
    if (!cooldownUntil || cooldownUntil.getTime() < nextCooldown.getTime()) {
      cooldownUntil = nextCooldown;
    }
  } else if (cooldownUntil && cooldownUntil.getTime() <= nowMs) {
    cooldownUntil = null;
  }

  const blocked = strikeCount >= BLOCK_AFTER_STRIKES;
  const cooldownActive = !!cooldownUntil && cooldownUntil.getTime() > nowMs;

  let healthStatus: SessionHealthStatus = "unknown";
  let healthScore = 0;
  let healthReason = "No health signals available";

  if (blocked) {
    healthStatus = "blocked";
    healthScore = 0;
    healthReason = "Blocked by repeated strike pattern";
  } else if (cooldownActive) {
    healthStatus = "cooldown";
    healthScore = 20;
    healthReason = "Temporary 24h cooldown active";
  } else if (
    sessionStatus === "connected" &&
    !deliveryFailuresHigh &&
    !readRatioLow &&
    !disconnectBurst &&
    !authFailurePattern
  ) {
    healthStatus = "healthy";
    healthScore = 90;
    healthReason = "Connected with stable metrics";
  } else if (
    deliveryFailuresHigh ||
    disconnectBurst ||
    authFailurePattern ||
    reconnectCount >= 5
  ) {
    healthStatus = "risky";
    healthScore = 35;
    healthReason = "High failure/disconnect trend detected";
  } else if (
    hasStatus(sessionStatus, ["reconnecting", "initializing", "authenticated"]) ||
    readRatioLow
  ) {
    healthStatus = "warning";
    healthScore = 60;
    healthReason = "Session requires manual observation";
  } else if (hasStatus(sessionStatus, ["disconnected", "auth_failed"])) {
    healthStatus = "warning";
    healthScore = 50;
    healthReason = "Session is not connected";
  }

  return {
    healthStatus,
    healthScore,
    healthReason,
    healthUpdatedAt: now,
    cooldownUntil,
    strikeCount,
    lastStrikeAt:
      shouldTriggerCooldown && (!lastStrikeAt || lastStrikeAt.getTime() !== nowMs)
        ? now
        : lastStrikeAt,
    lastStrikeReason,
  };
};

export const policyAdjustLimits = (
  session: any,
  options?: { now?: Date }
): PolicyAdjustResult => {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const healthStatus = String(session?.healthStatus ?? "unknown").toLowerCase();
  const cooldownUntil = parseDate(session?.cooldownUntil);
  const cooldownActive = !!cooldownUntil && cooldownUntil.getTime() > nowMs;

  const current = normalizeSendLimits(session?.sendLimits);
  const currentSnapshot = JSON.stringify(current);

  let target: SessionSendLimits = { ...current };
  let reason: string | null = null;

  if (healthStatus === "blocked" || healthStatus === "cooldown" || cooldownActive) {
    target = {
      tokensPerMinute: 0,
      bucketSize: 0,
      dailyMax: 0,
      hourlyMax: 0,
    };
    reason = healthStatus === "blocked" ? "blocked_policy" : "cooldown_policy";
  } else if (healthStatus === "risky") {
    const seed = current.tokensPerMinute > 0 ? current : DEFAULT_SEND_LIMITS;
    target = normalizeSendLimits({
      tokensPerMinute: Math.floor(seed.tokensPerMinute * 0.5),
      bucketSize: Math.floor(seed.bucketSize * 0.6),
      dailyMax: Math.floor(seed.dailyMax * 0.5),
      hourlyMax: Math.floor(seed.hourlyMax * 0.5),
    });
    reason = "risky_reduce";
  } else if (healthStatus === "warning" || healthStatus === "unknown") {
    if (
      current.tokensPerMinute === 0 ||
      current.bucketSize === 0 ||
      current.dailyMax === 0 ||
      current.hourlyMax === 0
    ) {
      target = { ...DEFAULT_SEND_LIMITS };
      reason = "warning_restore_defaults";
    }
  } else if (healthStatus === "healthy") {
    const lastUpdateAt = parseDate(session?.lastLimitUpdateAt);
    const canIncrease =
      !lastUpdateAt || nowMs - lastUpdateAt.getTime() >= HEALTHY_LIMIT_UPDATE_WINDOW_MS;
    if (canIncrease) {
      const seed = current.tokensPerMinute > 0 ? current : DEFAULT_SEND_LIMITS;
      target = normalizeSendLimits({
        tokensPerMinute: Math.ceil(seed.tokensPerMinute * 1.15),
        bucketSize: Math.ceil(seed.bucketSize * 1.15),
        dailyMax: Math.ceil(seed.dailyMax * 1.15),
        hourlyMax: Math.ceil(seed.hourlyMax * 1.15),
      });
      reason = "healthy_increase";
    }
  }

  const changed = JSON.stringify(target) !== currentSnapshot;
  return {
    changed,
    sendLimits: target,
    lastLimitUpdateAt: changed ? now : parseDate(session?.lastLimitUpdateAt),
    limitChangeReason: changed
      ? reason
      : session?.limitChangeReason
      ? String(session.limitChangeReason)
      : null,
  };
};
