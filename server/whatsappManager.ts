import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fs from "fs";
import path from "path";
import QRCode from 'qrcode';
import { storage } from './storage';
import type { Server as SocketServer } from 'socket.io';
import { notificationService } from "./notificationService";
import type { InsertMessage } from "@shared/schema";

export interface WhatsAppClient {
  id: string;
  client: typeof Client.prototype;
  status: string;
  qrCode?: string;
  qrRaw?: string;
  purpose?: string;
  lastVerifiedAt?: Date;
  lastVerifiedOk?: boolean;
  lastVerifyError?: string;
}

export type VerifyNowResult = {
  checked: number;
  verified: number;
  failed: number;
  results: Array<{
    sessionId: string;
    phoneNumber: string | null;
    verifiedConnected: boolean;
    error?: string;
  }>;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const DESTROY_TIMEOUT_MS = (() => {
  const raw = process.env.WHATSAPP_DESTROY_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
})();

const RESET_AUTH_DESTROY_TIMEOUT_MS = (() => {
  const raw = process.env.WHATSAPP_RESET_AUTH_DESTROY_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
})();

const RESET_AUTH_CREATE_TIMEOUT_MS = (() => {
  const raw = process.env.WHATSAPP_RESET_AUTH_CREATE_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
})();

const clientAny = Client as any;
if (!clientAny.__injectPatched) {
  const originalInject = clientAny.prototype?.inject;
  const inFlight = new WeakMap<object, Promise<unknown>>();
  const bindingNames = [
    "onQRChangedEvent",
    "onCodeReceivedEvent",
    "onAuthAppStateChangedEvent",
    "onAppStateHasSyncedEvent",
  ];

  const cleanupBindings = async (page: any) => {
    if (!page || typeof page.removeExposedFunction !== "function") {
      return;
    }
    for (const name of bindingNames) {
      try {
        await page.removeExposedFunction(name);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        if (!message.includes("does not exist")) {
          // Ignore transient errors so inject can continue.
          await storage.createSystemLog({
            level: "warning",
            source: "whatsapp",
            message: `Failed to cleanup exposed binding ${name}`,
            metadata: { error: message },
          });
        }
      }
    }
  };

  if (typeof originalInject === "function") {
    clientAny.prototype.inject = function (...args: any[]) {
      const existing = inFlight.get(this);
      if (existing) {
        return existing;
      }
      const run = (async () => {
        try {
          await cleanupBindings(this?.pupPage);
          return await originalInject.apply(this, args);
        } finally {
          inFlight.delete(this);
        }
      })();
      inFlight.set(this, run);
      return run;
    };
  }

  clientAny.__injectPatched = true;
}

class WhatsAppManager {
  private clients: Map<string, WhatsAppClient> = new Map();
  private io?: SocketServer;
  private sessionDisconnectHandler?: (sessionId: string, reason: string) => void;
  private recentIncomingMessageIds: Map<string, number> = new Map();
  private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
  private pollingStartTimes: Map<string, number> = new Map();
  private pollingLastSeenByChat: Map<string, Map<string, number>> = new Map();
  private pollingEnabledOverride: boolean | null = null;
  private pollingIntervalOverrideMs: number | null = null;
  private qrWindowUntil: Map<string, number> = new Map();

  setSocketServer(io: SocketServer) {
    this.io = io;
  }

  setSessionDisconnectHandler(handler?: (sessionId: string, reason: string) => void) {
    this.sessionDisconnectHandler = handler;
  }

  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string,
    sessionId?: string
  ): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const scoped = sessionId ? `[wa][${sessionId}] ` : "";
        reject(new Error(`${scoped}${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private isManualQrMode(): boolean {
    return String(process.env.WHATSAPP_QR_MANUAL).toLowerCase() === "true";
  }

  private getQrWindowMs(): number {
    const raw = Number(process.env.WHATSAPP_QR_WINDOW_MS);
    if (Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return 5 * 60 * 1000;
  }

  private isQrWindowOpen(sessionId: string): boolean {
    if (!this.isManualQrMode()) {
      return true;
    }
    const until = this.qrWindowUntil.get(sessionId);
    if (!until) {
      return false;
    }
    if (Date.now() > until) {
      this.qrWindowUntil.delete(sessionId);
      return false;
    }
    return true;
  }

  private clearQrWindow(sessionId: string): void {
    this.qrWindowUntil.delete(sessionId);
  }

  async openQrWindow(
    sessionId: string,
    windowMs?: number
  ): Promise<{ qrCode: string | null; expiresAt: string | null }> {
    console.log(`[wa][${sessionId}] openQrWindow requested (windowMs=${windowMs ?? "default"})`);
    const duration = windowMs && windowMs > 0 ? windowMs : this.getQrWindowMs();
    const expiresAtMs = Date.now() + duration;
    this.qrWindowUntil.set(sessionId, expiresAtMs);

    const client = this.clients.get(sessionId);
    if (!client) {
      return { qrCode: null, expiresAt: new Date(expiresAtMs).toISOString() };
    }

    if (client.qrRaw) {
      try {
        const qrDataUrl = await QRCode.toDataURL(client.qrRaw);
        client.qrCode = qrDataUrl;
        client.status = "qr_ready";

        await storage.updateSession(sessionId, {
          status: "qr_ready",
          qrCode: qrDataUrl,
        });

        if (this.io) {
          this.io.emit("session:qr", { sessionId, qrCode: qrDataUrl });
        }

        return { qrCode: qrDataUrl, expiresAt: new Date(expiresAtMs).toISOString() };
      } catch (error) {
        console.error("Error generating QR code:", error);
      }
    }

    return { qrCode: null, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  private normalizePhoneIdentifier(value: string | undefined | null): string {
    if (!value) return "";
    return value.replace(/@.+$/i, "").replace(/\D/g, "");
  }

  normalizePhoneForWhatsapp(phone: string): string {
    const raw = phone.trim();
    if (!raw) return raw;

    const withoutSuffix = raw.replace(/@c\.us$/i, "");
    let sanitized = withoutSuffix;

    if (sanitized.startsWith("00")) {
      sanitized = `+${sanitized.slice(2)}`;
    }

    let digitsOnly = sanitized.replace(/\D/g, "");
    if (!digitsOnly) {
      return "";
    }

    const defaultCountry = (process.env.SMS_DEFAULT_COUNTRY_CODE ?? "56").trim();
    const enforceChileMobile =
      (process.env.SMS_ENFORCE_CHILE_MOBILE ?? "").toLowerCase() === "true";

    if (enforceChileMobile && defaultCountry === "56") {
      if (digitsOnly.length === 10 && digitsOnly.startsWith("09")) {
        digitsOnly = digitsOnly.slice(1);
      }

      if (digitsOnly.length === 9 && digitsOnly.startsWith("9")) {
        return `56${digitsOnly}`;
      }

      if (digitsOnly.length === 11 && digitsOnly.startsWith("569")) {
        return digitsOnly;
      }
    }

    if (defaultCountry) {
      if (digitsOnly.startsWith(defaultCountry)) {
        return digitsOnly;
      }
      return `${defaultCountry}${digitsOnly}`;
    }

    return digitsOnly;
  }

  private shouldProcessIncomingMessage(msg: any): boolean {
    const messageId =
      msg?.id?._serialized ?? msg?.id?.id ?? msg?.id ?? "";
    if (!messageId) return true;

    const now = Date.now();
    const ttlMs = 5 * 60 * 1000;
    this.recentIncomingMessageIds.forEach((ts, id) => {
      if (now - ts > ttlMs) {
        this.recentIncomingMessageIds.delete(id);
      }
    });

    if (this.recentIncomingMessageIds.has(messageId)) {
      return false;
    }

    this.recentIncomingMessageIds.set(messageId, now);
    return true;
  }

  private stopIncomingPolling(sessionId: string) {
    const timer = this.pollingTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.pollingTimers.delete(sessionId);
    }
    this.pollingStartTimes.delete(sessionId);
    this.pollingLastSeenByChat.delete(sessionId);
  }

  private resolveUserAgent(): string | null {
    const envValue = (
      process.env.WHATSAPP_USER_AGENT ??
      process.env.PUPPETEER_USER_AGENT ??
      ""
    ).trim();
    if (envValue) {
      return envValue;
    }

    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  }

  private getPollingEnabled(): boolean {
    if (this.pollingEnabledOverride !== null) {
      return this.pollingEnabledOverride;
    }
    return (process.env.WHATSAPP_POLL_ENABLED ?? "").toLowerCase() === "true";
  }

  private getPollingIntervalMs(): number | null {
    if (
      this.pollingIntervalOverrideMs !== null &&
      Number.isFinite(this.pollingIntervalOverrideMs) &&
      this.pollingIntervalOverrideMs > 0
    ) {
      return Math.floor(this.pollingIntervalOverrideMs);
    }

    const envValue = Number(process.env.WHATSAPP_POLL_INTERVAL_MS ?? "15000");
    if (!Number.isFinite(envValue) || envValue <= 0) {
      return null;
    }
    return Math.floor(envValue);
  }

  private getVerifyWindowMs(): number {
    const envValue = Number(process.env.WHATSAPP_VERIFY_WINDOW_MS ?? "30000");
    if (!Number.isFinite(envValue) || envValue <= 0) {
      return 30000;
    }
    return Math.floor(envValue);
  }

  private syncPollingForSessions() {
    const enabled = this.getPollingEnabled();
    this.clients.forEach((client, sessionId) => {
      if (client.status !== "connected") {
        this.stopIncomingPolling(sessionId);
        return;
      }
      if (enabled) {
        this.startIncomingPolling(sessionId, client.client);
      } else {
        this.stopIncomingPolling(sessionId);
      }
    });
  }

  private restartPollingForSessions() {
    this.clients.forEach((_, sessionId) => {
      this.stopIncomingPolling(sessionId);
    });
    this.syncPollingForSessions();
  }

  getPollingSettings() {
    const enabled = this.getPollingEnabled();
    const intervalMs = this.getPollingIntervalMs() ?? 0;
    return {
      enabled,
      intervalMs,
      source:
        this.pollingEnabledOverride !== null || this.pollingIntervalOverrideMs !== null
          ? "override"
          : "env",
      connectedSessions: this.getConnectedSessionIds().length,
      activePollingSessions: this.pollingTimers.size,
    };
  }

  setPollingEnabled(enabled: boolean) {
    this.pollingEnabledOverride = enabled;
    this.syncPollingForSessions();
  }

  setPollingInterval(intervalMs?: number | null) {
    if (intervalMs === undefined) {
      return;
    }
    if (intervalMs === null) {
      this.pollingIntervalOverrideMs = null;
      this.restartPollingForSessions();
      return;
    }
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error("Invalid polling interval");
    }
    this.pollingIntervalOverrideMs = Math.floor(intervalMs);
    this.restartPollingForSessions();
  }

  private async patchChatModel(sessionId: string, client: any) {
    try {
      const page = client?.pupPage;
      if (!page?.evaluate) {
        return;
      }

      await page.evaluate(() => {
        const w = window as any;
        if (!w?.WWebJS || w.WWebJS.__safeChatModelPatch) {
          return;
        }

        w.WWebJS.__safeChatModelPatch = true;
        const original = w.WWebJS.getChatModel;

        w.WWebJS.getChatModel = async (chat: any, opts: any = {}) => {
          try {
            return await original(chat, opts);
          } catch {
            try {
              const model = chat?.serialize ? chat.serialize() : null;
              if (!model) return null;

              model.isGroup = Boolean(chat?.groupMetadata);
              model.isMuted = chat?.mute?.expiration !== 0;

              if (opts?.isChannel && w.Store?.ChatGetters?.getIsNewsletter) {
                model.isChannel = Boolean(w.Store.ChatGetters.getIsNewsletter(chat));
              } else {
                model.formattedTitle = chat?.formattedTitle;
              }

              delete model.msgs;
              delete model.msgUnsyncedButtonReplyMsgs;
              delete model.unsyncedButtonReplies;

              return model;
            } catch {
              return null;
            }
          }
        };
      });
    } catch (error: any) {
      await storage.createSystemLog({
        level: "warning",
        source: "whatsapp",
        message: `Failed to patch chat model for session ${sessionId}`,
        metadata: { sessionId, error: error?.message ?? String(error) },
      });
    }
  }

  private isVerifiedConnected(
    client: WhatsAppClient,
    nowMs: number,
    maxAgeMs: number
  ): boolean {
    if (client.status !== "connected") {
      return false;
    }
    if (!client.lastVerifiedOk || !client.lastVerifiedAt) {
      return false;
    }
    return nowMs - client.lastVerifiedAt.getTime() <= maxAgeMs;
  }

  private async markSessionDisconnected(
    sessionId: string,
    whatsappClient: WhatsAppClient,
    reason: string,
    errorMessage?: string
  ): Promise<void> {
    const wasConnected = whatsappClient.status === "connected";
    const disconnectedAt = new Date();
    whatsappClient.status = "disconnected";
    whatsappClient.lastVerifiedAt = disconnectedAt;
    whatsappClient.lastVerifiedOk = false;
    whatsappClient.lastVerifyError = errorMessage ?? reason;

    this.clearQrWindow(sessionId);
    this.stopIncomingPolling(sessionId);

    const persistedSession = await storage.getSession(sessionId);
    await storage.updateSession(sessionId, {
      status: "disconnected",
      disconnectCount: (persistedSession?.disconnectCount ?? 0) + 1,
      lastDisconnectAt: disconnectedAt,
      lastDisconnectReason: errorMessage ?? reason,
    });

    if (wasConnected) {
      await storage.createSystemLog({
        level: "warning",
        source: "whatsapp",
        message: `Session ${sessionId} disconnected (${reason})`,
        metadata: { sessionId, reason, error: errorMessage ?? null },
      });
    }

    if (this.io) {
      if (wasConnected) {
        this.io.emit("session:disconnected", { sessionId, reason });
      }
      this.io.emit("session:updated", { id: sessionId });
    }

    if (wasConnected && this.sessionDisconnectHandler) {
      try {
        this.sessionDisconnectHandler(sessionId, reason);
      } catch (error) {
        console.warn("Failed to notify session disconnect handler:", error);
      }
    }
  }

  private async getStateWithTimeout(
    client: any,
    timeoutMs: number
  ): Promise<string | null> {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`getState timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      client
        .getState()
        .then((state: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(state);
        })
        .catch((error: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async verifyConnectedState(
    sessionId: string,
    client: any,
    whatsappClient: WhatsAppClient,
    options?: { stateGetter?: () => Promise<string | null> }
  ): Promise<{ ok: boolean; error?: string }> {
    const now = new Date();
    const getState = options?.stateGetter ?? (() => client.getState());
    try {
      const state = await getState();
      if (state !== "CONNECTED") {
        const error = `state=${state ?? "unknown"}`;
        await this.markSessionDisconnected(
          sessionId,
          whatsappClient,
          "heartbeat_failed",
          error
        );
        return { ok: false, error };
      }

      const wasConnected = whatsappClient.status === "connected";
      whatsappClient.status = "connected";
      whatsappClient.lastVerifiedAt = now;
      whatsappClient.lastVerifiedOk = true;
      whatsappClient.lastVerifyError = undefined;

      await storage.updateSession(sessionId, {
        status: "connected",
        lastActive: now,
      });

      if (!wasConnected) {
        this.startIncomingPolling(sessionId, client);
        if (this.io) {
          this.io.emit("session:updated", { id: sessionId });
        }
      }

      return { ok: true };
    } catch (error: any) {
      const message = error?.message ?? String(error);
      await this.markSessionDisconnected(
        sessionId,
        whatsappClient,
        "heartbeat_failed",
        message
      );
      return { ok: false, error: message };
    }
  }

  private startIncomingPolling(sessionId: string, client: any) {
    if (this.pollingTimers.has(sessionId)) {
      return;
    }

    if (!this.getPollingEnabled()) {
      return;
    }

    const intervalMs = this.getPollingIntervalMs();
    if (!intervalMs) {
      return;
    }

    this.pollingStartTimes.set(sessionId, Date.now());
    this.pollingLastSeenByChat.set(sessionId, new Map());

    let polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;

      try {
        const sessionClient = this.clients.get(sessionId);
        if (!sessionClient) {
          polling = false;
          return;
        }

        const verified = await this.verifyConnectedState(
          sessionId,
          client,
          sessionClient
        );
        if (!verified.ok) {
          polling = false;
          return;
        }

        const chats = await client.getChats();
        const lastSeenByChat =
          this.pollingLastSeenByChat.get(sessionId) ?? new Map<string, number>();
        const startTime = this.pollingStartTimes.get(sessionId) ?? 0;

        for (const chat of chats ?? []) {
          if (chat?.isGroup) continue;
          const chatId = String(chat?.id?._serialized ?? chat?.id ?? "");
          const unread = Number(chat?.unreadCount ?? 0);
          const limit = Math.min(unread > 0 ? unread : 5, 25);
          const messages = await chat.fetchMessages({ limit, fromMe: false });
          if (!messages || messages.length === 0) continue;

          let lastSeen = lastSeenByChat.get(chatId) ?? startTime;
          const sorted = [...messages].sort((a, b) => {
            const aTs = typeof a?.timestamp === "number" ? a.timestamp : 0;
            const bTs = typeof b?.timestamp === "number" ? b.timestamp : 0;
            return aTs - bTs;
          });

          for (const msg of sorted) {
            const msgTs =
              typeof msg?.timestamp === "number"
                ? msg.timestamp * 1000
                : Date.now();
            if (msgTs <= lastSeen) continue;
            await this.handleIncomingMessage(sessionId, msg, "poll");
            if (msgTs > lastSeen) lastSeen = msgTs;
          }

          if (chatId) {
            lastSeenByChat.set(chatId, lastSeen);
          }
        }

        this.pollingLastSeenByChat.set(sessionId, lastSeenByChat);
      } catch (error: any) {
        await storage.createSystemLog({
          level: "warning",
          source: "whatsapp",
          message: `Incoming polling failed for session ${sessionId}`,
          metadata: { sessionId, error: error?.message ?? String(error) },
        });
      } finally {
        polling = false;
      }
    }, intervalMs);

    this.pollingTimers.set(sessionId, timer);
  }

  private async handleIncomingMessage(
    sessionId: string,
    msg: any,
    source: string
  ) {
    const messageId =
      msg?.id?._serialized ?? msg?.id?.id ?? msg?.id ?? null;
    if (!this.shouldProcessIncomingMessage(msg)) {
      return;
    }

    const msgType = String(msg?.type ?? "").toLowerCase();
    if (msgType === "e2e_notification") {
      return;
    }

    if (msg.fromMe) {
      await storage.createSystemLog({
        level: "info",
        source: "whatsapp",
        message: `Ignored fromMe message (${source})`,
        metadata: {
          sessionId,
          rawFrom: msg.from,
          id: messageId,
          type: msg.type,
        },
      });
      return;
    }

    try {
      const phone = await this.resolveIncomingPhone(msg);
      const debtor = await storage.getDebtorByPhone(phone);
      const sentAt =
        typeof msg.timestamp === "number"
          ? new Date(msg.timestamp * 1000)
          : new Date();

      const rawBody = typeof msg.body === "string" ? msg.body.trim() : "";
      const fallbackType =
        typeof msg.type === "string" && msg.type ? msg.type : "media";
      const content = rawBody || `[${fallbackType}]`;

      const createdMessage = await storage.createMessage({
        sessionId,
        debtorId: debtor?.id,
        campaignId: debtor?.campaignId,
        phone,
        content,
        status: "received",
        providerResponse: messageId,
        sentAt,
      });

      if (debtor?.id) {
        await storage.updateDebtor(debtor.id, {
          lastContact: sentAt,
        });
      }

      await storage.createSystemLog({
        level: "info",
        source: "whatsapp",
        message: `Incoming message from ${msg.from}`,
        metadata: {
          sessionId,
          phone,
          rawFrom: msg.from,
          debtorId: debtor?.id,
          campaignId: debtor?.campaignId,
          type: msg.type,
          hasBody: Boolean(rawBody),
          bodyLength: rawBody.length,
          isGroup: String(msg.from ?? "").endsWith("@g.us"),
          eventSource: source,
          id: messageId,
        },
      });

      if (this.io) {
        this.io.emit("message:received", createdMessage);
      }

      void notificationService.enqueueIncomingMessage({
        sessionId,
        phone,
        content,
        sentAt,
        debtor,
        campaignId: debtor?.campaignId ?? null,
      });

      console.log("Message received:", msg.from, msg.body);
    } catch (error: any) {
      console.error("Error handling incoming message:", error?.message || error);
      await storage.createSystemLog({
        level: "error",
        source: "whatsapp",
        message: `Failed to handle incoming message: ${error?.message || error}`,
        metadata: { sessionId, phone: msg.from, id: messageId },
      });
    }
  }

  private async cleanupDuplicateSessions(
    currentSessionId: string,
    phoneNumber: string | undefined | null
  ): Promise<string[]> {
    const normalizedPhone = this.normalizePhoneIdentifier(phoneNumber);
    if (!normalizedPhone) {
      return [];
    }

    const sessions = await storage.getSessions();
    const duplicates = sessions.filter(
      (s) =>
        s.id !== currentSessionId &&
        this.normalizePhoneIdentifier(s.phoneNumber) === normalizedPhone
    );

    if (duplicates.length === 0) {
      return [];
    }

    for (const duplicate of duplicates) {
      const duplicateClient = this.clients.get(duplicate.id);
      if (duplicateClient) {
        try {
          await duplicateClient.client.destroy();
        } catch (error) {
          console.warn(
            "Failed to destroy duplicate in-memory session:",
            duplicate.id,
            error
          );
        } finally {
          this.clients.delete(duplicate.id);
        }
      }

      // Detach the phone number from the duplicate record so it can be relinked later.
      await storage.updateSession(duplicate.id, {
        status: "disconnected",
        phoneNumber: null,
        qrCode: null,
      });

      if (this.io) {
        this.io.emit("session:updated", { id: duplicate.id });
      }
    }

    await storage.createSystemLog({
      level: "warning",
      source: "whatsapp",
      message: `Duplicate phone ${normalizedPhone} detected. Cleaned ${duplicates.length} session(s).`,
      metadata: {
        phoneNumber: normalizedPhone,
        currentSessionId,
        duplicateSessionIds: duplicates.map((d) => d.id),
      },
    });

    return duplicates.map((d) => d.id);
  }

  private async resolveIncomingPhone(msg: any): Promise<string> {
    const rawFrom = String(msg?.from ?? "");
    let candidate = rawFrom;

    // WhatsApp can send @lid identifiers. Try to resolve a real number.
    if (rawFrom.endsWith("@lid")) {
      try {
        const contact = await msg.getContact();
        candidate =
          contact?.number ??
          contact?.id?.user ??
          contact?.id?._serialized ??
          rawFrom;
      } catch {
        candidate = rawFrom;
      }
    }

    const normalized = this.normalizePhoneIdentifier(candidate);
    return normalized || this.normalizePhoneIdentifier(rawFrom) || candidate;
  }

  async createSession(sessionId: string): Promise<void> {
    if (this.clients.has(sessionId)) {
      throw new Error('Session already exists');
    }

    const sessionRecord = await storage.getSession(sessionId);
    if (!sessionRecord) {
      throw new Error(`Session not found in database: ${sessionId}`);
    }

    const sessionPurpose = sessionRecord.purpose ?? "default";
    const resolvedAuthClientId = sessionRecord.authClientId ?? sessionId;
    const proxyServerId = sessionRecord.proxyServerId ?? null;
    let proxyEndpoint: string | null = null;

    if (!sessionRecord.authClientId) {
      await storage.updateSession(sessionId, { authClientId: resolvedAuthClientId });
    }

    console.log(
      `[wa][${sessionId}] createSession start (authClientId=${resolvedAuthClientId}, purpose=${sessionPurpose})`
    );

    if (proxyServerId) {
      const proxyServer = await storage.getProxyServer(proxyServerId);
      if (!proxyServer || !proxyServer.enabled) {
        await storage.createSystemLog({
          level: "error",
          source: "proxy",
          message: `ProxyServer unavailable for session ${sessionId}`,
          metadata: { sessionId, proxyServerId },
        });
        throw new Error("ProxyServer unavailable");
      }
      proxyEndpoint = `${proxyServer.scheme}://${proxyServer.host}:${proxyServer.port}`;
    }

    const resolveChromePath = () => {
      const envPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
      if (envPath && fs.existsSync(envPath)) {
        return envPath;
      }

      const candidates =
        process.platform === "win32"
          ? [
              "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
              "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
              "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
              "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            ]
          : process.platform === "darwin"
            ? [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
              ]
            : ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"];

      return candidates.find((candidate) => fs.existsSync(candidate));
    };

    const executablePath = resolveChromePath();
    const userAgent = this.resolveUserAgent();
    const puppeteerArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ];

    if (userAgent) {
      puppeteerArgs.push(`--user-agent=${userAgent}`);
    }

    if (proxyEndpoint) {
      puppeteerArgs.push(`--proxy-server=${proxyEndpoint}`);
      puppeteerArgs.push("--disable-webrtc");
      puppeteerArgs.push("--disable-features=WebRtcHideLocalIpsWithMdns");
    }

    // CONFIGURACIÓN CORREGIDA CON LOCAL AUTH
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: resolvedAuthClientId,
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: {
        executablePath,
        args: puppeteerArgs,
      }
    });

    const whatsappClient: WhatsAppClient = {
      id: sessionId,
      client,
      status: 'initializing',
      purpose: sessionPurpose,
    };

    this.clients.set(sessionId, whatsappClient);
    let authCheckTimer: NodeJS.Timeout | null = null;

    const markConnected = async (source: string) => {
      if (whatsappClient.status === 'connected') {
        return;
      }

      this.clearQrWindow(sessionId);

      const phoneNumber = client.info?.wid?.user;
      if (phoneNumber) {
        try {
          await this.cleanupDuplicateSessions(sessionId, phoneNumber);
        } catch (error) {
          console.warn("Failed to cleanup duplicate sessions:", error);
        }
      }
      whatsappClient.status = 'connected';
      whatsappClient.lastVerifiedAt = new Date();
      whatsappClient.lastVerifiedOk = true;
      whatsappClient.lastVerifyError = undefined;

      await storage.updateSession(sessionId, {
        status: 'connected',
        phoneNumber: phoneNumber ?? undefined,
        qrCode: null,
        lastActive: new Date()
      });

      if (this.io) {
        this.io.emit('session:ready', {
          sessionId,
          phoneNumber
        });
      }

      await storage.createSystemLog({
        level: 'info',
        source: 'whatsapp',
        message: `Session ${sessionId} connected (${source})`,
        metadata: { sessionId, source, phoneNumber }
      });

      await this.patchChatModel(sessionId, client);
      this.startIncomingPolling(sessionId, client);
    };

    client.on('qr', async (qr) => {
      whatsappClient.qrRaw = qr;

      if (this.isManualQrMode() && !this.isQrWindowOpen(sessionId)) {
        return;
      }

      console.log(`[wa][${sessionId}] event:qr generated`);
      
      try {
        const qrDataUrl = await QRCode.toDataURL(qr);
        whatsappClient.qrCode = qrDataUrl;
        whatsappClient.status = 'qr_ready';
        
        await storage.updateSession(sessionId, {
          status: 'qr_ready',
          qrCode: qrDataUrl
        });

        if (this.io) {
          this.io.emit('session:qr', {
            sessionId,
            qrCode: qrDataUrl
          });
        }
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    });

    client.on('ready', async () => {
      console.log(`[wa][${sessionId}] event:ready`);

      await markConnected("ready");
    });

    client.on('authenticated', async () => {
      console.log(`[wa][${sessionId}] event:authenticated`);
      whatsappClient.status = 'authenticated';

      try {
        await storage.updateSession(sessionId, {
          status: 'authenticated',
          qrCode: null,
          lastActive: new Date()
        });

        if (this.io) {
          this.io.emit('session:updated', { id: sessionId });
        }

        await storage.createSystemLog({
          level: 'info',
          source: 'whatsapp',
          message: `Session ${sessionId} authenticated`,
          metadata: { sessionId }
        });
      } catch (error) {
        console.warn('Failed to persist authenticated status:', error);
      }

      // Fallback: poll state for a short window after authentication.
      if (authCheckTimer) {
        clearInterval(authCheckTimer);
        authCheckTimer = null;
      }

      let attempts = 0;
      const maxAttempts = 15;

      authCheckTimer = setInterval(async () => {
        attempts += 1;
        try {
          const state = await client.getState();
          if (state === "CONNECTED") {
            if (authCheckTimer) {
              clearInterval(authCheckTimer);
              authCheckTimer = null;
            }
            await markConnected("authenticated-check");
            return;
          }

          if (attempts >= maxAttempts) {
            if (authCheckTimer) {
              clearInterval(authCheckTimer);
              authCheckTimer = null;
            }

            await storage.createSystemLog({
              level: "warning",
              source: "whatsapp",
              message: `Session ${sessionId} stuck after authentication`,
              metadata: { sessionId, state }
            });
          }
        } catch (error) {
          if (attempts >= maxAttempts && authCheckTimer) {
            clearInterval(authCheckTimer);
            authCheckTimer = null;
          }
          console.warn("Failed to verify state after authentication:", error);
        }
      }, 2000);
    });

    client.on('change_state', async (state) => {
      console.log(`[wa][${sessionId}] event:change_state -> ${state}`);

      if (state === 'CONNECTED' && whatsappClient.status !== 'connected') {
        try {
          await markConnected("state-change");
        } catch (error) {
          console.warn('Failed to update session from state change:', error);
        }
      }
    });

    client.on('auth_failure', async (msg) => {
      console.error(`[wa][${sessionId}] event:auth_failure ->`, msg);
      whatsappClient.status = 'auth_failed';
      this.clearQrWindow(sessionId);
      this.stopIncomingPolling(sessionId);
      
      const sessionSnapshot = await storage.getSession(sessionId);
      await storage.updateSession(sessionId, {
        status: 'auth_failed',
        authFailureCount: (sessionSnapshot?.authFailureCount ?? 0) + 1,
        lastAuthFailureAt: new Date(),
      });

      if (this.io) {
        this.io.emit('session:auth_failed', {
          sessionId,
          error: msg
        });
      }

      await storage.createSystemLog({
        level: 'error',
        source: 'whatsapp',
        message: `Authentication failed for session ${sessionId}`,
        metadata: { error: msg }
      });
    });

    client.on('disconnected', async (reason) => {
      console.log(`[wa][${sessionId}] event:disconnected ->`, reason);
      if (authCheckTimer) {
        clearInterval(authCheckTimer);
        authCheckTimer = null;
      }

      await this.markSessionDisconnected(
        sessionId,
        whatsappClient,
        "client_disconnected",
        String(reason ?? "")
      );
    });

    client.on("message", (msg) => {
      void this.handleIncomingMessage(sessionId, msg, "message");
    });

    client.on("message_create", (msg) => {
      void this.handleIncomingMessage(sessionId, msg, "message_create");
    });

    client.on("message_ack", async (msg, ack) => {
      const messageId =
        msg?.id?._serialized ?? msg?.id?.id ?? (typeof msg?.id === "string" ? msg.id : "");
      if (!messageId) {
        return;
      }
      const ackValue = typeof ack === "number" ? ack : Number(ack ?? 0);
      if (ackValue < 2) {
        return;
      }

      try {
        const existing = await storage.getMessageByProviderResponse(messageId, sessionId);
        if (!existing) {
          return;
        }

        const now = new Date();
        const update: Partial<InsertMessage> = {};
        if (ackValue >= 2 && !existing.deliveredAt) {
          update.deliveredAt = now;
        }
        if (ackValue >= 3 && !existing.readAt) {
          update.readAt = now;
        }

        if (Object.keys(update).length === 0) {
          return;
        }

        const updated = await storage.updateMessage(existing.id, update);
        if (this.io && updated) {
          this.io.emit("message:status", {
            id: updated.id,
            deliveredAt: updated.deliveredAt ?? null,
            readAt: updated.readAt ?? null,
            ack: ackValue,
          });
        }
      } catch (error: any) {
        console.warn("Failed to process message_ack:", error?.message ?? error);
      }
    });

    client.on("message_edit", async (msg, newBody) => {
      const messageId =
        msg?.id?._serialized ?? msg?.id?.id ?? (typeof msg?.id === "string" ? msg.id : "");
      if (!messageId) {
        return;
      }
      const content =
        (typeof newBody === "string" && newBody.trim()) ||
        (typeof msg?.body === "string" ? msg.body.trim() : "");
      if (!content) {
        return;
      }

      try {
        const existing = await storage.getMessageByProviderResponse(messageId, sessionId);
        if (!existing) {
          return;
        }

        const updated = await storage.updateMessage(existing.id, {
          content,
          editedAt: new Date(),
        });
        if (this.io && updated) {
          this.io.emit("message:edited", {
            id: updated.id,
            content: updated.content,
            editedAt: updated.editedAt ?? null,
          });
        }
      } catch (error: any) {
        console.warn("Failed to process message_edit:", error?.message ?? error);
      }
    });

    try {
      await client.initialize();
      console.log(`[wa][${sessionId}] createSession initialized`);
    } catch (error) {
      console.error(`[wa][${sessionId}] createSession initialize error:`, error);
      throw error;
    }
  }

  async destroySession(
    sessionId: string,
    options?: { removeAuth?: boolean }
  ): Promise<void> {
    const whatsappClient = this.clients.get(sessionId);
    const sessionRecord = await storage.getSession(sessionId);
    const authClientId = sessionRecord?.authClientId ?? sessionId;
    this.clearQrWindow(sessionId);
    const removeAuth = options?.removeAuth ?? false;

    console.log(
      `[wa][${sessionId}] destroySession start (removeAuth=${removeAuth}, authClientId=${authClientId})`
    );

    try {
      if (whatsappClient) {
        this.stopIncomingPolling(sessionId);

        // Remove early so other callers stop using a session that's being destroyed.
        this.clients.delete(sessionId);

        const destroyTask = whatsappClient.client
          .destroy()
          .catch((error: any) => {
            console.error("Error destroying WhatsApp client:", error);
          });

        const result = await Promise.race([
          destroyTask.then(() => "done" as const),
          sleep(DESTROY_TIMEOUT_MS).then(() => "timeout" as const),
        ]);

        if (result === "timeout") {
          console.warn(
            `WhatsApp client destroy timed out after ${DESTROY_TIMEOUT_MS}ms (sessionId=${sessionId})`
          );
        }
      }
      
      // NO eliminar la carpeta de autenticación si quieres persistencia
      /*
      const fs = await import('fs');
      const path = await import('path');
      const sessionDir = path.join(process.cwd(), '.wwebjs_auth', `session-${sessionId}`);
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
      */

      if (removeAuth) {
        // Guard against path traversal.
        if (/^[a-zA-Z0-9_-]+$/.test(authClientId)) {
          const sessionDir = path.join(process.cwd(), ".wwebjs_auth", `session-${authClientId}`);
          try {
            await fs.promises.rm(sessionDir, { recursive: true, force: true });
          } catch (error: any) {
            console.warn(
              `Failed to remove auth folder for session ${sessionId} (${authClientId}):`,
              error?.message ?? error
            );
          }
        } else {
          console.warn(`Skip removing auth folder due to invalid authClientId: ${authClientId}`);
        }
      }
       
      await storage.updateSession(sessionId, {
        status: 'disconnected'
      });
      
      await storage.createSystemLog({
        level: 'info',
        source: 'whatsapp',
        message: `Session ${sessionId} destroyed`,
        metadata: {}
      });

      console.log(`[wa][${sessionId}] destroySession completed`);
    } catch (error) {
      console.error(`[wa][${sessionId}] destroySession error:`, error);
    }
  }

  async resetSessionAuth(sessionId: string): Promise<void> {
    const resetAt = new Date();
    const session = await storage.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const oldAuthClientId = session.authClientId ?? sessionId;
    const newAuthClientId = `${sessionId}-${Date.now()}`;

    console.log(
      `[wa][${sessionId}] resetSessionAuth start (oldAuthClientId=${oldAuthClientId}, newAuthClientId=${newAuthClientId})`
    );

    try {
      await storage.updateSession(sessionId, {
        status: "reconnecting",
        qrCode: null,
      });

      await this.runWithTimeout(
        this.destroySession(sessionId),
        RESET_AUTH_DESTROY_TIMEOUT_MS,
        "destroySession",
        sessionId
      );

      if (/^[a-zA-Z0-9_-]+$/.test(oldAuthClientId)) {
        const sessionDir = path.join(process.cwd(), ".wwebjs_auth", `session-${oldAuthClientId}`);
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      } else {
        console.warn(
          `[wa][${sessionId}] skip deleting auth folder due to invalid oldAuthClientId=${oldAuthClientId}`
        );
      }

      await storage.updateSession(sessionId, {
        authClientId: newAuthClientId,
        status: "initializing",
        qrCode: null,
        resetAuthCount: (session.resetAuthCount ?? 0) + 1,
        lastResetAuthAt: resetAt,
      });

      await this.runWithTimeout(
        this.createSession(sessionId),
        RESET_AUTH_CREATE_TIMEOUT_MS,
        "createSession",
        sessionId
      );

      await storage.createSystemLog({
        level: "info",
        source: "whatsapp",
        message: `Session ${sessionId} auth reset`,
        metadata: { oldAuthClientId, newAuthClientId },
      });
      console.log(`[wa][${sessionId}] resetSessionAuth completed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[wa][${sessionId}] resetSessionAuth error:`, message);
      await storage.updateSession(sessionId, { status: "auth_failed" });
      await storage.createSystemLog({
        level: "error",
        source: "whatsapp",
        message: `Session ${sessionId} auth reset failed`,
        metadata: { error: message, oldAuthClientId },
      });
      throw error;
    }
  }

  async sendMessage(
    sessionId: string,
    phoneNumber: string,
    message: string
  ): Promise<{ messageId?: string }> {
    const whatsappClient = this.clients.get(sessionId);
    
    if (!whatsappClient) {
      throw new Error('Session not found');
    }

    if (whatsappClient.status !== 'connected') {
      throw new Error('Session not connected');
    }

    try {
      const normalized = this.normalizePhoneForWhatsapp(phoneNumber);
      if (!normalized || !normalized.match(/^\d+$/)) {
        throw new Error(`Invalid phone number format: ${phoneNumber}`);
      }

      const formattedNumber = `${normalized}@c.us`;
      
      const isRegistered = await whatsappClient.client.isRegisteredUser(formattedNumber);
      if (!isRegistered) {
        throw new Error(`Number ${phoneNumber} is not registered on WhatsApp`);
      }
      
      const sentMessage = await whatsappClient.client.sendMessage(formattedNumber, message);
      const messageId =
        sentMessage?.id?._serialized ??
        sentMessage?.id?.id ??
        (typeof sentMessage?.id === "string" ? sentMessage.id : null);
      
      const session = await storage.getSession(sessionId);
      if (session) {
        await storage.updateSession(sessionId, {
          messagesSent: session.messagesSent + 1,
          lastActive: new Date()
        });
      }

      return { messageId: messageId ?? undefined };
    } catch (error: any) {
      console.error('Error sending message:', error.message);
      
      if (error.message.includes('detached Frame') || 
          error.message.includes('Target closed') ||
          error.message.includes('Protocol error')) {
        await this.markSessionDisconnected(
          sessionId,
          whatsappClient,
          "browser_error",
          error.message
        );
        console.log('Session marked as disconnected due to browser error:', sessionId);
      }
      
      throw error;
    }
  }

  getSession(sessionId: string): WhatsAppClient | undefined {
    return this.clients.get(sessionId);
  }

  getAllSessions(): WhatsAppClient[] {
    return Array.from(this.clients.values());
  }

  getConnectedSessionIds(): string[] {
    return this.getConnectedSessionIdsWithOptions();
  }

  getConnectedSessionIdsWithOptions(options?: { includeNotify?: boolean }): string[] {
    const connected: string[] = [];
    const includeNotify = options?.includeNotify !== false;
    this.clients.forEach((client, id) => {
      if (client.status === 'connected') {
        if (!includeNotify && client.purpose === "notify") {
          return;
        }
        connected.push(id);
      }
    });
    return connected;
  }

  getVerifiedConnectedSessionIdsWithOptions(options?: {
    includeNotify?: boolean;
    maxAgeMs?: number;
  }): string[] {
    const verified: string[] = [];
    const includeNotify = options?.includeNotify !== false;
    const maxAgeMs = options?.maxAgeMs ?? this.getVerifyWindowMs();
    const nowMs = Date.now();

    this.clients.forEach((client, id) => {
      if (!includeNotify && client.purpose === "notify") {
        return;
      }
      if (this.isVerifiedConnected(client, nowMs, maxAgeMs)) {
        verified.push(id);
      }
    });

    return verified;
  }

  getSessionHealthSnapshot(options?: {
    includeNotify?: boolean;
    maxAgeMs?: number;
  }): Array<{
    sessionId: string;
    status: string;
    verifiedConnected: boolean;
    lastVerifiedAt: Date | null;
    lastVerifyError: string | null;
  }> {
    const includeNotify = options?.includeNotify !== false;
    const maxAgeMs = options?.maxAgeMs ?? this.getVerifyWindowMs();
    const nowMs = Date.now();
    const snapshot: Array<{
      sessionId: string;
      status: string;
      verifiedConnected: boolean;
      lastVerifiedAt: Date | null;
      lastVerifyError: string | null;
    }> = [];

    this.clients.forEach((client, id) => {
      if (!includeNotify && client.purpose === "notify") {
        return;
      }
      snapshot.push({
        sessionId: id,
        status: client.status,
        verifiedConnected: this.isVerifiedConnected(client, nowMs, maxAgeMs),
        lastVerifiedAt: client.lastVerifiedAt ?? null,
        lastVerifyError: client.lastVerifyError ?? null,
      });
    });

    return snapshot;
  }

  async verifyNow(): Promise<VerifyNowResult> {
    const timeoutMs = 5000;
    const sessions = await storage.getSessions();
    const phoneById = new Map(
      sessions.map((session) => [session.id, session.phoneNumber ?? null])
    );
    const results: VerifyNowResult["results"] = [];
    let checked = 0;
    let verified = 0;
    let failed = 0;

    for (const [sessionId, whatsappClient] of Array.from(this.clients.entries())) {
      checked += 1;
      let ok = false;
      let error: string | undefined;

      try {
        const result = await this.verifyConnectedState(
          sessionId,
          whatsappClient.client,
          whatsappClient,
          {
            stateGetter: () =>
              this.getStateWithTimeout(whatsappClient.client, timeoutMs),
          }
        );
        ok = result.ok;
        error = result.error;
      } catch (err: any) {
        ok = false;
        error = err?.message ?? String(err);
      }

      if (ok) {
        verified += 1;
      } else {
        failed += 1;
      }

      results.push({
        sessionId,
        phoneNumber: phoneById.get(sessionId) ?? null,
        verifiedConnected: ok,
        ...(ok ? {} : { error: error ?? "unknown_error" }),
      });
    }

    return {
      checked,
      verified,
      failed,
      results,
    };
  }

  getConnectedNotifySessionId(): string | null {
    let found: string | null = null;
    this.clients.forEach((client, id) => {
      if (found) return;
      if (client.status === "connected" && client.purpose === "notify") {
        found = id;
      }
    });
    return found;
  }

  setSessionPurpose(sessionId: string, purpose?: string) {
    const client = this.clients.get(sessionId);
    if (client) {
      client.purpose = purpose ?? "default";
    }
  }

  isSessionConnected(sessionId: string): boolean {
    const client = this.clients.get(sessionId);
    return client?.status === 'connected' || false;
  }

  async restoreSessions(): Promise<void> {
    console.log('Restoring sessions from database...');
    
    const sessions = await storage.getSessions();
    console.log(`Found ${sessions.length} sessions in database`);

    for (const session of sessions) {
      try {
        // Solo restaurar sesiones que estaban conectadas
        if (session.status === 'connected') {
          console.log('Attempting to restore connected session:', session.id);
          
          await storage.updateSession(session.id, {
            status: 'reconnecting',
            qrCode: null
          });
          
          await this.createSession(session.id);
          console.log('Session restoration initiated:', session.id);
        }
      } catch (error: any) {
        console.error('Error restoring session:', session.id, error.message);
        
        await storage.updateSession(session.id, {
          status: 'disconnected'
        });
        
        await storage.createSystemLog({
          level: 'error',
          source: 'whatsapp',
          message: `Failed to restore session ${session.id}: ${error.message}`,
          metadata: { sessionId: session.id, error: error.message }
        });
      }
    }
  }
}

export const whatsappManager = new WhatsAppManager();

