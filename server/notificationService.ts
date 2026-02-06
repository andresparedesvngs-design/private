import { storage } from "./storage";
import { whatsappManager } from "./whatsappManager";
import type { Debtor } from "@shared/schema";

type IncomingNotification = {
  sessionId: string;
  phone: string;
  content: string;
  sentAt: Date;
  debtor?: Debtor;
  campaignId?: string | null;
};

class NotificationService {
  private timer: NodeJS.Timeout | null = null;

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processDueBatches();
    }, 30_000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private buildSnippet(content: string): string {
    const cleaned = String(content ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "Sin contenido";
    const maxLength = 120;
    if (cleaned.length <= maxLength) return cleaned;
    return `${cleaned.slice(0, maxLength - 1)}...`;
  }

  async enqueueIncomingMessage(payload: IncomingNotification): Promise<void> {
    const debtor = payload.debtor;
    if (!debtor?.ownerUserId) {
      await storage.createSystemLog({
        level: "info",
        source: "notify",
        message: "Incoming message ignored (no executive assigned)",
        metadata: {
          phone: payload.phone,
          debtorId: debtor?.id ?? null,
        },
      });
      return;
    }

    const user = await storage.getUser(debtor.ownerUserId);
    if (!user) {
      await storage.createSystemLog({
        level: "warning",
        source: "notify",
        message: "Notification skipped (executive not found)",
        metadata: { executiveId: debtor.ownerUserId, debtorId: debtor.id },
      });
      return;
    }

    if (!user.notifyEnabled) {
      await storage.createSystemLog({
        level: "info",
        source: "notify",
        message: "Notification skipped (notify disabled)",
        metadata: { executiveId: user.id, debtorId: debtor.id },
      });
      return;
    }

    if (!user.executivePhone) {
      await storage.createSystemLog({
        level: "warning",
        source: "notify",
        message: "Notification skipped (missing executive phone)",
        metadata: { executiveId: user.id, debtorId: debtor.id },
      });
      return;
    }

    const contact = await storage.getContactByPhone(payload.phone);
    const rut = debtor.rut ?? contact?.rut ?? "UNKNOWN";
    const snippet = this.buildSnippet(payload.content);
    const now = new Date();
    const windowSec = user.notifyBatchWindowSec ?? 120;
    const maxItems = user.notifyBatchMaxItems ?? 5;

    await storage.upsertNotificationBatch(user.id, (existing) => {
      const items = existing?.items ? [...existing.items] : [];
      const index = items.findIndex((item) => item.debtorId === debtor.id);
      if (index >= 0) {
        const current = items[index];
        items[index] = {
          ...current,
          snippet,
          receivedAt: payload.sentAt,
          count: (current.count ?? 1) + 1,
          sessionId: payload.sessionId,
          campaignId: payload.campaignId ?? current.campaignId ?? null,
        };
      } else {
        items.push({
          debtorId: debtor.id,
          debtorName: debtor.name,
          debtorRut: rut,
          snippet,
          campaignId: payload.campaignId ?? null,
          campaignName: null,
          receivedAt: payload.sentAt,
          sessionId: payload.sessionId,
          count: 1,
        });
      }

      let nextSendAt = existing?.nextSendAt ?? new Date(now.getTime() + windowSec * 1000);
      if (!existing?.nextSendAt) {
        nextSendAt = new Date(now.getTime() + windowSec * 1000);
      }
      if (items.length >= maxItems) {
        nextSendAt = now;
      }

      return {
        executiveId: user.id,
        items,
        status: "pending",
        nextSendAt,
      };
    });
  }

  private buildBatchMessage(batch: {
    items: Array<{
      debtorName: string;
      debtorRut: string;
      snippet: string;
      receivedAt: Date;
      count: number;
    }>;
  }): string {
    const items = [...batch.items].sort((a, b) => {
      const aTs = new Date(a.receivedAt).getTime();
      const bTs = new Date(b.receivedAt).getTime();
      return bTs - aTs;
    });
    const now = Date.now();
    const earliest = items.reduce((min, item) => {
      const ts = new Date(item.receivedAt).getTime();
      return Math.min(min, ts);
    }, now);
    const minutes = Math.max(1, Math.round((now - earliest) / 60000));
    const totalResponses = items.reduce((sum, item) => sum + (item.count ?? 1), 0);

    const lines = items.map((item) => {
      const extra = item.count > 1 ? ` (+${item.count - 1})` : "";
      return `${item.debtorName} -- RUT ${item.debtorRut} -- '${item.snippet}'${extra}`;
    });

    return [`${totalResponses} nuevas respuestas (ultimos ${minutes} min)`, ...lines].join("\n");
  }

  private async processDueBatches(): Promise<void> {
    let batch = await storage.claimNextNotificationBatch(new Date());
    while (batch) {
      const current = batch;
      try {
        const user = await storage.getUser(current.executiveId);
        if (!user) {
          await storage.createSystemLog({
            level: "warning",
            source: "notify",
            message: "Notification batch dropped (executive not found)",
            metadata: { batchId: current.id, executiveId: current.executiveId },
          });
          await storage.markNotificationBatchSent(current.id);
          batch = await storage.claimNextNotificationBatch(new Date());
          continue;
        }

        if (!user.notifyEnabled || !user.executivePhone) {
          await storage.createSystemLog({
            level: "info",
            source: "notify",
            message: "Notification batch skipped (disabled or missing phone)",
            metadata: { batchId: current.id, executiveId: user.id },
          });
          await storage.markNotificationBatchSent(current.id);
          batch = await storage.claimNextNotificationBatch(new Date());
          continue;
        }

        const notifySessionId = whatsappManager.getConnectedNotifySessionId();
        if (!notifySessionId) {
          const nextSendAt = new Date(Date.now() + 60_000);
          await storage.rescheduleNotificationBatch(current.id, nextSendAt);
          await storage.createSystemLog({
            level: "warning",
            source: "notify",
            message: "Notification batch delayed (no notify session connected)",
            metadata: { batchId: current.id, executiveId: user.id, nextSendAt },
          });
          batch = await storage.claimNextNotificationBatch(new Date());
          continue;
        }

        const message = this.buildBatchMessage(current);
        await whatsappManager.sendMessage(notifySessionId, user.executivePhone, message);

        await storage.markNotificationBatchSent(current.id);

        await storage.createSystemLog({
          level: "info",
          source: "notify",
          message: "Notification batch sent",
          metadata: {
            batchId: current.id,
            executiveId: user.id,
            count: current.items.length,
          },
        });
      } catch (error: any) {
        const nextSendAt = new Date(Date.now() + 60_000);
        await storage.rescheduleNotificationBatch(current.id, nextSendAt);
        await storage.createSystemLog({
          level: "error",
          source: "notify",
          message: "Notification batch failed; rescheduled",
          metadata: {
            batchId: current.id,
            error: error?.message ?? String(error),
            nextSendAt,
          },
        });
      }

      batch = await storage.claimNextNotificationBatch(new Date());
    }
  }
}

export const notificationService = new NotificationService();
