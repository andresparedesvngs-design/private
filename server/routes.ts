import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { whatsappManager } from "./whatsappManager";
import { campaignEngine } from "./campaignEngine";
import { insertSessionSchema, insertPoolSchema, insertCampaignSchema, insertDebtorSchema } from "@shared/schema";
import { z } from "zod";
import multer from "multer";

const upload = multer({ dest: 'uploads/' });

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  (app as any).io = io;
  whatsappManager.setSocketServer(io);
  campaignEngine.setSocketServer(io);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  await whatsappManager.restoreSessions();

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
        status: 'initializing'
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

  app.get("/api/logs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getSystemLogs(limit);
      res.json(logs);
    } catch (error: any) {
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
        await storage.updateSession(req.params.id, {
          messagesSent: (session.messagesSent || 0) + 1,
          lastActive: new Date()
        });

        await storage.createMessage({
          sessionId: req.params.id,
          content: message,
          status: 'sent',
          sentAt: new Date()
        });

        await storage.createSystemLog({
          level: 'info',
          source: 'manual',
          message: `Manual message sent to ${phone}`,
          metadata: { sessionId: req.params.id, phone }
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

  return httpServer;
}
