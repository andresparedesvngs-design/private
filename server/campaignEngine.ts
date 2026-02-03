import { storage } from './storage';
import { whatsappManager } from './whatsappManager';
import { smsManager } from "./smsManager";
import type { Campaign, Pool, Debtor, GsmPool, GsmLine } from '@shared/schema';
import type { Server as SocketServer } from 'socket.io';

type CampaignChannel = "whatsapp" | "sms" | "whatsapp_fallback_sms";

class CampaignEngine {
  private activeCampaigns: Map<string, boolean> = new Map();
  private io?: SocketServer;
  private sendWindowEnabledOverride: boolean | null = null;
  private sendWindowStartOverride: number | null = null;
  private sendWindowEndOverride: number | null = null;
  private campaignPauseEnabledOverride: boolean | null = null;
  private campaignPauseStrategyOverride: "auto" | "fixed" | null = null;
  private campaignPauseTargetPausesOverride: number | null = null;
  private campaignPauseEveryMessagesOverride: number | null = null;
  private campaignPauseMinMessagesOverride: number | null = null;
  private campaignPauseDurationsOverride: number[] | null = null;
  private campaignPauseDurationsModeOverride: "list" | "range" | null = null;
  private campaignPauseApplyWhatsappOverride: boolean | null = null;
  private campaignPauseApplySmsOverride: boolean | null = null;

  setSocketServer(io: SocketServer) {
    this.io = io;
  }

