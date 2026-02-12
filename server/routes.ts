import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import { whatsappManager } from "./whatsappManager";
import { campaignEngine } from "./campaignEngine";
import { proxyMonitor } from "./proxyMonitor";
import { bindAuthToSocket, type AuthUser } from "./auth";
import bcrypt from "bcryptjs";
import { notificationService } from "./notificationService";
import {
  insertSessionSchema,
  insertProxyServerSchema,
  insertPoolSchema,
  insertGsmLineSchema,
  insertGsmPoolSchema,
  insertCampaignSchema,
  insertDebtorSchema,
  insertContactSchema,
} from "@shared/schema";
import { z } from "zod";
import * as XLSX from "xlsx";

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
  proxyMonitor.setSocketServer(io);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  const getAuthUser = (req: any) => req.user as AuthUser | undefined;

  const ensureRole = (
    req: any,
    res: any,
    roles: Array<AuthUser["role"]>
  ): AuthUser | null => {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ error: "No autenticado" });
      return null;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "No autorizado" });
      return null;
    }
    return user;
  };

  const isAdmin = (user?: AuthUser | null) => user?.role === "admin";
  const isSupervisor = (user?: AuthUser | null) => user?.role === "supervisor";
  const isExecutive = (user?: AuthUser | null) => user?.role === "executive";

  const normalizePhoneDigits = (value?: string | null) =>
    (value ?? "").replace(/\D/g, "");

  type CidrRange = { base: number; mask: number; raw: string };

  const parseIpv4 = (value: string): number | null => {
    const parts = value.trim().split(".");
    if (parts.length !== 4) return null;
    const numbers = parts.map((part) => Number(part));
    if (numbers.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) {
      return null;
    }
    return (
      ((numbers[0] << 24) >>> 0) +
      ((numbers[1] << 16) >>> 0) +
      ((numbers[2] << 8) >>> 0) +
      (numbers[3] >>> 0)
    ) >>> 0;
  };

  const parseCidr = (value: string): CidrRange | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const [ip, maskRaw] = trimmed.split("/");
    const base = parseIpv4(ip);
    if (base === null) return null;
    const maskBits = maskRaw ? Number(maskRaw) : 32;
    if (!Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) {
      return null;
    }
    const mask =
      maskBits === 0 ? 0 : ((~((1 << (32 - maskBits)) - 1)) >>> 0);
    return { base, mask, raw: trimmed };
  };

  const buildAllowedProxyRanges = (): CidrRange[] => {
    const raw = String(
      process.env.PROXY_ALLOWED_SUBNETS ?? "172.16.55.0/24"
    );
    const candidates = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    const ranges = candidates.map(parseCidr).filter(Boolean) as CidrRange[];
    if (ranges.length > 0) return ranges;
    const fallback = parseCidr("172.16.55.0/24");
    return fallback ? [fallback] : [];
  };

  const allowedProxyRanges = buildAllowedProxyRanges();

  const isProxyHostAllowed = (host: string): boolean => {
    const ip = parseIpv4(host);
    if (ip === null) return false;
    if (!allowedProxyRanges.length) return false;
    return allowedProxyRanges.some((range) => (ip & range.mask) === (range.base & range.mask));
  };

  const validateProxyHost = (host: string): string | null => {
    if (!host.trim()) return "Host requerido";
    if (!isProxyHostAllowed(host)) {
      return "Host fuera de las subredes permitidas";
    }
    return null;
  };

  type VerifyDebtorInput = {
    rut?: string | null;
    phone: string;
  };

  type VerifyDebtorResult = {
    rut: string | null;
    phone: string;
    whatsapp: boolean;
    wa_id: string | null;
    verifiedBy: string | null;
    verifiedAt: Date;
  };

  const withTimeout = async <T>(
    promise: Promise<T>,
    timeoutMs: number,
    label: string
  ): Promise<T> => {
    let settled = false;
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`${label} timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        });
    });
  };

  const RECONNECT_DESTROY_TIMEOUT_MS = (() => {
    const raw = Number(process.env.WHATSAPP_RECONNECT_DESTROY_TIMEOUT_MS ?? "15000");
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15000;
  })();

  const RECONNECT_CREATE_TIMEOUT_MS = (() => {
    const raw = Number(process.env.WHATSAPP_RECONNECT_CREATE_TIMEOUT_MS ?? "30000");
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30000;
  })();

  const RESET_AUTH_ROUTE_TIMEOUT_MS = (() => {
    const raw = Number(process.env.WHATSAPP_RESET_AUTH_ROUTE_TIMEOUT_MS ?? "45000");
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 45000;
  })();

  const QR_ROUTE_TIMEOUT_MS = (() => {
    const raw = Number(process.env.WHATSAPP_QR_ROUTE_TIMEOUT_MS ?? "10000");
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10000;
  })();

  const sessionBusyLocks = new Set<string>();
  const isSessionBusyStatus = (status?: string | null) =>
    status === "initializing" || status === "reconnecting";

  const isSessionBusy = (sessionId: string, status?: string | null) =>
    sessionBusyLocks.has(sessionId) || isSessionBusyStatus(status);

  const extractWaId = (value: any): string | null => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      if (typeof value._serialized === "string") return value._serialized;
      const user = value.user ?? value.id ?? value._id;
      const server = value.server ?? "c.us";
      if (user) return `${user}@${server}`;
    }
    return null;
  };

  const splitDebtorsAcrossSessions = (
    debtors: VerifyDebtorInput[],
    sessionIds: string[]
  ): Map<string, VerifyDebtorInput[]> => {
    const assignments = new Map<string, VerifyDebtorInput[]>();
    if (!sessionIds.length) return assignments;
    sessionIds.forEach((id) => assignments.set(id, []));
    debtors.forEach((debtor, index) => {
      const sessionId = sessionIds[index % sessionIds.length];
      const bucket = assignments.get(sessionId);
      if (bucket) {
        bucket.push(debtor);
      }
    });
    return assignments;
  };

  const verifyDebtorsWithSession = async (
    sessionId: string,
    debtors: VerifyDebtorInput[]
  ): Promise<VerifyDebtorResult[]> => {
    const results: VerifyDebtorResult[] = [];
    const session = whatsappManager.getSession(sessionId);
    if (!session) {
      await storage.createSystemLog({
        level: "warning",
        source: "whatsapp",
        message: `Session ${sessionId} not available for WhatsApp verification`,
        metadata: { sessionId },
      });
      const now = new Date();
      return debtors.map((debtor) => ({
        rut: debtor.rut ?? null,
        phone: debtor.phone,
        whatsapp: false,
        wa_id: null,
        verifiedBy: sessionId,
        verifiedAt: now,
      }));
    }

    const client = session.client as any;
    let errorCount = 0;
    let lastError: string | null = null;

    for (const debtor of debtors) {
      const verifiedAt = new Date();
      try {
        const normalized = whatsappManager.normalizePhoneForWhatsapp(debtor.phone);
        if (!normalized) {
          results.push({
            rut: debtor.rut ?? null,
            phone: debtor.phone,
            whatsapp: false,
            wa_id: null,
            verifiedBy: sessionId,
            verifiedAt,
          });
          continue;
        }

        const numberId = await withTimeout(
          client.getNumberId(normalized),
          5000,
          "getNumberId"
        );
        const waId = extractWaId(numberId);
        results.push({
          rut: debtor.rut ?? null,
          phone: debtor.phone,
          whatsapp: Boolean(waId),
          wa_id: waId,
          verifiedBy: sessionId,
          verifiedAt,
        });
      } catch (error: any) {
        errorCount += 1;
        lastError = error?.message ?? String(error);
        results.push({
          rut: debtor.rut ?? null,
          phone: debtor.phone,
          whatsapp: false,
          wa_id: null,
          verifiedBy: sessionId,
          verifiedAt,
        });
      }
    }

    if (errorCount > 0) {
      await storage.createSystemLog({
        level: "warning",
        source: "whatsapp",
        message: `Errors while verifying WhatsApp numbers with session ${sessionId}`,
        metadata: { sessionId, errorCount, lastError },
      });
    }

    return results;
  };

  const matchesPhone = (raw: string, candidate: string) => {
    const a = normalizePhoneDigits(raw);
    const b = normalizePhoneDigits(candidate);
    if (!a || !b) return false;
    return a === b || a.endsWith(b) || b.endsWith(a);
  };

  // RESTAURAR SESIONES DESPUÉS de configurar el socket
  // pero ANTES de las rutas
  const autoRestore =
    String(process.env.WHATSAPP_AUTO_RESTORE ?? "true").toLowerCase() !== "false";
  const autoRestoreBackground =
    String(process.env.WHATSAPP_AUTO_RESTORE_BACKGROUND ?? "true").toLowerCase() !== "false";

  const runSessionRestore = async () => {
    try {
      console.log("=== STARTING SESSION RESTORE ===");
      await whatsappManager.restoreSessions();
      console.log("=== SESSION RESTORE COMPLETED ===");
    } catch (error) {
      console.error("Error restoring sessions:", error);
    }
  };

  if (autoRestore) {
    if (autoRestoreBackground) {
      console.log("=== SESSION RESTORE RUNNING IN BACKGROUND ===");
      void runSessionRestore();
    } else {
      await runSessionRestore();
    }
  } else {
    console.log("=== AUTO RESTORE DISABLED ===");
  }

  notificationService.start();
  proxyMonitor.start();

  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      if (isExecutive(user)) {
        const [campaigns, debtors] = await Promise.all([
          storage.getCampaigns(user.id),
          storage.getDebtors(undefined, user.id),
        ]);
        const debtorIds = debtors.map((debtor) => debtor.id);
        const phones = debtors.map((debtor) => debtor.phone);
        const messages = await storage.getMessages(undefined, debtorIds, phones);
        const messagesSent = messages.filter((message) => message.status === "sent").length;

        res.json({
          totalSessions: 0,
          activeSessions: 0,
          totalCampaigns: campaigns.length,
          activeCampaigns: campaigns.filter((campaign) => campaign.status === "active").length,
          totalDebtors: debtors.length,
          messagesSent,
        });
        return;
      }

      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const sessions = await storage.getSessions();
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions/health", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }

      const sessions = await storage.getSessions();
      const runtime = whatsappManager.getSessionHealthSnapshot({
        includeNotify: true,
      });
      const runtimeById = new Map(runtime.map((entry) => [entry.sessionId, entry]));

      const response = sessions.map((session) => {
        const runtimeEntry = runtimeById.get(session.id);
        return {
          sessionId: session.id,
          phoneNumber: session.phoneNumber ?? null,
          status: runtimeEntry?.status ?? session.status,
          verifiedConnected: runtimeEntry?.verifiedConnected ?? false,
          lastVerifiedAt: runtimeEntry?.lastVerifiedAt ?? null,
          lastVerifyError: runtimeEntry?.lastVerifyError ?? null,
          lastActive: session.lastActive ?? null,
          messagesSent: session.messagesSent ?? 0,
        };
      });

      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/verify-now", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }

      const result = await whatsappManager.verifyNow();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      const user = ensureRole(req, res, ["admin", "supervisor"]);
      if (!user) return;
      const schema = z.object({
        purpose: z.string().optional(),
        proxyServerId: z.string().optional().nullable(),
        proxyLocked: z.boolean().optional(),
      });
      const { purpose, proxyServerId, proxyLocked } = schema.parse(req.body ?? {});
      const normalizedPurpose = purpose?.trim();
      if (normalizedPurpose && normalizedPurpose !== "default" && normalizedPurpose !== "notify") {
        return res.status(400).json({ error: "Invalid session purpose" });
      }
      if (normalizedPurpose === "notify" && !isAdmin(user)) {
        return res.status(403).json({ error: "No autorizado" });
      }
      if (proxyServerId) {
        const proxy = await storage.getProxyServer(proxyServerId);
        if (!proxy) {
          return res.status(404).json({ error: "ProxyServer no encontrado" });
        }
        if (!proxy.enabled) {
          return res.status(400).json({ error: "ProxyServer deshabilitado" });
        }
        if (proxy.status === "offline") {
          return res.status(409).json({ error: "ProxyServer offline" });
        }
      }
      const session = await storage.createSession({
        status: 'initializing',
        messagesSent: 0,
        purpose: normalizedPurpose ?? "default",
        proxyServerId: proxyServerId ?? null,
        proxyLocked: proxyServerId ? (proxyLocked ?? true) : false,
        disconnectCount: 0,
        authFailureCount: 0,
        resetAuthCount: 0,
        reconnectCount: 0,
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
      const user = ensureRole(req, res, ["admin", "supervisor"]);
      if (!user) return;
      const payload = insertSessionSchema.partial().parse(req.body ?? {});
      if (payload.purpose && !["default", "notify"].includes(payload.purpose)) {
        return res.status(400).json({ error: "Invalid session purpose" });
      }
      if (payload.purpose === "notify" && !isAdmin(user)) {
        return res.status(403).json({ error: "No autorizado" });
      }

      const wantsProxyChange = payload.proxyServerId !== undefined;
      const wantsProxyLockChange = payload.proxyLocked !== undefined;
      if ((wantsProxyChange || wantsProxyLockChange) && !isAdmin(user)) {
        return res.status(403).json({ error: "No autorizado" });
      }

      const existing = await storage.getSession(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (wantsProxyChange) {
        const targetProxyId = payload.proxyServerId ?? null;
        const currentProxyId = existing.proxyServerId ?? null;
        const isDifferent = targetProxyId !== currentProxyId;

        if (isDifferent) {
          if (existing.proxyLocked && payload.proxyLocked !== false) {
            return res.status(409).json({ error: "Proxy bloqueado para cambios" });
          }

          if (!["disconnected", "auth_failed"].includes(existing.status)) {
            return res.status(409).json({
              error: "La sesión debe estar detenida para cambiar proxy",
            });
          }

          if (whatsappManager.getSession(existing.id)) {
            return res.status(409).json({
              error: "Detén la sesión antes de cambiar el proxy",
            });
          }

          if (currentProxyId && targetProxyId) {
            const currentProxy = await storage.getProxyServer(currentProxyId);
            if (currentProxy && currentProxy.status === "online") {
              return res.status(409).json({
                error: "El proxy actual no está en mal estado",
              });
            }
          }

          if (targetProxyId) {
            const targetProxy = await storage.getProxyServer(targetProxyId);
            if (!targetProxy) {
              return res.status(404).json({ error: "ProxyServer no encontrado" });
            }
            if (!targetProxy.enabled) {
              return res.status(400).json({ error: "ProxyServer deshabilitado" });
            }
            if (targetProxy.status === "offline") {
              return res.status(409).json({ error: "ProxyServer offline" });
            }
          }
        }
      }

      const session = await storage.updateSession(req.params.id, payload);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (payload.purpose !== undefined) {
        whatsappManager.setSessionPurpose(req.params.id, payload.purpose);
      }
      
      io.emit('session:updated', session);
      
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      // Don't block the HTTP response on whatsapp-web.js teardown, which can hang in some cases.
      // For deletions we also remove LocalAuth state so re-creating the session is a clean slate.
      void whatsappManager.destroySession(req.params.id, { removeAuth: true });
      await storage.deleteSession(req.params.id);
      
      io.emit('session:deleted', { id: req.params.id });
      
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/reconnect", async (req, res) => {
    const sessionId = req.params.id;
    console.log(`[routes][sessions][${sessionId}] reconnect requested`);

    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status === "auth_failed") {
        console.warn(
          `[routes][sessions][${sessionId}] reconnect blocked: reset-auth required`
        );
        return res.status(409).json({
          error: "reset_required",
          message: "Session requires reset-auth before reconnect",
          sessionId,
        });
      }

      if (isSessionBusy(sessionId, session.status)) {
        console.warn(`[routes][sessions][${sessionId}] reconnect blocked: busy`);
        return res.status(409).json({
          error: "busy",
          message: "Session is busy",
          sessionId,
        });
      }

      sessionBusyLocks.add(sessionId);
      const reconnectAt = new Date();
      console.log(`[routes][sessions][${sessionId}] reconnect start`);

      try {
        await storage.updateSession(sessionId, {
          status: "reconnecting",
          qrCode: null,
        });

        await withTimeout(
          whatsappManager.destroySession(sessionId),
          RECONNECT_DESTROY_TIMEOUT_MS,
          `reconnect destroy session ${sessionId}`
        );

        await storage.updateSession(sessionId, {
          status: "initializing",
          qrCode: null,
          reconnectCount: (session.reconnectCount ?? 0) + 1,
          lastReconnectAt: reconnectAt,
        });

        await withTimeout(
          whatsappManager.createSession(sessionId),
          RECONNECT_CREATE_TIMEOUT_MS,
          `reconnect create session ${sessionId}`
        );
      } catch (error: any) {
        const message = error?.message ?? String(error);
        const nextStatus = /auth/i.test(message) ? "auth_failed" : "disconnected";
        console.error(`[routes][sessions][${sessionId}] reconnect failed:`, message);

        await storage.updateSession(sessionId, {
          status: nextStatus,
        });

        await storage.createSystemLog({
          level: "error",
          source: "whatsapp",
          message: `Reconnect failed for session ${sessionId}`,
          metadata: { sessionId, error: message },
        });

        return res.status(500).json({
          error: "reconnect_failed",
          message: "No se pudo reconectar la sesión",
          details: message,
          sessionId,
        });
      } finally {
        sessionBusyLocks.delete(sessionId);
      }

      io.emit("session:reconnecting", { id: sessionId });
      console.log(`[routes][sessions][${sessionId}] reconnect initiated`);

      res.json({ message: "Reconnection initiated", sessionId });
    } catch (error: any) {
      console.error(
        `[routes][sessions][${sessionId}] reconnect unexpected error:`,
        error?.message ?? error
      );
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/reset-auth", async (req, res) => {
    const sessionId = req.params.id;
    console.log(`[routes][sessions][${sessionId}] reset-auth requested`);

    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (isSessionBusy(sessionId, session.status)) {
        console.warn(`[routes][sessions][${sessionId}] reset-auth blocked: busy`);
        return res.status(409).json({
          error: "busy",
          message: "Session is busy",
          sessionId,
        });
      }

      sessionBusyLocks.add(sessionId);
      console.log(`[routes][sessions][${sessionId}] reset-auth start`);
      try {
        await withTimeout(
          whatsappManager.resetSessionAuth(sessionId),
          RESET_AUTH_ROUTE_TIMEOUT_MS,
          `reset-auth session ${sessionId}`
        );
      } catch (error: any) {
        const message = error?.message ?? String(error);
        const nextStatus = /auth/i.test(message) ? "auth_failed" : "disconnected";
        console.error(`[routes][sessions][${sessionId}] reset-auth failed:`, message);

        await storage.updateSession(sessionId, { status: nextStatus });
        await storage.createSystemLog({
          level: "error",
          source: "whatsapp",
          message: `Reset-auth failed for session ${sessionId}`,
          metadata: { sessionId, error: message },
        });

        return res.status(500).json({
          error: "reset_auth_failed",
          message: "No se pudo reiniciar auth",
          details: message,
          sessionId,
        });
      } finally {
        sessionBusyLocks.delete(sessionId);
      }

      io.emit("session:reconnecting", { id: sessionId });
      console.log(`[routes][sessions][${sessionId}] reset-auth initiated`);
      res.json({ message: "Auth reset initiated", sessionId });
    } catch (error: any) {
      console.error(
        `[routes][sessions][${sessionId}] reset-auth unexpected error:`,
        error?.message ?? error
      );
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/stop", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      await whatsappManager.destroySession(req.params.id);

      const updated = await storage.getSession(req.params.id);
      if (updated) {
        io.emit("session:updated", updated);
      }

      res.json({ message: "Session stopped", sessionId: req.params.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions/:id/qr", async (req, res) => {
    const sessionId = req.params.id;
    console.log(`[routes][sessions][${sessionId}] qr requested`);

    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (sessionBusyLocks.has(sessionId)) {
        console.warn(`[routes][sessions][${sessionId}] qr blocked: busy`);
        return res.status(409).json({
          error: "busy",
          message: "Session is busy",
          sessionId,
        });
      }

      const schema = z.object({
        windowMs: z.number().int().positive().optional(),
      });
      const { windowMs } = schema.parse(req.body ?? {});

      const result = await withTimeout(
        whatsappManager.openQrWindow(sessionId, windowMs),
        QR_ROUTE_TIMEOUT_MS,
        `open qr window ${sessionId}`
      );
      console.log(
        `[routes][sessions][${sessionId}] qr result (hasQr=${Boolean(result.qrCode)})`
      );
      res.json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error(
        `[routes][sessions][${sessionId}] qr error:`,
        error?.message ?? error
      );
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/proxy-servers", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const proxies = await storage.getProxyServers();
      res.json(proxies);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/proxy-servers/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const proxy = await storage.getProxyServer(req.params.id);
      if (!proxy) {
        return res.status(404).json({ error: "ProxyServer not found" });
      }
      res.json(proxy);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/proxy-servers", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const schema = insertProxyServerSchema.pick({
        name: true,
        scheme: true,
        host: true,
        port: true,
        enabled: true,
      });
      const payload = schema.parse(req.body ?? {});
      const cleaned = {
        ...payload,
        name: payload.name.trim(),
        host: payload.host.trim(),
      };
      const hostError = validateProxyHost(cleaned.host);
      if (hostError) {
        return res.status(400).json({ error: hostError });
      }
      const proxy = await storage.createProxyServer({
        ...cleaned,
        scheme: "socks5",
        status: "offline",
      });
      if (proxyMonitor) {
        void proxyMonitor.checkNow(proxy.id);
      }
      if (io) {
        io.emit("proxy:updated", {
          id: proxy.id,
          status: proxy.status,
          lastPublicIp: proxy.lastPublicIp ?? null,
          latencyMs: proxy.latencyMs ?? null,
          lastCheckAt: proxy.lastCheckAt ?? null,
          lastSeenAt: proxy.lastSeenAt ?? null,
        });
      }
      res.status(201).json(proxy);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/proxy-servers/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const schema = insertProxyServerSchema.pick({
        name: true,
        scheme: true,
        host: true,
        port: true,
        enabled: true,
      }).partial();
      const payload = schema.parse(req.body ?? {});
      const cleaned: Record<string, any> = { ...payload };
      if (typeof cleaned.name === "string") {
        cleaned.name = cleaned.name.trim();
      }
      if (typeof cleaned.host === "string") {
        cleaned.host = cleaned.host.trim();
      }
      if (cleaned.host) {
        const hostError = validateProxyHost(cleaned.host);
        if (hostError) {
          return res.status(400).json({ error: hostError });
        }
      }
      if (cleaned.scheme && cleaned.scheme !== "socks5") {
        return res.status(400).json({ error: "Scheme inválido" });
      }
      const proxy = await storage.updateProxyServer(req.params.id, cleaned);
      if (!proxy) {
        return res.status(404).json({ error: "ProxyServer not found" });
      }
      let finalProxy = proxy;
      if (payload.enabled === false) {
        const updated = await storage.updateProxyServer(proxy.id, {
          status: "offline",
          lastError: "disabled",
          lastCheckAt: new Date(),
        });
        if (updated) {
          finalProxy = updated;
        }
      } else if (payload.host || payload.port || payload.enabled === true) {
        void proxyMonitor.checkNow(proxy.id);
      }
      if (io) {
        io.emit("proxy:updated", {
          id: finalProxy.id,
          status: finalProxy.status,
          lastPublicIp: finalProxy.lastPublicIp ?? null,
          latencyMs: finalProxy.latencyMs ?? null,
          lastCheckAt: finalProxy.lastCheckAt ?? null,
          lastSeenAt: finalProxy.lastSeenAt ?? null,
        });
      }
      res.json(finalProxy);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/proxy-servers/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const proxy = await storage.disableProxyServer(req.params.id);
      if (!proxy) {
        return res.status(404).json({ error: "ProxyServer not found" });
      }
      if (io) {
        io.emit("proxy:updated", {
          id: proxy.id,
          status: proxy.status,
          lastPublicIp: proxy.lastPublicIp ?? null,
          latencyMs: proxy.latencyMs ?? null,
          lastCheckAt: proxy.lastCheckAt ?? null,
          lastSeenAt: proxy.lastSeenAt ?? null,
        });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/proxy-servers/:id/check", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const updated = await proxyMonitor.checkNow(req.params.id);
      if (!updated) {
        return res.status(404).json({ error: "ProxyServer not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/pools", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor", "executive"])) {
        return;
      }
      const pools = await storage.getPools();
      res.json(pools);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/pools/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor", "executive"])) {
        return;
      }
      const pool = await storage.getPool(req.params.id);
      if (!pool) {
        return res.status(404).json({ error: "Pool not found" });
      }
      res.json(pool);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/pools/:poolId/verify-debtors", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }

      const schema = z.object({
        debtors: z
          .array(
            z.object({
              rut: z.string().optional().nullable(),
              phone: z.string().min(3),
            })
          )
          .min(1),
        export: z.boolean().optional(),
        batchId: z.string().optional(),
        complete: z.boolean().optional(),
        persist: z.boolean().optional(),
      });

      const payload = schema.parse(req.body ?? {});
      const user = getAuthUser(req);
      const pool = await storage.getPool(req.params.poolId);
      if (!pool) {
        return res.status(404).json({ error: "Pool not found" });
      }

      const verifiedInMemory = new Set(
        whatsappManager.getVerifiedConnectedSessionIdsWithOptions({
          includeNotify: false,
        })
      );
      const poolSessionIds = Array.from(
        new Set((pool.sessionIds ?? []).filter((id) => verifiedInMemory.has(id)))
      );

      if (poolSessionIds.length === 0) {
        return res.status(400).json({
          error: "No verified connected sessions available in this pool",
        });
      }

      const assignments = splitDebtorsAcrossSessions(
        payload.debtors,
        poolSessionIds
      );

      const resultsBySession = await Promise.all(
        poolSessionIds.map((sessionId) =>
          verifyDebtorsWithSession(sessionId, assignments.get(sessionId) ?? [])
        )
      );

      const results = resultsBySession.flat();
      const verifiedCount = results.filter((item) => item.whatsapp).length;
      const failedCount = results.length - verifiedCount;
      const exportFlag =
        payload.export === true ||
        String(req.query.export ?? "").toLowerCase() === "xlsx";

      const shouldPersist = payload.persist !== false;
      let batchId = payload.batchId;

      if (shouldPersist) {
        let batch = batchId
          ? await storage.getWhatsAppVerificationBatch(batchId)
          : undefined;

        if (batchId && !batch) {
          return res.status(404).json({ error: "Verification batch not found" });
        }

        if (!batch) {
          const createdBatch = await storage.createWhatsAppVerificationBatch({
            poolId: pool.id,
            requestedBy: user?.id ?? null,
            total: 0,
            verified: 0,
            failed: 0,
            status: "running",
          });
          batchId = createdBatch.id;
          batch = createdBatch;
        }

        const items = results.map((item) => ({
          batchId: batchId!,
          poolId: pool.id,
          rut: item.rut ?? null,
          phone: item.phone,
          whatsapp: item.whatsapp,
          waId: item.wa_id,
          verifiedBy: item.verifiedBy,
          verifiedAt: item.verifiedAt,
        }));

        await storage.createWhatsAppVerifications(items);

        const shouldComplete = payload.complete ?? !payload.batchId;
        await storage.updateWhatsAppVerificationBatch(batchId!, {
          total: (batch?.total ?? 0) + results.length,
          verified: (batch?.verified ?? 0) + verifiedCount,
          failed: (batch?.failed ?? 0) + failedCount,
          status: shouldComplete ? "completed" : "running",
        });
      }

      if (exportFlag) {
        const rows = results.map((item) => ({
          rut: item.rut,
          phone: item.phone,
          whatsapp: item.whatsapp,
          wa_id: item.wa_id,
          verifiedBy: item.verifiedBy,
          verifiedAt: item.verifiedAt.toISOString(),
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "verificacion");
        const buffer = XLSX.write(workbook, {
          type: "buffer",
          bookType: "xlsx",
        });

        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=\"verificacion_whatsapp.xlsx\""
        );
        res.send(buffer);
        return;
      }

      res.json({
        batchId: batchId ?? null,
        checked: results.length,
        verified: verifiedCount,
        failed: failedCount,
        results,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp-verifications/batches", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const limit = Math.max(Number(req.query.limit ?? 20) || 20, 1);
      const batches = await storage.getWhatsAppVerificationBatches(limit);
      res.json(batches);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp-verifications/:batchId", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const limit = Number(req.query.limit ?? 0) || 0;
      const skip = Number(req.query.skip ?? 0) || 0;
      const results = await storage.getWhatsAppVerificationResults(
        req.params.batchId,
        limit,
        skip
      );
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/whatsapp-verifications/:batchId/export", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const results = await storage.getWhatsAppVerificationResults(req.params.batchId);
      const rows = results.map((item) => ({
        rut: item.rut ?? null,
        phone: item.phone,
        whatsapp: item.whatsapp,
        wa_id: item.waId ?? null,
        verifiedBy: item.verifiedBy ?? null,
        verifiedAt: item.verifiedAt ? item.verifiedAt.toISOString() : null,
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "verificacion");
      const buffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="verificacion_whatsapp_${req.params.batchId}.xlsx"`
      );
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/pools", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const pool = await storage.updatePool(req.params.id, req.body);
      if (!pool) {
        return res.status(404).json({ error: "Pool not found" });
      }
      io.emit("pool:updated", { poolId: pool.id });
      res.json(pool);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/pools/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      await storage.deletePool(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gsm-lines", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const lines = await storage.getGsmLines();
      res.json(lines);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gsm-lines/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      await storage.deleteGsmLine(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gsm-pools", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor", "executive"])) {
        return;
      }
      const pools = await storage.getGsmPools();
      res.json(pools);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/gsm-pools/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor", "executive"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      await storage.deleteGsmPool(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/campaigns", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const campaigns = isExecutive(user)
        ? await storage.getCampaigns(user.id)
        : await storage.getCampaigns();
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
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      if (isExecutive(user) && campaign.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const validated = insertCampaignSchema.parse(req.body);
      const payload = { ...validated };
      if (isExecutive(user)) {
        payload.ownerUserId = user.id;
      }
      const campaign = await storage.createCampaign(payload);
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
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const existing = await storage.getCampaign(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (isExecutive(user) && existing.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }
      const payload = { ...req.body };
      if (isExecutive(user)) {
        delete payload.ownerUserId;
      }
      const campaign = await storage.updateCampaign(req.params.id, payload);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      
      io.emit('campaign:updated', campaign);
      
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk upload debtors directly into a campaign (so CampaignEngine won't claim orphans).
  app.post("/api/campaigns/:id/debtors/bulk", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }

      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (isExecutive(user) && campaign.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }

      const debtors = z.array(insertDebtorSchema).parse(req.body);
      const payload = debtors.map((debtor) => {
        const next: any = { ...debtor, campaignId: campaign.id };
        if (isExecutive(user)) {
          next.ownerUserId = user.id;
        }
        return next;
      });

      const created = await storage.createDebtors(payload);

      await storage.createSystemLog({
        level: "info",
        source: "debtors",
        message: `Bulk uploaded ${created.length} debtors to campaign ${campaign.name}`,
        metadata: { campaignId: campaign.id, count: created.length },
      });

      res.status(201).json(created);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/campaigns/:id/start", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const existing = await storage.getCampaign(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (isExecutive(user) && existing.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }
      await campaignEngine.startCampaign(req.params.id);
      
      const campaign = await storage.updateCampaign(req.params.id, {
        status: "active",
        startedAt: new Date(),
        pausedReason: null,
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
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const existing = await storage.getCampaign(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (isExecutive(user) && existing.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }
      await campaignEngine.stopCampaign(req.params.id, "manual");
      
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
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (isExecutive(user) && campaign.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
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
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      if (isExecutive(user) && campaign.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }
      await storage.deleteCampaign(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debtors", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const campaignId = req.query.campaignId as string | undefined;
      if (campaignId && isExecutive(user)) {
        const campaign = await storage.getCampaign(campaignId);
        if (!campaign || campaign.ownerUserId !== user.id) {
          return res.status(403).json({ error: "No autorizado" });
        }
      }
      const debtors = await storage.getDebtors(
        campaignId,
        isExecutive(user) ? user.id : undefined
      );
      res.json(debtors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/contacts", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const rawLimit = req.query.limit as string | undefined;
      const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit && parsedLimit > 0
          ? parsedLimit
          : undefined;
      const contacts = await storage.getContacts(limit);
      if (isExecutive(user)) {
        const debtors = await storage.getDebtors(undefined, user.id);
        const filtered = contacts.filter((contact) =>
          debtors.some((debtor) => matchesPhone(debtor.phone, contact.phone))
        );
        return res.json(filtered);
      }
      res.json(contacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      if (isExecutive(user)) {
        const existing = await storage.updateContact(req.params.id, {});
        if (!existing) {
          return res.status(404).json({ error: "Contact not found" });
        }
        const debtors = await storage.getDebtors(undefined, user.id);
        const allowed = debtors.some((debtor) => matchesPhone(debtor.phone, existing.phone));
        if (!allowed) {
          return res.status(403).json({ error: "No autorizado" });
        }
      }
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
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      if (isExecutive(user) && debtor.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }
      res.json(debtor);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/debtors", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const validated = insertDebtorSchema.parse(req.body);
      const payload = { ...validated };
      if (isExecutive(user)) {
        payload.ownerUserId = user.id;
      }
      const debtor = await storage.createDebtor(payload);
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const debtors = z.array(insertDebtorSchema).parse(req.body);
      const created = await storage.createDebtors(debtors);

      await storage.createSystemLog({
        level: "info",
        source: "debtors",
        message: `Bulk uploaded ${created.length} debtors`,
        metadata: { count: created.length },
      });

      res.status(201).json(created);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/debtors/:id/assign", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const schema = z.object({
        ownerUserId: z.string().min(1),
      });
      const { ownerUserId } = schema.parse(req.body);

      const updated = await storage.updateDebtor(req.params.id, {
        ownerUserId,
      });
      if (!updated) {
        return res.status(404).json({ error: "Debtor not found" });
      }

      await storage.createSystemLog({
        level: "info",
        source: "debtors",
        message: "Assigned debtor to executive",
        metadata: { debtorId: updated.id, ownerUserId },
      });

      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/debtors/assign-bulk", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const schema = z.object({
        debtorIds: z.array(z.string().min(1)).min(1),
        ownerUserId: z.string().min(1),
      });
      const { debtorIds, ownerUserId } = schema.parse(req.body);

      const results = await Promise.all(
        debtorIds.map((id) => storage.updateDebtor(id, { ownerUserId }))
      );
      const updated = results.filter(Boolean);

      await storage.createSystemLog({
        level: "info",
        source: "debtors",
        message: "Bulk assigned debtors to executive",
        metadata: { count: updated.length, ownerUserId, debtorIds },
      });

      res.json({ success: true, count: updated.length });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/debtors/:id", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const existing = await storage.getDebtor(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Debtor not found" });
      }
      if (isExecutive(user) && existing.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }
      const payload = { ...req.body };
      if (isExecutive(user)) {
        delete payload.ownerUserId;
      }
      const debtor = await storage.updateDebtor(req.params.id, payload);
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
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const existing = await storage.getDebtor(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Debtor not found" });
      }
      if (isExecutive(user) && existing.ownerUserId !== user.id) {
        return res.status(403).json({ error: "No autorizado" });
      }
      await storage.deleteDebtor(req.params.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/messages", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const campaignId = req.query.campaignId as string | undefined;
      if (campaignId && isExecutive(user)) {
        const campaign = await storage.getCampaign(campaignId);
        if (!campaign || campaign.ownerUserId !== user.id) {
          return res.status(403).json({ error: "No autorizado" });
        }
      }

      if (isExecutive(user)) {
        const debtors = await storage.getDebtors(undefined, user.id);
        const debtorIds = debtors.map((debtor) => debtor.id);
        const phones = debtors.map((debtor) => debtor.phone);
        const messages = await storage.getMessages(campaignId, debtorIds, phones);
        return res.json(messages);
      }

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

      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      if (isExecutive(user)) {
        const debtors = await storage.getDebtors(undefined, user.id);
        const allowed = debtors.some((debtor) => matchesPhone(debtor.phone, phone));
        if (!allowed) {
          return res.status(403).json({ error: "No autorizado" });
        }
      }

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

      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      if (isExecutive(user)) {
        const debtors = await storage.getDebtors(undefined, user.id);
        const allowed = debtors.some((debtor) => matchesPhone(debtor.phone, phone));
        if (!allowed) {
          return res.status(403).json({ error: "No autorizado" });
        }
      }

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

      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      if (isExecutive(user)) {
        const debtors = await storage.getDebtors(undefined, user.id);
        const allowed = debtors.some((debtor) => matchesPhone(debtor.phone, phone));
        if (!allowed) {
          return res.status(403).json({ error: "No autorizado" });
        }
      }

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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const logs = await storage.getSystemLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const users = await storage.getUsers();
      const sanitized = users.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        active: user.active,
        displayName: user.displayName ?? null,
        executivePhone: user.executivePhone ?? null,
        permissions: user.permissions ?? [],
        notifyEnabled: user.notifyEnabled ?? true,
        notifyBatchWindowSec: user.notifyBatchWindowSec ?? 120,
        notifyBatchMaxItems: user.notifyBatchMaxItems ?? 5,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }));
      res.json(sanitized);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debug/admin-status", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const users = await storage.getUsers();
      const admins = users
        .filter((user) => user.role === "admin" && user.active)
        .map((user) => ({
          id: user.id,
          username: user.username,
          active: user.active,
        }));
      res.json({ admins, count: admins.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users/executives", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
      const users = await storage.getUsers();
      const executives = users
        .filter((user) => user.role === "executive" && user.active)
        .map((user) => ({
          id: user.id,
          username: user.username,
          displayName: user.displayName ?? null,
          executivePhone: user.executivePhone ?? null,
          active: user.active,
        }));
      res.json(executives);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const schema = z.object({
        username: z.string().min(3),
        password: z.string().min(6),
        role: z.enum(["admin", "supervisor", "executive"]).optional(),
        active: z.boolean().optional(),
        displayName: z.string().optional().nullable(),
        executivePhone: z.string().optional().nullable(),
        permissions: z.array(z.string()).optional(),
        notifyEnabled: z.boolean().optional(),
        notifyBatchWindowSec: z.number().int().positive().optional(),
        notifyBatchMaxItems: z.number().int().positive().optional(),
      });
      const payload = schema.parse(req.body);
      const normalizedUsername = payload.username.trim().toLowerCase();
      if (!normalizedUsername) {
        return res.status(400).json({ error: "Username inválido" });
      }

      const existing = await storage.getUserByUsername(normalizedUsername);
      if (existing) {
        return res.status(409).json({ error: "Username already exists" });
      }

      const passwordHash = await bcrypt.hash(payload.password, 12);
      const created = await storage.createUser({
        username: normalizedUsername,
        passwordHash,
        role: payload.role ?? "executive",
        active: payload.active ?? true,
        displayName: payload.displayName ?? null,
        executivePhone: payload.executivePhone ?? null,
        permissions: payload.permissions ?? [],
        notifyEnabled: payload.notifyEnabled ?? true,
        notifyBatchWindowSec: payload.notifyBatchWindowSec ?? 120,
        notifyBatchMaxItems: payload.notifyBatchMaxItems ?? 5,
      });

      await storage.createSystemLog({
        level: "info",
        source: "users",
        message: `Created user ${created.username}`,
        metadata: {
          userId: created.id,
          role: created.role,
        },
      });

      res.status(201).json({
        id: created.id,
        username: created.username,
        role: created.role,
        active: created.active,
        displayName: created.displayName ?? null,
        executivePhone: created.executivePhone ?? null,
        permissions: created.permissions ?? [],
        notifyEnabled: created.notifyEnabled ?? true,
        notifyBatchWindowSec: created.notifyBatchWindowSec ?? 120,
        notifyBatchMaxItems: created.notifyBatchMaxItems ?? 5,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        // The frontend expects a human-readable string in `message`/`error`.
        // Keep structured details for debugging/UI rendering.
        return res.status(400).json({
          message: "Datos invalidos",
          error: "Validation error",
          details: error.errors,
        });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/users/me", async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!user) {
        return res.status(401).json({ error: "No autenticado" });
      }
      const schema = z.object({
        displayName: z.string().optional().nullable(),
        executivePhone: z.string().optional().nullable(),
        notifyEnabled: z.boolean().optional(),
        notifyBatchWindowSec: z.number().int().positive().optional(),
        notifyBatchMaxItems: z.number().int().positive().optional(),
      });
      const payload = schema.parse(req.body);
      const updated = await storage.updateUser(user.id, payload);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.createSystemLog({
        level: "info",
        source: "users",
        message: `Updated self notification settings for ${updated.username}`,
        metadata: { userId: updated.id, changes: payload },
      });

      res.json({
        id: updated.id,
        username: updated.username,
        role: updated.role,
        displayName: updated.displayName ?? null,
        executivePhone: updated.executivePhone ?? null,
        permissions: updated.permissions ?? [],
        notifyEnabled: updated.notifyEnabled ?? true,
        notifyBatchWindowSec: updated.notifyBatchWindowSec ?? 120,
        notifyBatchMaxItems: updated.notifyBatchMaxItems ?? 5,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const schema = z.object({
        active: z.boolean().optional(),
        role: z.enum(["admin", "supervisor", "executive"]).optional(),
        executivePhone: z.string().optional().nullable(),
        displayName: z.string().optional().nullable(),
      });
      const payload = schema.parse(req.body);
      const existing = await storage.getUser(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "User not found" });
      }

      const wantsDeactivate = payload.active === false;
      const wantsDemote = payload.role !== undefined && payload.role !== "admin";
      if (existing.role === "admin" && existing.active && (wantsDeactivate || wantsDemote)) {
        const adminCount = await storage.getActiveAdminCount();
        if (adminCount <= 1) {
          return res
            .status(409)
            .json({ error: "No se puede desactivar o degradar al ultimo admin activo" });
        }
      }

      const updated = await storage.updateUser(req.params.id, payload);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.createSystemLog({
        level: "info",
        source: "users",
        message: `Updated user ${updated.username}`,
        metadata: { userId: updated.id, changes: payload },
      });

      res.json({
        id: updated.id,
        username: updated.username,
        role: updated.role,
        active: updated.active,
        displayName: updated.displayName ?? null,
        executivePhone: updated.executivePhone ?? null,
        permissions: updated.permissions ?? [],
        notifyEnabled: updated.notifyEnabled ?? true,
        notifyBatchWindowSec: updated.notifyBatchWindowSec ?? 120,
        notifyBatchMaxItems: updated.notifyBatchMaxItems ?? 5,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      const actor = ensureRole(req, res, ["admin"]);
      if (!actor) {
        return;
      }

      const existing = await storage.getUser(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "User not found" });
      }

      if (existing.id === actor.id) {
        return res.status(409).json({ error: "No puedes eliminar tu propio usuario" });
      }

      if (existing.role === "admin" && existing.active) {
        const adminCount = await storage.getActiveAdminCount();
        if (adminCount <= 1) {
          return res.status(409).json({ error: "No se puede eliminar al ultimo admin activo" });
        }
      }

      await storage.deleteUser(existing.id);

      await storage.createSystemLog({
        level: "warning",
        source: "users",
        message: `Deleted user ${existing.username}`,
        metadata: { userId: existing.id, deletedBy: actor.id },
      });

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users/:id/reset-password", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const schema = z.object({
        password: z.string().min(6),
      });
      const { password } = schema.parse(req.body);
      const passwordHash = await bcrypt.hash(password, 12);
      const updated = await storage.updateUserPassword(req.params.id, passwordHash);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.createSystemLog({
        level: "warning",
        source: "users",
        message: `Reset password for user ${updated.username}`,
        metadata: { userId: updated.id },
      });

      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id/permissions", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin"])) {
        return;
      }
      const schema = z.object({
        permissions: z.array(z.string()),
      });
      const { permissions } = schema.parse(req.body);
      const updated = await storage.updateUserPermissions(req.params.id, permissions);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.createSystemLog({
        level: "info",
        source: "users",
        message: `Updated permissions for ${updated.username}`,
        metadata: { userId: updated.id, permissions },
      });

      res.json({
        id: updated.id,
        username: updated.username,
        role: updated.role,
        active: updated.active,
        displayName: updated.displayName ?? null,
        executivePhone: updated.executivePhone ?? null,
        permissions: updated.permissions ?? [],
        notifyEnabled: updated.notifyEnabled ?? true,
        notifyBatchWindowSec: updated.notifyBatchWindowSec ?? 120,
        notifyBatchMaxItems: updated.notifyBatchMaxItems ?? 5,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/settings/whatsapp-polling", async (_req, res) => {
    try {
      if (!ensureRole(_req, res, ["admin", "supervisor"])) {
        return;
      }
      res.json(whatsappManager.getPollingSettings());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings/whatsapp-polling", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(_req, res, ["admin", "supervisor"])) {
        return;
      }
      res.json(campaignEngine.getSendWindowSettings());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings/campaign-window", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(_req, res, ["admin", "supervisor"])) {
        return;
      }
      res.json(campaignEngine.getCampaignPauseSettings());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/settings/campaign-pauses", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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

      const sendResult = await whatsappManager.sendMessage(req.params.id, phone, message);
      
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
        providerResponse: sendResult.messageId ?? null,
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reset all debtors to disponible status
  app.post("/api/debtors/cleanup", async (req, res) => {
    try {
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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
      if (!ensureRole(req, res, ["admin", "supervisor"])) {
        return;
      }
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



