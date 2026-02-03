import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { whatsappManager } from "./whatsappManager";
import { campaignEngine } from "./campaignEngine";
import { bindAuthToSocket } from "./auth";
import {
  insertSessionSchema,
  insertPoolSchema,
  insertGsmLineSchema,
  insertGsmPoolSchema,
  insertCampaignSchema,
  insertDebtorSchema,
  insertContactSchema,
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";

const upload = multer({ dest: 'uploads/' });

export async function registerRoutes(
  httpServer: Server,
  app: Express,
  sessionMiddleware: RequestHandler
): Promise<Server> {
  const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5000";
  
  const io = new SocketServer(httpServer, {
    cors: {
      origin: CORS_ORIGIN,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  bindAuthToSocket(io, sessionMiddleware);

  (app as any).io = io;
  whatsappManager.setSocketServer(io);
  campaignEngine.setSocketServer(io);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // RESTAURAR SESIONES DESPUÉS de configurar el socket
  // pero ANTES de las rutas
  const autoRestore =
    String(process.env.WHATSAPP_AUTO_RESTORE ?? "true").toLowerCase() !== "false";
  if (autoRestore) {
    try {
      console.log('=== INICIANDO RESTAURACIÓN DE SESIONES ===');
      await whatsappManager.restoreSessions();
      console.log('=== RESTAURACIÓN DE SESIONES COMPLETADA ===');
    } catch (error) {
      console.error('Error al restaurar sesiones:', error);
    }
  } else {
    console.log('=== AUTO RESTAURACIÓN DESACTIVADA ===');
  }

  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions", async (req, res) => {
    try {
      const sessions = await storage.getSessions();
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const session = await storage.createSession({
        status: 'initializing',
        messagesSent: 0
      });
      
      await whatsappManager.createSession(session.id);
      
      io.emit('session:created', session);
      
      res.status(201).json(session);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.updateSession(req.params.id, req.body);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      io.emit('session:updated', session);
      
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    try {
      await whatsappManager.destroySession(req.params.id);
      await storage.deleteSession(req.params.id);
      
      io.emit('session:deleted', { id: req.params.id });
      
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/reconnect", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      await whatsappManager.destroySession(req.params.id);
      
      await storage.updateSession(req.params.id, {
        status: 'initializing',
        qrCode: null
      });

      await whatsappManager.createSession(req.params.id);
      
      io.emit('session:reconnecting', { id: req.params.id });
      
      res.json({ message: 'Reconnection initiated', sessionId: req.params.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/reset-auth", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      await whatsappManager.resetSessionAuth(req.params.id);

      io.emit("session:reconnecting", { id: req.params.id });

      res.json({ message: "Auth reset initiated", sessionId: req.params.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/qr", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const schema = z.object({
        windowMs: z.number().int().positive().optional(),
      });
      const { windowMs } = schema.parse(req.body ?? {});

      const result = await whatsappManager.openQrWindow(req.params.id, windowMs);
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/pools", async (req, res) => {
    try {
      const pools = await storage.getPools();
      res.json(pools);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/pools/:id", async (req, res) => {
    try {
      const pool = await storage.getPool(req.params.id);
      if (!pool) {
        return res.status(404).json({ error: "Pool not found" });
      }
      res.json(pool);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/pools", async (req, res) => {
    try {
      const validated = insertPoolSchema.parse(req.body);
      const pool = await storage.createPool(validated);
      res.status(201).json(pool);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/pools/:id", async (req, res) => {
    try {
      const pool = await storage.updatePool(req.params.id, req.body);
      if (!pool) {
        return res.status(404).json({ error: "Pool not found" });
      }
      res.json(pool);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/pools/:id", async (req, res) => {
    try {
      await storage.deletePool(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gsm-lines", async (req, res) => {
    try {
      const lines = await storage.getGsmLines();
      res.json(lines);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gsm-lines/:id", async (req, res) => {
    try {
      const line = await storage.getGsmLine(req.params.id);
      if (!line) {
        return res.status(404).json({ error: "GSM line not found" });
      }
      res.json(line);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gsm-lines", async (req, res) => {
    try {
      const validated = insertGsmLineSchema.parse(req.body);
      const line = await storage.createGsmLine(validated);
      res.status(201).json(line);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/gsm-lines/:id", async (req, res) => {
    try {
      const line = await storage.updateGsmLine(req.params.id, req.body);
      if (!line) {
        return res.status(404).json({ error: "GSM line not found" });
      }
      res.json(line);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/gsm-lines/:id", async (req, res) => {
    try {
      await storage.deleteGsmLine(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gsm-pools", async (req, res) => {
    try {
      const pools = await storage.getGsmPools();
      res.json(pools);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gsm-pools/:id", async (req, res) => {
    try {
      const pool = await storage.getGsmPool(req.params.id);
      if (!pool) {
        return res.status(404).json({ error: "GSM pool not found" });
      }
      res.json(pool);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gsm-pools", async (req, res) => {
    try {
      const validated = insertGsmPoolSchema.parse(req.body);
      const pool = await storage.createGsmPool(validated);
      res.status(201).json(pool);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/gsm-pools/:id", async (req, res) => {
    try {
      const pool = await storage.updateGsmPool(req.params.id, req.body);
      if (!pool) {
        return res.status(404).json({ error: "GSM pool not found" });
      }
      res.json(pool);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/gsm-pools/:id", async (req, res) => {
    try {
      await storage.deleteGsmPool(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/campaigns", async (req, res) => {
    try {
      const campaigns = await storage.getCampaigns();
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const validated = insertCampaignSchema.parse(req.body);
      const campaign = await storage.createCampaign(validated);
      res.status(201).json(campaign);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/campaigns/:id", async (req, res) => {
    try {
      const campaign = await storage.updateCampaign(req.params.id, req.body);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      io.emit('campaign:updated', campaign);
      
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/campaigns/:id/start", async (req, res) => {
    try {
      await campaignEngine.startCampaign(req.params.id);
      
      const campaign = await storage.updateCampaign(req.params.id, {
        status: "active",
        startedAt: new Date()
      });
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      io.emit('campaign:started', campaign);
      
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/campaigns/:id/pause", async (req, res) => {
    try {
      await campaignEngine.stopCampaign(req.params.id);
      
      const campaign = await storage.getCampaign(req.params.id);
      
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      io.emit('campaign:paused', campaign);
      
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/campaigns/:id/retry-failed", async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const count = await storage.resetDebtorsForCampaign(req.params.id, ["fallado"]);

      await storage.createSystemLog({
        level: "info",
        source: "campaign",
        message: `Retry failed debtors for campaign ${campaign.name}`,
        metadata: { campaignId: campaign.id, count },
      });

      res.json({ success: true, count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    try {
      await storage.deleteCampaign(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debtors", async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const debtors = await storage.getDebtors(campaignId);
      res.json(debtors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contacts", async (req, res) => {
    try {
      const rawLimit = req.query.limit as string | undefined;
      const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit && parsedLimit > 0
          ? parsedLimit
          : undefined;
      const contacts = await storage.getContacts(limit);
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const payload = insertContactSchema.partial().parse(req.body);
      const updated = await storage.updateContact(req.params.id, payload);
      if (!updated) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debtors/:id", async (req, res) => {
    try {
      const debtor = await storage.getDebtor(req.params.id);
      if (!debtor) {
        return res.status(404).json({ error: "Debtor not found" });
      }
      res.json(debtor);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/debtors", async (req, res) => {
    try {
      const validated = insertDebtorSchema.parse(req.body);
      const debtor = await storage.createDebtor(validated);
      res.status(201).json(debtor);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/debtors/bulk", async (req, res) => {
    try {
      const debtors = z.array(insertDebtorSchema).parse(req.body);
      const created = await storage.createDebtors(debtors);
      res.status(201).json(created);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/debtors/:id", async (req, res) => {
    try {
      const debtor = await storage.updateDebtor(req.params.id, req.body);
      if (!debtor) {
        return res.status(404).json({ error: "Debtor not found" });
      }
      res.json(debtor);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/debtors/:id", async (req, res) => {
    try {
      await storage.deleteDebtor(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/messages", async (req, res) => {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const messages = await storage.getMessages(campaignId);
      res.json(messages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/messages/conversation/read", async (req, res) => {
    try {
      const schema = z.object({
        phone: z.string().min(3),
        read: z.boolean().optional().default(true),
      });
      const { phone, read } = schema.parse(req.body);

      const count = await storage.markMessagesReadByPhone(phone, read);

      await storage.createSystemLog({
        level: "info",
        source: "messages",
        message: read
          ? `Marked conversation as read (${phone})`
          : `Marked conversation as unread (${phone})`,
        metadata: { phone, read, count },
      });

      res.json({ success: true, count });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/messages/conversation/archive", async (req, res) => {
    try {
      const schema = z.object({
        phone: z.string().min(3),
        archived: z.boolean().optional().default(true),
      });
      const { phone, archived } = schema.parse(req.body);

      const count = await storage.archiveMessagesByPhone(phone, archived);

      await storage.createSystemLog({
        level: "info",
        source: "messages",
        message: archived
          ? `Archived conversation (${phone})`
          : `Unarchived conversation (${phone})`,
        metadata: { phone, archived, count },
      });

      res.json({ success: true, count });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/messages/conversation/delete", async (req, res) => {
    try {
      const schema = z.object({
        phone: z.string().min(3),
      });
      const { phone } = schema.parse(req.body);

      const count = await storage.deleteMessagesByPhone(phone);

      await storage.createSystemLog({
        level: "warning",
        source: "messages",
        message: `Deleted conversation (${phone})`,
        metadata: { phone, count },
      });

      res.json({ success: true, count });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/logs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getSystemLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/settings/whatsapp-polling", async (_req, res) => {
    try {
      res.json(whatsappManager.getPollingSettings());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings/whatsapp-polling", async (req, res) => {
    try {
      const schema = z.object({
        enabled: z.boolean(),
        intervalMs: z.number().int().positive().optional().nullable(),
      });
      const { enabled, intervalMs } = schema.parse(req.body);

      whatsappManager.setPollingInterval(intervalMs);
      whatsappManager.setPollingEnabled(enabled);

      await storage.createSystemLog({
        level: "info",
        source: "whatsapp",
        message: `Incoming polling ${enabled ? "enabled" : "disabled"} from settings`,
        metadata: {
          enabled,
          intervalMs: intervalMs ?? null,
        },
      });

      res.json(whatsappManager.getPollingSettings());
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/settings/campaign-window", async (_req, res) => {
    try {
      res.json(campaignEngine.getSendWindowSettings());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings/campaign-window", async (req, res) => {
    try {
      const schema = z.object({
        enabled: z.boolean().optional(),
        startTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
        endTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      });
      const payload = schema.parse(req.body);

      campaignEngine.setSendWindowSettings(payload);

      await storage.createSystemLog({
        level: "info",
        source: "campaign",
        message: "Updated campaign send window settings",
        metadata: payload,
      });

      res.json(campaignEngine.getSendWindowSettings());
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/settings/campaign-pauses", async (_req, res) => {
    try {
      res.json(campaignEngine.getCampaignPauseSettings());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings/campaign-pauses", async (req, res) => {
    try {
      const schema = z.object({
        enabled: z.boolean().optional(),
        strategy: z.enum(["auto", "fixed"]).optional(),
        targetPauses: z.number().int().nonnegative().optional(),
        everyMessages: z.number().int().positive().optional(),
        minMessages: z.number().int().positive().optional(),
        durationsMinutes: z.array(z.number().int().positive()).optional(),
        durationsMode: z.enum(["list", "range"]).optional(),
        applyToWhatsapp: z.boolean().optional(),
        applyToSms: z.boolean().optional(),
      });
      const payload = schema.parse(req.body);

      campaignEngine.setCampaignPauseSettings(payload);

      await storage.createSystemLog({
        level: "info",
        source: "campaign",
        message: "Updated campaign pause settings",
        metadata: payload,
      });

      res.json(campaignEngine.getCampaignPauseSettings());
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Send manual message from a session
  app.post("/api/sessions/:id/send", async (req, res) => {
    try {
      const { phone, message } = req.body;
      
      if (!phone || !message) {
        return res.status(400).json({ error: "Phone and message are required" });
      }

      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status !== 'connected') {
        return res.status(400).json({ error: "Session is not connected" });
      }

      const success = await whatsappManager.sendMessage(req.params.id, phone, message);
      
      if (success) {
        const debtor = await storage.getDebtorByPhone(phone);

        if (debtor?.id) {
          await storage.updateDebtor(debtor.id, {
            lastContact: new Date(),
          });
        }

        const createdMessage = await storage.createMessage({
          sessionId: req.params.id,
          debtorId: debtor?.id,
          campaignId: debtor?.campaignId,
          phone,
          content: message,
          status: 'sent',
          sentAt: new Date()
        });

        io.emit('message:created', createdMessage);

        await storage.createSystemLog({
          level: 'info',
          source: 'manual',
          message: `Manual message sent to ${phone}`,
          metadata: {
            sessionId: req.params.id,
            phone,
            debtorId: debtor?.id,
            campaignId: debtor?.campaignId,
          }
        });

        res.json({ success: true, message: "Message sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reset all debtors to disponible status
  app.post("/api/debtors/cleanup", async (req, res) => {
    try {
      const cleanupSchema = z.object({
        statuses: z.array(z.string()).optional(),
        deleteAll: z.boolean().optional().default(false),
      });

      const { statuses, deleteAll } = cleanupSchema.parse(req.body);

      if (!deleteAll && (!statuses || statuses.length === 0)) {
        return res.status(400).json({
          error: "Debes indicar estados o usar deleteAll=true",
        });
      }

      const count = await storage.cleanupDebtors(deleteAll ? undefined : statuses);

      await storage.createSystemLog({
        level: "warning",
        source: "system",
        message: deleteAll
          ? `Cleanup: deleted ALL debtors (${count})`
          : `Cleanup: deleted ${count} debtors`,
        metadata: { count, deleteAll, statuses: statuses ?? [] },
      });

      res.json({ success: true, count });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Reset all debtors to disponible status
  app.post("/api/debtors/reset", async (req, res) => {
    try {
      const count = await storage.resetDebtorsStatus();
      
      await storage.createSystemLog({
        level: 'info',
        source: 'system',
        message: `Reset ${count} debtors to disponible status`,
        metadata: { count }
      });

      res.json({ success: true, count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Release debtors from campaigns (keep status, clear campaignId)
  app.post("/api/debtors/release", async (req, res) => {
    try {
      const schema = z.object({
        statuses: z.array(z.string()).min(1),
      });
      const { statuses } = schema.parse(req.body);

      const count = await storage.releaseDebtorsByStatus(statuses);

      await storage.createSystemLog({
        level: "info",
        source: "system",
        message: `Released ${count} debtors from campaigns`,
        metadata: { count, statuses },
      });

      res.json({ success: true, count });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}