  private parseBooleanEnv(value: string | undefined): boolean | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    return null;
  }

  private parseTimeToMinutes(value: string | undefined): number | null {
    if (!value) return null;
    const trimmed = value.trim();
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  private parsePositiveIntEnv(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }

  private formatMinutes(minutes: number): string {
    const safe = ((minutes % 1440) + 1440) % 1440;
    const hh = Math.floor(safe / 60)
      .toString()
      .padStart(2, "0");
    const mm = Math.floor(safe % 60)
      .toString()
      .padStart(2, "0");
    return `${hh}:${mm}`;
  }

  private parseNumberList(value: string | undefined): number[] | null {
    if (!value) return null;
    const items = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => Math.floor(Number(entry)))
      .filter((entry) => Number.isFinite(entry) && entry > 0);
    if (items.length === 0) return null;
    return Array.from(new Set(items));
  }

  private getSendWindowEnabled(): boolean {
    if (this.sendWindowEnabledOverride !== null) {
      return this.sendWindowEnabledOverride;
    }
    const envValue = this.parseBooleanEnv(process.env.CAMPAIGN_SEND_WINDOW_ENABLED);
    if (envValue !== null) {
      return envValue;
    }
    return true;
  }

  private getSendWindowStartMinutes(): number {
    if (this.sendWindowStartOverride !== null) {
      return this.sendWindowStartOverride;
    }
    const envValue = this.parseTimeToMinutes(process.env.CAMPAIGN_SEND_WINDOW_START);
    return envValue ?? 8 * 60;
  }

  private getSendWindowEndMinutes(): number {
    if (this.sendWindowEndOverride !== null) {
      return this.sendWindowEndOverride;
    }
    const envValue = this.parseTimeToMinutes(process.env.CAMPAIGN_SEND_WINDOW_END);
    return envValue ?? 20 * 60;
  }

  private getSessionCooldownMs(): number {
    const envValue = this.parsePositiveIntEnv(process.env.WHATSAPP_SESSION_COOLDOWN_MS);
    const fallback = 120000;
    const safe = envValue ?? fallback;
    return Math.min(Math.max(safe, 5000), 60 * 60 * 1000);
  }

  private getSessionCooldownAttempts(): number {
    const envValue = this.parsePositiveIntEnv(process.env.WHATSAPP_SESSION_COOLDOWN_ATTEMPTS);
    return envValue ?? 3;
  }

  private getCampaignImmediatePauseOnNoSessions(): boolean {
    const envValue = this.parseBooleanEnv(process.env.CAMPAIGN_IMMEDIATE_PAUSE_NO_SESSIONS);
    if (envValue !== null) {
      return envValue;
    }
    return true;
  }

  private getCampaignPoolAutoAdjust(): boolean {
    const envValue = this.parseBooleanEnv(process.env.CAMPAIGN_POOL_AUTO_ADJUST);
    if (envValue !== null) {
      return envValue;
    }
    return true;
  }

  private getCampaignPoolFallbackAnySession(): boolean {
    const envValue = this.parseBooleanEnv(process.env.CAMPAIGN_POOL_FALLBACK_ANY_SESSION);
    if (envValue !== null) {
      return envValue;
    }
    return true;
  }

  private getCampaignMinPoolSessions(): number {
    const envValue = this.parsePositiveIntEnv(process.env.CAMPAIGN_MIN_POOL_SESSIONS);
    return envValue ?? 1;
  }

  private getCampaignWaitForSessionsMs(): number {
    const envValue = this.parsePositiveIntEnv(process.env.CAMPAIGN_WAIT_FOR_SESSIONS_MS);
    return envValue ?? 5000;
  }

  private getCampaignPauseEnabled(): boolean {
    if (this.campaignPauseEnabledOverride !== null) {
      return this.campaignPauseEnabledOverride;
    }
    const envValue = this.parseBooleanEnv(process.env.CAMPAIGN_PAUSES_ENABLED);
    if (envValue !== null) {
      return envValue;
    }
    return false;
  }

  private getCampaignPauseStrategy(): "auto" | "fixed" {
    if (this.campaignPauseStrategyOverride) {
      return this.campaignPauseStrategyOverride;
    }
    const envValue = (process.env.CAMPAIGN_PAUSES_STRATEGY ?? "").trim().toLowerCase();
    if (envValue === "fixed" || envValue === "auto") {
      return envValue as "auto" | "fixed";
    }
    return "auto";
  }

  private getCampaignPauseTargetPauses(): number {
    if (this.campaignPauseTargetPausesOverride !== null) {
      return this.campaignPauseTargetPausesOverride;
    }
    const envValue = this.parsePositiveIntEnv(process.env.CAMPAIGN_PAUSES_TARGET_PAUSES);
    return envValue ?? 3;
  }

  private getCampaignPauseEveryMessages(): number {
    if (this.campaignPauseEveryMessagesOverride !== null) {
      return this.campaignPauseEveryMessagesOverride;
    }
    const envValue = this.parsePositiveIntEnv(process.env.CAMPAIGN_PAUSES_EVERY_MESSAGES);
    return envValue ?? 30;
  }

  private getCampaignPauseMinMessages(): number {
    if (this.campaignPauseMinMessagesOverride !== null) {
      return this.campaignPauseMinMessagesOverride;
    }
    const envValue = this.parsePositiveIntEnv(process.env.CAMPAIGN_PAUSES_MIN_MESSAGES);
    return envValue ?? 30;
  }

  private getCampaignPauseDurations(): number[] {
    if (this.campaignPauseDurationsOverride?.length) {
      return this.campaignPauseDurationsOverride;
    }
    const envValue = this.parseNumberList(process.env.CAMPAIGN_PAUSES_DURATIONS_MINUTES);
    return envValue?.length ? envValue : [5, 10, 20, 30];
  }

  private getCampaignPauseDurationsMode(): "list" | "range" {
    if (this.campaignPauseDurationsModeOverride) {
      return this.campaignPauseDurationsModeOverride;
    }
    const envValue = (process.env.CAMPAIGN_PAUSES_DURATIONS_MODE ?? "").trim().toLowerCase();
    if (envValue === "range") {
      return "range";
    }
    return "list";
  }

  private getCampaignPauseApplyWhatsapp(): boolean {
    if (this.campaignPauseApplyWhatsappOverride !== null) {
      return this.campaignPauseApplyWhatsappOverride;
    }
    const envValue = this.parseBooleanEnv(process.env.CAMPAIGN_PAUSES_APPLY_WHATSAPP);
    if (envValue !== null) {
      return envValue;
    }
    return true;
  }

  private getCampaignPauseApplySms(): boolean {
    if (this.campaignPauseApplySmsOverride !== null) {
      return this.campaignPauseApplySmsOverride;
    }
    const envValue = this.parseBooleanEnv(process.env.CAMPAIGN_PAUSES_APPLY_SMS);
    if (envValue !== null) {
      return envValue;
    }
    return true;
  }

  getCampaignPauseSettings() {
    const enabled = this.getCampaignPauseEnabled();
    const strategy = this.getCampaignPauseStrategy();
    const targetPauses = this.getCampaignPauseTargetPauses();
    const everyMessages = this.getCampaignPauseEveryMessages();
    const minMessages = this.getCampaignPauseMinMessages();
    const durationsMinutes = this.getCampaignPauseDurations();
    const durationsMode = this.getCampaignPauseDurationsMode();
    const applyToWhatsapp = this.getCampaignPauseApplyWhatsapp();
    const applyToSms = this.getCampaignPauseApplySms();
    const source =
      this.campaignPauseEnabledOverride !== null ||
      this.campaignPauseStrategyOverride !== null ||
      this.campaignPauseTargetPausesOverride !== null ||
      this.campaignPauseEveryMessagesOverride !== null ||
      this.campaignPauseMinMessagesOverride !== null ||
      this.campaignPauseDurationsOverride !== null ||
      this.campaignPauseDurationsModeOverride !== null ||
      this.campaignPauseApplyWhatsappOverride !== null ||
      this.campaignPauseApplySmsOverride !== null
        ? "override"
        : "env";

    return {
      enabled,
      strategy,
      targetPauses,
      everyMessages,
      minMessages,
      durationsMinutes,
      durationsMode,
      applyToWhatsapp,
      applyToSms,
      source,
    };
  }

  setCampaignPauseSettings(settings: {
    enabled?: boolean;
    strategy?: "auto" | "fixed";
    targetPauses?: number;
    everyMessages?: number;
    minMessages?: number;
    durationsMinutes?: number[];
    durationsMode?: "list" | "range";
    applyToWhatsapp?: boolean;
    applyToSms?: boolean;
  }) {
    if (typeof settings.enabled === "boolean") {
      this.campaignPauseEnabledOverride = settings.enabled;
    }

    if (settings.strategy) {
      if (settings.strategy !== "auto" && settings.strategy !== "fixed") {
        throw new Error("Invalid pause strategy");
      }
      this.campaignPauseStrategyOverride = settings.strategy;
    }

    if (settings.targetPauses !== undefined) {
      if (!Number.isFinite(settings.targetPauses) || settings.targetPauses < 0) {
        throw new Error("Invalid target pauses");
      }
      this.campaignPauseTargetPausesOverride = Math.floor(settings.targetPauses);
    }

    if (settings.everyMessages !== undefined) {
      if (!Number.isFinite(settings.everyMessages) || settings.everyMessages <= 0) {
        throw new Error("Invalid pause interval");
      }
      this.campaignPauseEveryMessagesOverride = Math.floor(settings.everyMessages);
    }

    if (settings.minMessages !== undefined) {
      if (!Number.isFinite(settings.minMessages) || settings.minMessages <= 0) {
        throw new Error("Invalid min messages");
      }
      this.campaignPauseMinMessagesOverride = Math.floor(settings.minMessages);
    }

    if (settings.durationsMinutes !== undefined) {
      const cleaned = settings.durationsMinutes
        .map((value) => Math.floor(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (cleaned.length === 0) {
        throw new Error("Invalid pause durations");
      }
      this.campaignPauseDurationsOverride = Array.from(new Set(cleaned));
    }

    if (settings.durationsMode) {
      if (settings.durationsMode !== "list" && settings.durationsMode !== "range") {
        throw new Error("Invalid durations mode");
      }
      this.campaignPauseDurationsModeOverride = settings.durationsMode;
    }

    if (typeof settings.applyToWhatsapp === "boolean") {
      this.campaignPauseApplyWhatsappOverride = settings.applyToWhatsapp;
    }

    if (typeof settings.applyToSms === "boolean") {
      this.campaignPauseApplySmsOverride = settings.applyToSms;
    }
  }

  private getAutoThrottleEnabled(): boolean {
    const envValue = this.parseBooleanEnv(process.env.WHATSAPP_AUTO_THROTTLE_ENABLED);
    if (envValue !== null) {
      return envValue;
    }
    return true;
  }

  private getAutoThrottleTargetSessions(): number {
    const envValue = this.parsePositiveIntEnv(process.env.WHATSAPP_AUTO_THROTTLE_TARGET_SESSIONS);
    return envValue ?? 3;
  }

  private getAutoThrottleMaxMultiplier(): number {
    const envValue = Number(process.env.WHATSAPP_AUTO_THROTTLE_MAX_MULTIPLIER ?? "");
    if (!Number.isFinite(envValue) || envValue <= 1) {
      return 3;
    }
    return Math.min(envValue, 10);
  }

  getSendWindowSettings() {
    const enabled = this.getSendWindowEnabled();
    const startMinutes = this.getSendWindowStartMinutes();
    const endMinutes = this.getSendWindowEndMinutes();
    const source =
      this.sendWindowEnabledOverride !== null ||
      this.sendWindowStartOverride !== null ||
      this.sendWindowEndOverride !== null
        ? "override"
        : "env";

    return {
      enabled,
      startTime: this.formatMinutes(startMinutes),
      endTime: this.formatMinutes(endMinutes),
      source,
    };
  }

  setSendWindowSettings(settings: {
    enabled?: boolean;
    startTime?: string;
    endTime?: string;
  }) {
    if (typeof settings.enabled === "boolean") {
      this.sendWindowEnabledOverride = settings.enabled;
    }

    if (settings.startTime !== undefined) {
      const minutes = this.parseTimeToMinutes(settings.startTime);
      if (minutes === null) {
        throw new Error("Invalid start time");
      }
      this.sendWindowStartOverride = minutes;
    }

    if (settings.endTime !== undefined) {
      const minutes = this.parseTimeToMinutes(settings.endTime);
      if (minutes === null) {
        throw new Error("Invalid end time");
      }
      this.sendWindowEndOverride = minutes;
    }
  }

  private isWithinSendWindow(date: Date = new Date()): boolean {
    if (!this.getSendWindowEnabled()) return true;
    const start = this.getSendWindowStartMinutes();
    const end = this.getSendWindowEndMinutes();
    const minutes = date.getHours() * 60 + date.getMinutes();

    if (start === end) {
      return true;
    }

    if (start < end) {
      return minutes >= start && minutes < end;
    }

    return minutes >= start || minutes < end;
  }

  private getMsUntilNextWindow(date: Date = new Date()): number {
    const start = this.getSendWindowStartMinutes();
    const end = this.getSendWindowEndMinutes();
    const minutes = date.getHours() * 60 + date.getMinutes();
    let minutesUntil = 0;

    if (start === end) {
      minutesUntil = 0;
    } else if (start < end) {
      if (minutes < start) {
        minutesUntil = start - minutes;
      } else {
        minutesUntil = 1440 - minutes + start;
      }
    } else {
      if (minutes >= start || minutes < end) {
        minutesUntil = 0;
      } else {
        minutesUntil = start - minutes;
      }
    }

    const seconds = date.getSeconds();
    const ms = date.getMilliseconds();
    const totalMs = Math.max(minutesUntil * 60 * 1000 - seconds * 1000 - ms, 0);
    return totalMs;
  }

  private async waitForSendWindowIfNeeded(campaignId: string): Promise<boolean> {
    if (!this.getSendWindowEnabled()) return true;
    if (this.isWithinSendWindow()) return true;

    await storage.createSystemLog({
      level: "info",
      source: "campaign",
      message: "Outside send window. Waiting for next allowed time.",
      metadata: {
        campaignId,
        window: this.getSendWindowSettings(),
      },
    });

    const initialWaitMs = this.getMsUntilNextWindow();
    if (this.io && initialWaitMs > 0) {
      this.io.emit("campaign:cooldown", {
        campaignId,
        reason: "outside_window",
        cooldownMs: initialWaitMs,
        window: this.getSendWindowSettings(),
      });
    }

    while (this.activeCampaigns.get(campaignId)) {
      if (this.isWithinSendWindow()) {
        return true;
      }
      const waitMs = this.getMsUntilNextWindow();
      const step = Math.max(Math.min(waitMs, 60_000), 5_000);
      await this.sleep(step);
    }
    return false;
  }

  private async cooldownCampaign(
    campaignId: string,
    reason: string,
    metadata: Record<string, unknown> = {},
    overrideMs?: number
  ): Promise<boolean> {
    const cooldownMs = overrideMs && Number.isFinite(overrideMs) && overrideMs > 0
      ? Math.floor(overrideMs)
      : this.getSessionCooldownMs();
    const seconds = Math.max(Math.round(cooldownMs / 1000), 1);

    await storage.createSystemLog({
      level: "warn",
      source: "campaign",
      message: `WhatsApp cooldown: waiting ${seconds}s before continuing.`,
      metadata: {
        campaignId,
        reason,
        cooldownMs,
        ...metadata,
      },
    });

    if (this.io) {
      this.io.emit("campaign:cooldown", {
        campaignId,
        reason,
        cooldownMs,
        ...metadata,
      });
    }

    let remaining = cooldownMs;
    while (remaining > 0 && this.activeCampaigns.get(campaignId)) {
      const step = Math.min(remaining, 10_000);
      await this.sleep(step);
      remaining -= step;
    }

    return this.activeCampaigns.get(campaignId) ?? false;
  }

  private async waitForConnectedSessions(
    campaignId: string,
    pool: Pool,
    reason: string,
    metadata: Record<string, unknown> = {}
  ): Promise<boolean> {
    const maxAttempts = this.getSessionCooldownAttempts();
    let attempt = 0;

    while (this.activeCampaigns.get(campaignId)) {
      const connected = this.getConnectedSessions(pool);
      if (connected.length > 0) {
        return true;
      }

      attempt += 1;
      if (maxAttempts > 0 && attempt > maxAttempts) {
        return false;
      }

      const shouldContinue = await this.cooldownCampaign(campaignId, reason, {
        attempt,
        maxAttempts,
        ...metadata,
      });

      if (!shouldContinue) {
        return false;
      }
    }

    return false;
  }

  private resolvePausePlan(totalMessages: number) {
    const settings = this.getCampaignPauseSettings();
    if (!settings.enabled) {
      return {
        enabled: false,
        every: 0,
        durationsMinutes: [] as number[],
        durationsMode: "list" as const,
        applyToWhatsapp: false,
        applyToSms: false,
      };
    }

    if (!Number.isFinite(totalMessages) || totalMessages <= 0) {
      return {
        enabled: false,
        every: 0,
        durationsMinutes: [],
        applyToWhatsapp: settings.applyToWhatsapp,
        applyToSms: settings.applyToSms,
      };
    }

    if (totalMessages < settings.minMessages) {
      return {
        enabled: false,
        every: 0,
        durationsMinutes: settings.durationsMinutes,
        durationsMode: settings.durationsMode,
        applyToWhatsapp: settings.applyToWhatsapp,
        applyToSms: settings.applyToSms,
      };
    }

    let every = 0;
    if (settings.strategy === "fixed") {
      every = settings.everyMessages;
    } else {
      const targetPauses = Math.max(settings.targetPauses, 0);
      const segments = Math.max(targetPauses + 1, 1);
      every = Math.ceil(totalMessages / segments);
    }

    if (!Number.isFinite(every) || every <= 0) {
      return {
        enabled: false,
        every: 0,
        durationsMinutes: settings.durationsMinutes,
        durationsMode: settings.durationsMode,
        applyToWhatsapp: settings.applyToWhatsapp,
        applyToSms: settings.applyToSms,
      };
    }

    return {
      enabled: true,
      every,
      durationsMinutes: settings.durationsMinutes,
      durationsMode: settings.durationsMode,
      applyToWhatsapp: settings.applyToWhatsapp,
      applyToSms: settings.applyToSms,
    };
  }

  private pickPauseDurationMs(
    durationsMinutes: number[],
    durationsMode: "list" | "range"
  ): number {
    if (!durationsMinutes.length) {
      return 5 * 60 * 1000;
    }
    const sorted = [...durationsMinutes].sort((a, b) => a - b);
    if (durationsMode === "range" && sorted.length >= 2) {
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const minMs = min * 60 * 1000;
      const maxMs = max * 60 * 1000;
      const span = Math.max(maxMs - minMs, 0);
      const randomMs = minMs + Math.floor(Math.random() * (span + 1));
      return Math.max(randomMs, 60 * 1000);
    }

    const choice = sorted[Math.floor(Math.random() * sorted.length)];
    return Math.max(Math.floor(choice * 60 * 1000), 60 * 1000);
  }

  async startCampaign(campaignId: string): Promise<void> {
    if (this.activeCampaigns.get(campaignId)) {
      throw new Error('Campaign is already running');
    }

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const channel = this.normalizeCampaignChannel(campaign);
    const needsWhatsapp = channel !== "sms";
    const needsSms = channel === "sms" || channel === "whatsapp_fallback_sms" || campaign.fallbackSms === true;

    let pool: Pool | undefined;
    if (needsWhatsapp) {
      if (!campaign.poolId || campaign.poolId === 'null' || campaign.poolId === 'undefined') {
        throw new Error('Campaign must have a WhatsApp pool assigned');
      }

      pool = await storage.getPool(campaign.poolId);
      if (!pool) {
        throw new Error('Pool not found');
      }

      if (!pool.sessionIds || pool.sessionIds.length === 0) {
        throw new Error('Pool has no sessions assigned');
      }
    }

    let gsmPool: GsmPool | undefined;
    if (needsSms) {
      if (!campaign.smsPoolId || campaign.smsPoolId === "null" || campaign.smsPoolId === "undefined") {
        throw new Error("Campaign must have an SMS pool assigned");
      }

      gsmPool = await storage.getGsmPool(campaign.smsPoolId);
      if (!gsmPool) {
        throw new Error("SMS pool not found");
      }

      if (!gsmPool.lineIds || gsmPool.lineIds.length === 0) {
        throw new Error("SMS pool has no GSM lines assigned");
      }
    }

    this.activeCampaigns.set(campaignId, true);

    await storage.createSystemLog({
      level: 'info',
      source: 'campaign',
      message: `Starting campaign: ${campaign.name}`,
      metadata: {
        campaignId,
        channel,
        poolId: pool?.id ?? null,
        smsPoolId: gsmPool?.id ?? null,
        fallbackSms: campaign.fallbackSms ?? false,
      }
    });

    this.processCampaign(campaignId, campaign, pool, gsmPool, channel).catch((error) => {
      console.error('Error processing campaign:', error);
      this.activeCampaigns.delete(campaignId);
    });
  }

  async stopCampaign(campaignId: string): Promise<void> {
    this.activeCampaigns.delete(campaignId);
    
    await storage.updateCampaign(campaignId, {
      status: 'paused'
    });

    await storage.createSystemLog({
      level: 'info',
      source: 'campaign',
      message: `Campaign paused: ${campaignId}`,
      metadata: { campaignId }
    });
  }

  private async processCampaign(
    campaignId: string,
    campaign: Campaign,
    pool?: Pool,
    gsmPool?: GsmPool,
    channel?: string
  ): Promise<void> {
    const debtorRange = this.normalizeDebtorRange(campaign);
    let claimedWithRange = false;

    // Only process debtors that belong to this specific campaign.
    // If none are assigned, claim available "orphan" debtors (campaignId: null).
    let allDebtors = await storage.getDebtors(campaignId);
    if (allDebtors.length === 0) {
      const claimed = await storage.assignAvailableOrphanDebtorsToCampaign(
        campaignId,
        debtorRange ? { start: debtorRange.start, end: debtorRange.end } : undefined
      );
      if (claimed > 0) {
        claimedWithRange = !!debtorRange;
        await storage.createSystemLog({
          level: "warn",
          source: "campaign",
          message: `No debtors assigned to campaign. Claimed ${claimed} available orphan debtors.`,
          metadata: {
            campaignId,
            claimed,
            debtorRange: debtorRange ?? null,
          },
        });
        allDebtors = await storage.getDebtors(campaignId);
      } else {
        const released = await storage.releaseDebtorsByStatusFromInactiveCampaigns([
          "disponible",
        ]);
        if (released > 0) {
          await storage.createSystemLog({
            level: "info",
            source: "campaign",
            message: `Released ${released} available debtors from inactive campaigns.`,
            metadata: { campaignId, released },
          });

          const reclaimed = await storage.assignAvailableOrphanDebtorsToCampaign(
            campaignId,
            debtorRange ? { start: debtorRange.start, end: debtorRange.end } : undefined
          );
          if (reclaimed > 0) {
            claimedWithRange = !!debtorRange;
            await storage.createSystemLog({
              level: "warn",
              source: "campaign",
              message: `Claimed ${reclaimed} available debtors after release.`,
              metadata: {
                campaignId,
                reclaimed,
                debtorRange: debtorRange ?? null,
              },
            });
            allDebtors = await storage.getDebtors(campaignId);
          }
        }
      }
    }
    const availableDebtorsRaw = allDebtors.filter(d => d.status === 'disponible');
    const availableDebtors =
      debtorRange && !claimedWithRange
        ? this.sliceDebtorsByRange(availableDebtorsRaw, debtorRange)
        : availableDebtorsRaw;

    await storage.createSystemLog({
      level: 'info',
      source: 'campaign',
      message: `Found ${availableDebtors.length} available debtors to process`,
      metadata: {
        campaignId,
        totalDebtors: allDebtors.length,
        availableDebtors: availableDebtors.length,
        debtorRange: debtorRange ?? null,
      }
    });

    if (availableDebtors.length === 0) {
      await storage.updateCampaign(campaignId, {
        status: 'completed',
        completedAt: new Date()
      });
      
      await storage.createSystemLog({
        level: 'warn',
        source: 'campaign',
        message: `Campaign completed with no available debtors`,
        metadata: { campaignId }
      });
      
      this.activeCampaigns.delete(campaignId);
      return;
    }

    await storage.updateCampaign(campaignId, {
      totalDebtors: availableDebtors.length
    });

    const templates = this.getMessageTemplates(campaign);
    const rotationStrategy = campaign.messageRotationStrategy ?? (templates.length > 1 ? "random" : "none");
    let templateIndexCounter = 0;

    const campaignChannel = this.normalizeCampaignChannel(campaign, channel);
    const smsOnly = campaignChannel === "sms";
    const whatsappEnabled = !smsOnly;
    const smsEnabled =
      smsOnly ||
      campaignChannel === "whatsapp_fallback_sms" ||
      campaign.fallbackSms === true;

    let sessionIndex = 0;
    let gsmIndex = 0;
    let sentCount = 0;
    let failedCount = 0;
      const pausePlan = this.resolvePausePlan(availableDebtors.length);
    let nextPauseAt = pausePlan.enabled ? pausePlan.every : 0;
    let pauseCounter = 0;

    if (pausePlan.enabled) {
      await storage.createSystemLog({
        level: "info",
        source: "campaign",
        message: "Campaign pauses enabled",
        metadata: {
          campaignId,
          every: pausePlan.every,
          durationsMinutes: pausePlan.durationsMinutes,
          applyToWhatsapp: pausePlan.applyToWhatsapp,
          applyToSms: pausePlan.applyToSms,
        },
      });
    }

    for (const debtor of availableDebtors) {
      if (!this.activeCampaigns.get(campaignId)) {
        break;
      }

      const canSendNow = await this.waitForSendWindowIfNeeded(campaignId);
      if (!canSendNow) {
        break;
      }

      let canUseWhatsapp = whatsappEnabled;
      if (whatsappEnabled) {
        if (!pool) {
          throw new Error("WhatsApp pool not available");
        }

        const hasSessions = await this.ensurePoolHasConnectedSessions(
          campaignId,
          pool,
          "pre_send_check",
          debtor.id
        );
        if (!hasSessions) {
          if (!smsEnabled) {
            if (this.getCampaignImmediatePauseOnNoSessions()) {
              await this.pauseCampaignNoSessions(campaignId);
              return;
            }

            const waited = await this.waitForAnyConnectedSessions(
              campaignId,
              pool,
              "pre_send_check",
              debtor.id
            );
            if (!waited) {
              return;
            }
          }

          await storage.createSystemLog({
            level: "warn",
            source: "campaign",
            message: "No connected WhatsApp sessions. Falling back to SMS.",
            metadata: { campaignId, debtorId: debtor.id },
          });

          canUseWhatsapp = false;
        }
      }

      await storage.updateDebtor(debtor.id, {
        status: 'procesando'
      });

      const variantIndex = this.pickTemplateIndex(rotationStrategy, templates, templateIndexCounter);
      templateIndexCounter++;
      const templateUsed = templates[variantIndex] ?? campaign.message;
      const personalizedMessage = this.personalizeMessage(templateUsed, debtor);

      const attemptedSessionIds: string[] = [];
      const attemptedLineIds: string[] = [];
      let sessionRetryResets = 0;
      const maxSessionRetryResets = 1;
      let usedTransportId: string | null = null;
      let channelUsed: "whatsapp" | "sms" | null = null;
      let providerResponse: string | null = null;
      let sendSucceeded = false;
      let lastError: any = null;

      if (canUseWhatsapp && pool) {
        while (this.activeCampaigns.get(campaignId)) {
          const connectedSessions = this.getConnectedSessions(pool);
          let availableSessions = connectedSessions.filter(
            (id) => !attemptedSessionIds.includes(id)
          );

          if (availableSessions.length === 0) {
            if (connectedSessions.length > 0 && sessionRetryResets < maxSessionRetryResets) {
              sessionRetryResets += 1;
              if (!this.getCampaignImmediatePauseOnNoSessions()) {
                const shouldContinue = await this.cooldownCampaign(campaignId, "session_retry_reset", {
                  debtorId: debtor.id,
                  attemptedSessionIds,
                  sessionRetryResets,
                  connectedSessions,
                });
                if (!shouldContinue) {
                  return;
                }
              }
              attemptedSessionIds.length = 0;
              availableSessions = this
                .getConnectedSessions(pool)
                .filter((id) => !attemptedSessionIds.includes(id));
            }

            if (availableSessions.length === 0) {
              const recovered = await this.ensurePoolHasConnectedSessions(
                campaignId,
                pool,
                "no_connected_sessions",
                debtor.id
              );

              if (!recovered) {
                if (!smsEnabled) {
                  if (this.getCampaignImmediatePauseOnNoSessions()) {
                    await this.pauseCampaignNoSessions(campaignId);
                    return;
                  }

                  const waited = await this.waitForAnyConnectedSessions(
                    campaignId,
                    pool,
                    "no_connected_sessions",
                    debtor.id
                  );
                  if (!waited) {
                    return;
                  }

                  attemptedSessionIds.length = 0;
                  continue;
                }

                await storage.createSystemLog({
                  level: "warn",
                  source: "campaign",
                  message: "WhatsApp sessions unavailable. Falling back to SMS.",
                  metadata: { campaignId, debtorId: debtor.id, attemptedSessionIds },
                });
                canUseWhatsapp = false;
                break;
              }

              attemptedSessionIds.length = 0;
              availableSessions = this
                .getConnectedSessions(pool)
                .filter((id) => !attemptedSessionIds.includes(id));
            }

            if (availableSessions.length === 0) {
              if (!smsEnabled) {
                await this.pauseCampaignNoSessions(campaignId);
                return;
              }

              await storage.createSystemLog({
                level: "warn",
                source: "campaign",
                message: "WhatsApp sessions exhausted. Falling back to SMS.",
                metadata: { campaignId, debtorId: debtor.id, attemptedSessionIds },
              });
              canUseWhatsapp = false;
              break;
            }
          }

          const nextSessionId = this.getNextSession(pool, sessionIndex, availableSessions);
          sessionIndex++;

          if (!nextSessionId) {
            break;
          }

          attemptedSessionIds.push(nextSessionId);
          usedTransportId = nextSessionId;
          channelUsed = "whatsapp";

          try {
            const success = await this.sendMessage(nextSessionId, debtor, personalizedMessage);
            if (success) {
              sendSucceeded = true;
              break;
            }
            lastError = new Error("Failed to send message");
            break;
          } catch (error: any) {
            lastError = error;
            const remainingSessions = this
              .getConnectedSessions(pool)
              .filter((id) => !attemptedSessionIds.includes(id));

            if (error?.retryable && remainingSessions.length > 0) {
              await this.removeSessionFromPool(
                campaignId,
                pool,
                nextSessionId,
                "session_unavailable",
                debtor.id
              );

              const recovered = await this.ensurePoolHasConnectedSessions(
                campaignId,
                pool,
                "session_unavailable",
                debtor.id
              );
              if (!recovered) {
                if (!smsEnabled) {
                  if (this.getCampaignImmediatePauseOnNoSessions()) {
                    await this.pauseCampaignNoSessions(campaignId);
                    return;
                  }

                  const waited = await this.waitForAnyConnectedSessions(
                    campaignId,
                    pool,
                    "session_unavailable",
                    debtor.id
                  );
                  if (!waited) {
                    return;
                  }

                  attemptedSessionIds.length = 0;
                  continue;
                }

                await storage.createSystemLog({
                  level: "warn",
                  source: "campaign",
                  message: "WhatsApp sessions unavailable after disconnect. Falling back to SMS.",
                  metadata: {
                    campaignId,
                    debtorId: debtor.id,
                    attemptedSessionIds,
                  },
                });
                canUseWhatsapp = false;
                break;
              }

              await storage.createSystemLog({
                level: "warn",
                source: "campaign",
                message: `Session ${nextSessionId} unavailable. Retrying with another session.`,
                metadata: {
                  campaignId,
                  debtorId: debtor.id,
                  attemptedSessionIds,
                },
              });
              continue;
            }

            if (error?.retryable) {
              await this.removeSessionFromPool(
                campaignId,
                pool,
                nextSessionId,
                "session_unavailable_no_remaining",
                debtor.id
              );

              const recovered = await this.ensurePoolHasConnectedSessions(
                campaignId,
                pool,
                "session_unavailable_no_remaining",
                debtor.id
              );
              if (!recovered) {
                if (!smsEnabled) {
                  if (this.getCampaignImmediatePauseOnNoSessions()) {
                    await this.pauseCampaignNoSessions(campaignId);
                    return;
                  }

                  const waited = await this.waitForAnyConnectedSessions(
                    campaignId,
                    pool,
                    "session_unavailable_no_remaining",
                    debtor.id
                  );
                  if (!waited) {
                    return;
                  }

                  attemptedSessionIds.length = 0;
                  continue;
                }

                await storage.createSystemLog({
                  level: "warn",
                  source: "campaign",
                  message: "WhatsApp sessions unavailable. Falling back to SMS.",
                  metadata: {
                    campaignId,
                    debtorId: debtor.id,
                    attemptedSessionIds,
                  },
                });
                canUseWhatsapp = false;
                break;
              }
            }
            break;
          }
        }
      }

      if (!sendSucceeded && smsEnabled) {
        if (!gsmPool) {
          if (smsOnly) {
            await this.pauseCampaignNoGsmLines(campaignId);
            return;
          }

          await storage.createSystemLog({
            level: "error",
            source: "campaign",
            message: "SMS fallback enabled but no GSM pool available.",
            metadata: { campaignId, debtorId: debtor.id },
          });
        } else {
          const activeLines = await this.getActiveGsmLines(gsmPool);
          if (activeLines.length === 0) {
            if (smsOnly) {
              await this.pauseCampaignNoGsmLines(campaignId);
              return;
            }

            await storage.createSystemLog({
              level: "warn",
              source: "campaign",
              message: "No active GSM lines available for SMS fallback.",
              metadata: { campaignId, debtorId: debtor.id, gsmPoolId: gsmPool.id },
            });
          } else {
            while (this.activeCampaigns.get(campaignId)) {
              const availableLines = activeLines.filter(
                (line) => !attemptedLineIds.includes(line.id)
              );

              if (availableLines.length === 0) {
                if (smsOnly) {
                  await this.pauseCampaignNoGsmLines(campaignId);
                  return;
                }
                break;
              }

              const nextLine = this.getNextGsmLine(gsmPool, gsmIndex, availableLines);
              gsmIndex++;

              if (!nextLine) {
                break;
              }

              attemptedLineIds.push(nextLine.id);
              usedTransportId = nextLine.id;
              channelUsed = "sms";

              try {
                const smsResult = await smsManager.sendSmsWithLine(
                  nextLine,
                  debtor.phone,
                  personalizedMessage
                );
                providerResponse = smsResult.body;
                sendSucceeded = true;

                await storage.updateGsmLine(nextLine.id, { lastUsedAt: new Date() });

                await storage.createSystemLog({
                  level: "info",
                  source: "campaign",
                  message: `SMS sent via GSM line ${nextLine.name}`,
                  metadata: {
                    campaignId,
                    debtorId: debtor.id,
                    gsmLineId: nextLine.id,
                    status: smsResult.status,
                  },
                });
                break;
              } catch (error: any) {
                lastError = error;
                const remainingLines = activeLines.filter(
                  (line) => !attemptedLineIds.includes(line.id)
                );

                if (remainingLines.length > 0) {
                  await storage.createSystemLog({
                    level: "warn",
                    source: "campaign",
                    message: `GSM line ${nextLine.name} failed. Retrying with another line.`,
                    metadata: {
                      campaignId,
                      debtorId: debtor.id,
                      gsmLineId: nextLine.id,
                      attemptedLineIds,
                      error: error?.message ?? String(error),
                    },
                  });
                  continue;
                }
                break;
              }
            }
          }
        }
      }

      if (!usedTransportId) {
        failedCount++;
        await storage.updateDebtor(debtor.id, { status: 'fallado' });
        continue;
      }

      const messageChannel = channelUsed ?? (smsOnly ? "sms" : "whatsapp");

      if (sendSucceeded) {
        sentCount++;
        
        await storage.updateDebtor(debtor.id, {
          status: 'completado',
          lastContact: new Date()
        });

        const createdMessage = await storage.createMessage({
          campaignId: campaign.id,
          debtorId: debtor.id,
          sessionId: usedTransportId,
          phone: debtor.phone,
          content: personalizedMessage,
          templateUsed,
          templateVariantIndex: variantIndex,
          channel: messageChannel,
          providerResponse,
          status: 'sent',
          sentAt: new Date()
        });

        if (this.io) {
          this.io.emit('message:created', createdMessage);
        }

        const progress = Math.round(((sentCount + failedCount) / availableDebtors.length) * 100);
        const updatedCampaign = await storage.updateCampaign(campaignId, {
          sent: sentCount,
          failed: failedCount,
          progress
        });

        if (this.io && updatedCampaign) {
          this.io.emit('campaign:progress', updatedCampaign);
        }
      } else {
        failedCount++;
        
        await storage.updateDebtor(debtor.id, {
          status: 'fallado'
        });

        const attemptedCount = attemptedSessionIds.length + attemptedLineIds.length;
        const errorMessage =
          lastError?.message ||
          (attemptedCount > 1
            ? "Failed after retrying other routes"
            : "Failed to send message");

        const createdMessage = await storage.createMessage({
          campaignId: campaign.id,
          debtorId: debtor.id,
          sessionId: usedTransportId,
          phone: debtor.phone,
          content: personalizedMessage,
          templateUsed,
          templateVariantIndex: variantIndex,
          channel: messageChannel,
          providerResponse,
          status: 'failed',
          sentAt: new Date(),
          error: errorMessage
        });

        if (this.io) {
          this.io.emit('message:created', createdMessage);
        }

        const progress = Math.round(((sentCount + failedCount) / availableDebtors.length) * 100);
        const updatedCampaign = await storage.updateCampaign(campaignId, {
          sent: sentCount,
          failed: failedCount,
          progress
        });

        if (this.io && updatedCampaign) {
          this.io.emit('campaign:progress', updatedCampaign);
        }
      }

      const delayConfig =
        messageChannel === "sms" ? gsmPool ?? pool : pool ?? gsmPool;
      if (delayConfig) {
        let delay = this.calculateDelayFromValues(
          delayConfig.delayBase,
          delayConfig.delayVariation
        );

        if (messageChannel !== "sms" && pool) {
          const connectedCount = this.getConnectedSessions(pool).length;
          delay = this.calculateAdaptiveDelay(pool, connectedCount);
        }

        await this.sleep(delay);
      }

      if (pausePlan.enabled && nextPauseAt > 0) {
        const processedCount = sentCount + failedCount;
        if (processedCount >= nextPauseAt && processedCount < availableDebtors.length) {
          const shouldApplyPause =
            messageChannel === "sms" ? pausePlan.applyToSms : pausePlan.applyToWhatsapp;

          if (shouldApplyPause) {
            pauseCounter += 1;
            const durationsMode = pausePlan.durationsMode ?? "list";
            const pauseMs = this.pickPauseDurationMs(
              pausePlan.durationsMinutes,
              durationsMode
            );
            const shouldContinue = await this.cooldownCampaign(
              campaignId,
              "scheduled_pause",
              {
                processedCount,
                pauseCounter,
                nextPauseAt,
                pauseMs,
              },
              pauseMs
            );

            if (!shouldContinue) {
              break;
            }
          }

          nextPauseAt += pausePlan.every;
        }
      }
    }

    await storage.updateCampaign(campaignId, {
      status: 'completed',
      completedAt: new Date()
    });

    this.activeCampaigns.delete(campaignId);

    await storage.createSystemLog({
      level: 'info',
      source: 'campaign',
      message: `Campaign completed: ${campaign.name}`,
      metadata: { campaignId }
    });
  }

  private normalizeCampaignChannel(campaign: Campaign, overrideChannel?: string): CampaignChannel {
    const raw = String(overrideChannel ?? campaign.channel ?? "whatsapp").toLowerCase();

    if (raw === "sms") {
      return "sms";
    }

    if (
      raw === "whatsapp_fallback_sms" ||
      raw === "whatsapp+sms" ||
      raw === "whatsapp_sms" ||
      raw === "fallback_sms"
    ) {
      return "whatsapp_fallback_sms";
    }

    return "whatsapp";
  }

  private async getActiveGsmLines(pool: GsmPool): Promise<GsmLine[]> {
    const allLines = await storage.getGsmLines();
    const lineIds = new Set(pool.lineIds ?? []);
    return allLines.filter(
      (line) => lineIds.has(line.id) && line.active && line.status !== "inactive"
    );
  }

  private getConnectedSessions(pool: Pool): string[] {
    const connectedInMemory = whatsappManager.getConnectedSessionIds();
    return pool.sessionIds.filter(id => connectedInMemory.includes(id));
  }

  private getAllConnectedSessions(): string[] {
    return whatsappManager.getConnectedSessionIds();
  }

  private async removeSessionFromPool(
    campaignId: string,
    pool: Pool,
    sessionId: string,
    reason: string,
    debtorId?: string
  ): Promise<boolean> {
    if (!pool.sessionIds?.includes(sessionId)) {
      return false;
    }

    pool.sessionIds = pool.sessionIds.filter(id => id !== sessionId);

    if (this.getCampaignPoolAutoAdjust()) {
      await storage.updatePool(pool.id, { sessionIds: pool.sessionIds });
    }

    await storage.createSystemLog({
      level: "warn",
      source: "campaign",
      message: `Removed session ${sessionId} from pool ${pool.name}`,
      metadata: {
        campaignId,
        poolId: pool.id,
        sessionId,
        reason,
        debtorId: debtorId ?? null,
      },
    });

    return true;
  }

  private async addSessionsToPool(
    campaignId: string,
    pool: Pool,
    sessionIds: string[],
    reason: string,
    debtorId?: string
  ): Promise<string[]> {
    const unique = sessionIds.filter(
      (id) => id && !pool.sessionIds.includes(id)
    );

    if (unique.length === 0) {
      return [];
    }

    pool.sessionIds = Array.from(new Set([...pool.sessionIds, ...unique]));

    if (this.getCampaignPoolAutoAdjust()) {
      await storage.updatePool(pool.id, { sessionIds: pool.sessionIds });
    }

    await storage.createSystemLog({
      level: "info",
      source: "campaign",
      message: `Added ${unique.length} session(s) to pool ${pool.name}`,
      metadata: {
        campaignId,
        poolId: pool.id,
        sessionIds: unique,
        reason,
        debtorId: debtorId ?? null,
      },
    });

    return unique;
  }

  private async tryRefillPoolFromAnyConnected(
    campaignId: string,
    pool: Pool,
    reason: string,
    debtorId?: string,
    minSessions?: number
  ): Promise<boolean> {
    if (!this.getCampaignPoolFallbackAnySession()) {
      return false;
    }

    const target = minSessions ?? this.getCampaignMinPoolSessions();
    const connected = this.getConnectedSessions(pool);
    if (connected.length >= target) {
      return true;
    }

    const allConnected = this.getAllConnectedSessions();
    const candidates = allConnected.filter(id => !pool.sessionIds.includes(id));
    if (candidates.length === 0) {
      return false;
    }

    const needed = Math.max(target - connected.length, 1);
    const toAdd = candidates.slice(0, needed);
    await this.addSessionsToPool(campaignId, pool, toAdd, reason, debtorId);

    return this.getConnectedSessions(pool).length >= target;
  }

  private async ensurePoolHasConnectedSessions(
    campaignId: string,
    pool: Pool,
    reason: string,
    debtorId?: string,
    minSessions?: number
  ): Promise<boolean> {
    const target = minSessions ?? this.getCampaignMinPoolSessions();
    const connected = this.getConnectedSessions(pool);
    if (connected.length >= target) {
      return true;
    }

    return this.tryRefillPoolFromAnyConnected(
      campaignId,
      pool,
      reason,
      debtorId,
      target
    );
  }

  private async waitForAnyConnectedSessions(
    campaignId: string,
    pool: Pool,
    reason: string,
    debtorId?: string,
    minSessions?: number
  ): Promise<boolean> {
    const waitMs = this.getCampaignWaitForSessionsMs();

    await storage.createSystemLog({
      level: "warn",
      source: "campaign",
      message: "Waiting for connected WhatsApp sessions (no auto-reconnect).",
      metadata: {
        campaignId,
        poolId: pool.id,
        reason,
        debtorId: debtorId ?? null,
        waitMs,
      },
    });

    if (this.io) {
      this.io.emit("campaign:cooldown", {
        campaignId,
        reason: "waiting_for_sessions",
        cooldownMs: waitMs,
        poolId: pool.id,
      });
    }

    while (this.activeCampaigns.get(campaignId)) {
      const recovered = await this.ensurePoolHasConnectedSessions(
        campaignId,
        pool,
        "wait_for_sessions",
        debtorId,
        minSessions
      );
      if (recovered) {
        return true;
      }
      await this.sleep(waitMs);
    }

    return false;
  }

  private isSessionUnavailableError(error: any): boolean {
    const message = String(error?.message ?? "").toLowerCase();
    if (!message) return false;

    return (
      message.includes("session not connected") ||
      message.includes("session not found") ||
      message.includes("target closed") ||
      message.includes("detached frame") ||
      message.includes("protocol error") ||
      message.includes("execution context was destroyed")
    );
  }

  private parsePositiveInt(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }

  private normalizeDebtorRange(
    campaign: Campaign
  ): { start: number; end?: number } | null {
    const start = this.parsePositiveInt(campaign.debtorRangeStart);
    const end = this.parsePositiveInt(campaign.debtorRangeEnd);

    if (start === null && end === null) {
      return null;
    }

    const effectiveStart = start ?? 1;
    if (end !== null && end < effectiveStart) {
      throw new Error("Invalid debtor range: end must be >= start");
    }

    return end !== null ? { start: effectiveStart, end } : { start: effectiveStart };
  }

  private sliceDebtorsByRange(
    debtors: Debtor[],
    range: { start: number; end?: number }
  ): Debtor[] {
    if (debtors.length === 0) return [];
    const startIndex = Math.max(range.start, 1);
    if (startIndex > debtors.length) {
      return [];
    }
    const endIndex = Math.min(range.end ?? debtors.length, debtors.length);
    if (endIndex < startIndex) {
      return [];
    }
    return debtors.slice(startIndex - 1, endIndex);
  }

  private async pauseCampaignNoSessions(campaignId: string): Promise<void> {
    await storage.createSystemLog({
      level: "error",
      source: "campaign",
      message: "No connected sessions available. Pausing campaign.",
      metadata: { campaignId },
    });

    await storage.updateCampaign(campaignId, {
      status: "paused",
    });

    this.activeCampaigns.delete(campaignId);

    if (this.io) {
      this.io.emit("campaign:error", {
        campaignId,
        error: "No hay sesiones conectadas disponibles",
      });
    }
  }

  private async pauseCampaignNoGsmLines(campaignId: string): Promise<void> {
    await storage.createSystemLog({
      level: "error",
      source: "campaign",
      message: "No active GSM lines available. Pausing campaign.",
      metadata: { campaignId },
    });

    await storage.updateCampaign(campaignId, {
      status: "paused",
    });

    this.activeCampaigns.delete(campaignId);

    if (this.io) {
      this.io.emit("campaign:error", {
        campaignId,
        error: "No hay lineas GSM activas disponibles",
      });
    }
  }

  private getMessageTemplates(campaign: Campaign): string[] {
    const variants = Array.isArray(campaign.messageVariants) ? campaign.messageVariants : [];
    const templates = [campaign.message, ...variants]
      .map((value) => String(value ?? "").trim())
      .filter((value) => value.length > 0);

    const deduped = Array.from(new Set(templates));
    return deduped.length > 0 ? deduped : [campaign.message];
  }

  private pickTemplateIndex(strategy: string | undefined, templates: string[], index: number): number {
    if (templates.length <= 1) {
      return 0;
    }

    const normalizedStrategy = String(strategy ?? "none").toLowerCase();

    if (
      normalizedStrategy === "round_robin" ||
      normalizedStrategy === "roundrobin" ||
      normalizedStrategy === "fixed_turns" ||
      normalizedStrategy === "turnos_fijos"
    ) {
      return index % templates.length;
    }

    if (
      normalizedStrategy === "random" ||
      normalizedStrategy === "aleatorio" ||
      normalizedStrategy === "random_turns" ||
      normalizedStrategy === "turnos_aleatorios"
    ) {
      const randomIndex = Math.floor(Math.random() * templates.length);
      return randomIndex;
    }

    return 0;
  }

  private personalizeMessage(template: string, debtor: Debtor): string {
    let personalizedMessage = template
      .replaceAll("{nombre}", debtor.name)
      .replaceAll("{name}", debtor.name)
      .replaceAll("{deuda}", debtor.debt.toString())
      .replaceAll("{debt}", debtor.debt.toString())
      .replaceAll("{phone}", debtor.phone);

    if (debtor.metadata && typeof debtor.metadata === "object") {
      for (const [key, rawValue] of Object.entries(debtor.metadata)) {
        if (!key) continue;
        const value = rawValue == null ? "" : String(rawValue);
        const token = `{${key}}`;
        personalizedMessage = personalizedMessage.replaceAll(token, value);
      }
    }

    return personalizedMessage;
  }

  private getNextGsmLine(pool: GsmPool, index: number, lines: GsmLine[]): GsmLine | null {
    if (lines.length === 0) {
      return null;
    }

    if (pool.strategy === "fixed_turns" || pool.strategy === "turnos_fijos") {
      return lines[index % lines.length];
    }

    if (pool.strategy === "random_turns" || pool.strategy === "turnos_aleatorios") {
      const randomIndex = Math.floor(Math.random() * lines.length);
      return lines[randomIndex];
    }

    return lines[index % lines.length];
  }

  private getNextSession(pool: Pool, index: number, connectedSessions: string[]): string | null {
    if (connectedSessions.length === 0) {
      return null;
    }

    if (pool.strategy === 'fixed_turns' || pool.strategy === 'turnos_fijos') {
      return connectedSessions[index % connectedSessions.length];
    } else if (pool.strategy === 'random_turns' || pool.strategy === 'turnos_aleatorios') {
      const randomIndex = Math.floor(Math.random() * connectedSessions.length);
      return connectedSessions[randomIndex];
    } else {
      return connectedSessions[index % connectedSessions.length];
    }
  }

  private calculateDelayFromValues(delayBase: number, delayVariation: number): number {
    const variation = Math.floor(Math.random() * delayVariation * 2) - delayVariation;
    return delayBase + variation;
  }

  private calculateDelay(pool: Pool): number {
    return this.calculateDelayFromValues(pool.delayBase, pool.delayVariation);
  }

  private calculateAdaptiveDelay(pool: Pool, connectedSessions: number): number {
    if (!this.getAutoThrottleEnabled()) {
      return this.calculateDelay(pool);
    }

    const targetSessions = this.getAutoThrottleTargetSessions();
    if (connectedSessions <= targetSessions || targetSessions <= 0) {
      return this.calculateDelay(pool);
    }

    const maxMultiplier = this.getAutoThrottleMaxMultiplier();
    const rawMultiplier = connectedSessions / targetSessions;
    const multiplier = Math.min(Math.max(rawMultiplier, 1), maxMultiplier);

    const scaledBase = Math.round(pool.delayBase * multiplier);
    const scaledVariation = Math.round(pool.delayVariation * multiplier);
    return this.calculateDelayFromValues(scaledBase, scaledVariation);
  }

  private async sendMessage(sessionId: string, debtor: Debtor, messageText: string): Promise<boolean> {
    try {
      await whatsappManager.sendMessage(sessionId, debtor.phone, messageText);
      
      await storage.createSystemLog({
        level: 'info',
        source: 'campaign',
        message: `Message sent to ${debtor.name}`,
        metadata: { debtorId: debtor.id, sessionId }
      });

      return true;
    } catch (error: any) {
      const retryable = this.isSessionUnavailableError(error);
      await storage.createSystemLog({
        level: 'error',
        source: 'campaign',
        message: `Failed to send message to ${debtor.name}: ${error.message}`,
        metadata: {
          debtorId: debtor.id,
          sessionId,
          error: error.message,
          retryable,
        }
      });

      if (retryable) {
        const wrapped = new Error(error?.message ?? "Session unavailable");
        (wrapped as any).retryable = true;
        throw wrapped;
      }

      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const campaignEngine = new CampaignEngine();
