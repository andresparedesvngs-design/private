import { z } from "zod";
import mongoose from "mongoose";

// Esquemas de Zod para validación (sin cambios)
export const insertSessionSchema = z.object({
  phoneNumber: z.string().optional().nullable(),
  status: z.string().default("disconnected"),
  qrCode: z.string().optional().nullable(),
  battery: z.number().optional().nullable(),
  messagesSent: z.number().default(0),
  lastActive: z.date().optional().nullable(),
  purpose: z.string().optional().default("default"),
  proxyServerId: z.string().optional().nullable(),
  proxyLocked: z.boolean().optional(),
  authClientId: z.string().optional().nullable(),
  disconnectCount: z.number().default(0),
  lastDisconnectAt: z.date().optional().nullable(),
  lastDisconnectReason: z.string().optional().nullable(),
  authFailureCount: z.number().default(0),
  lastAuthFailureAt: z.date().optional().nullable(),
  resetAuthCount: z.number().default(0),
  lastResetAuthAt: z.date().optional().nullable(),
  reconnectCount: z.number().default(0),
  lastReconnectAt: z.date().optional().nullable(),
  healthStatus: z
    .enum(["unknown", "healthy", "warning", "risky", "cooldown", "blocked"])
    .default("unknown"),
  healthScore: z.number().default(0),
  healthReason: z.string().optional().nullable(),
  healthUpdatedAt: z.date().optional().nullable(),
  cooldownUntil: z.date().optional().nullable(),
  strikeCount: z.number().default(0),
  lastStrikeAt: z.date().optional().nullable(),
  lastStrikeReason: z.string().optional().nullable(),
  sendLimits: z
    .object({
      tokensPerMinute: z.number().int().nonnegative().default(6),
      bucketSize: z.number().int().nonnegative().default(10),
      dailyMax: z.number().int().nonnegative().default(200),
      hourlyMax: z.number().int().nonnegative().default(60),
    })
    .default({
      tokensPerMinute: 6,
      bucketSize: 10,
      dailyMax: 200,
      hourlyMax: 60,
    }),
  countersWindow: z
    .object({
      dayCount: z.number().int().nonnegative().default(0),
      dayStart: z.date().optional().nullable(),
      hourCount: z.number().int().nonnegative().default(0),
      hourStart: z.date().optional().nullable(),
    })
    .default({
      dayCount: 0,
      dayStart: null,
      hourCount: 0,
      hourStart: null,
    }),
  lastLimitUpdateAt: z.date().optional().nullable(),
  limitChangeReason: z.string().optional().nullable(),
});

export const insertProxyServerSchema = z.object({
  name: z.string(),
  scheme: z.enum(["socks5"]).default("socks5"),
  host: z.string(),
  port: z.number().int().min(1).max(65535),
  enabled: z.boolean().default(true),
  status: z.enum(["online", "degraded", "offline"]).default("offline"),
  lastPublicIp: z.string().optional().nullable(),
  lastCheckAt: z.date().optional().nullable(),
  lastSeenAt: z.date().optional().nullable(),
  latencyMs: z.number().optional().nullable(),
  lastError: z.string().optional().nullable(),
});

export const insertPoolSchema = z.object({
  name: z.string(),
  strategy: z.string().default("competitivo"),
  delayBase: z.number().default(10000),
  delayVariation: z.number().default(5000),
  sessionIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

export const insertGsmLineSchema = z.object({
  name: z.string(),
  urlTemplate: z.string(),
  status: z.string().default("active"),
  active: z.boolean().default(true),
  lastUsedAt: z.date().optional().nullable(),
});

export const insertGsmPoolSchema = z.object({
  name: z.string(),
  strategy: z.string().default("fixed_turns"),
  delayBase: z.number().default(3000),
  delayVariation: z.number().default(1000),
  lineIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
});

export const insertCampaignSchema = z.object({
  name: z.string(),
  message: z.string(),
  messageVariants: z.array(z.string()).optional(),
  messageRotationStrategy: z.string().optional(),
  channel: z.string().optional(),
  smsPoolId: z.string().optional().nullable(),
  fallbackSms: z.boolean().optional(),
  status: z.string().default("draft"),
  pausedReason: z.string().optional().nullable(),
  poolId: z.string().optional().nullable(),
  debtorRangeStart: z.number().int().min(1).optional().nullable(),
  debtorRangeEnd: z.number().int().min(1).optional().nullable(),
  totalDebtors: z.number().default(0),
  sent: z.number().default(0),
  delivered: z.number().default(0),
  failed: z.number().default(0),
  progress: z.number().default(0),
  startedAt: z.date().optional().nullable(),
  completedAt: z.date().optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
});

export const insertDebtorSchema = z.object({
  campaignId: z.string().optional().nullable(),
  name: z.string(),
  phone: z.string(),
  debt: z.number(),
  status: z.string().default("disponible"),
  lastContact: z.date().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  rut: z.string().optional().nullable(),
});

export const insertContactSchema = z.object({
  name: z.string(),
  phone: z.string(),
  phoneNormalized: z.string().optional().nullable(),
  rut: z.string().optional().nullable(),
  executiveName: z.string().optional().nullable(),
  executivePhone: z.string().optional().nullable(),
  executiveRut: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
});

export const insertMessageSchema = z.object({
  campaignId: z.string().optional().nullable(),
  debtorId: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  phoneNormalized: z.string().optional().nullable(),
  content: z.string(),
  templateUsed: z.string().optional().nullable(),
  templateVariantIndex: z.number().optional().nullable(),
  channel: z.string().optional(),
  providerResponse: z.string().optional().nullable(),
  status: z.string().default("pending"),
  sentAt: z.date().optional().nullable(),
  deliveredAt: z.date().optional().nullable(),
  readAt: z.date().optional().nullable(),
  editedAt: z.date().optional().nullable(),
  archived: z.boolean().optional(),
  error: z.string().optional().nullable(),
});

export const insertSystemLogSchema = z.object({
  level: z.string().default("info"),
  source: z.string(),
  message: z.string(),
  metadata: z.record(z.any()).optional().nullable(),
});

export const insertUserSchema = z.object({
  username: z.string(),
  passwordHash: z.string(),
  role: z.enum(["admin", "supervisor", "executive"]).default("executive"),
  active: z.boolean().default(true),
  displayName: z.string().optional().nullable(),
  executivePhone: z.string().optional().nullable(),
  permissions: z.array(z.string()).default([]),
  notifyEnabled: z.boolean().default(true),
  notifyBatchWindowSec: z.number().int().positive().default(120),
  notifyBatchMaxItems: z.number().int().positive().default(5),
});

export const insertNotificationBatchSchema = z.object({
  executiveId: z.string(),
  items: z.array(z.object({
    debtorId: z.string(),
    debtorName: z.string(),
    debtorRut: z.string(),
    snippet: z.string(),
    campaignId: z.string().optional().nullable(),
    campaignName: z.string().optional().nullable(),
    receivedAt: z.date(),
    sessionId: z.string().optional().nullable(),
    count: z.number().int().positive().default(1),
  })).default([]),
  status: z.enum(["pending", "sending", "sent"]).default("pending"),
  nextSendAt: z.date().optional().nullable(),
});

export const insertWhatsAppVerificationBatchSchema = z.object({
  poolId: z.string().optional().nullable(),
  requestedBy: z.string().optional().nullable(),
  total: z.number().int().nonnegative().default(0),
  verified: z.number().int().nonnegative().default(0),
  failed: z.number().int().nonnegative().default(0),
  status: z.enum(["running", "completed"]).default("completed"),
});

export const insertWhatsAppVerificationSchema = z.object({
  batchId: z.string(),
  poolId: z.string().optional().nullable(),
  rut: z.string().optional().nullable(),
  phone: z.string(),
  whatsapp: z.boolean(),
  waId: z.string().optional().nullable(),
  verifiedBy: z.string().optional().nullable(),
  verifiedAt: z.date(),
});

// Esquemas de Mongoose (sin cambios)
const sessionSchema = new mongoose.Schema({
  phoneNumber: { type: String, default: null },
  status: { type: String, default: "disconnected" },
  qrCode: { type: String, default: null },
  battery: { type: Number, default: null },
  messagesSent: { type: Number, default: 0 },
  lastActive: { type: Date, default: null },
  purpose: { type: String, default: "default", index: true },
  proxyServerId: { type: mongoose.Schema.Types.ObjectId, ref: "ProxyServer", default: null },
  proxyLocked: { type: Boolean, default: true },
  authClientId: { type: String, default: null, index: true },
  disconnectCount: { type: Number, default: 0 },
  lastDisconnectAt: { type: Date, default: null },
  lastDisconnectReason: { type: String, default: null },
  authFailureCount: { type: Number, default: 0 },
  lastAuthFailureAt: { type: Date, default: null },
  resetAuthCount: { type: Number, default: 0 },
  lastResetAuthAt: { type: Date, default: null },
  reconnectCount: { type: Number, default: 0 },
  lastReconnectAt: { type: Date, default: null },
  healthStatus: {
    type: String,
    enum: ["unknown", "healthy", "warning", "risky", "cooldown", "blocked"],
    default: "unknown",
    index: true,
  },
  healthScore: { type: Number, default: 0 },
  healthReason: { type: String, default: null },
  healthUpdatedAt: { type: Date, default: null },
  cooldownUntil: { type: Date, default: null, index: true },
  strikeCount: { type: Number, default: 0 },
  lastStrikeAt: { type: Date, default: null },
  lastStrikeReason: { type: String, default: null },
  sendLimits: {
    tokensPerMinute: { type: Number, default: 6 },
    bucketSize: { type: Number, default: 10 },
    dailyMax: { type: Number, default: 200 },
    hourlyMax: { type: Number, default: 60 },
  },
  countersWindow: {
    dayCount: { type: Number, default: 0 },
    dayStart: { type: Date, default: null },
    hourCount: { type: Number, default: 0 },
    hourStart: { type: Date, default: null },
  },
  lastLimitUpdateAt: { type: Date, default: null },
  limitChangeReason: { type: String, default: null },
}, { timestamps: true });

const proxyServerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  scheme: { type: String, enum: ["socks5"], default: "socks5" },
  host: { type: String, required: true },
  port: { type: Number, required: true },
  enabled: { type: Boolean, default: true },
  status: { type: String, enum: ["online", "degraded", "offline"], default: "offline", index: true },
  lastPublicIp: { type: String, default: null },
  lastCheckAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: null },
  latencyMs: { type: Number, default: null },
  lastError: { type: String, default: null },
}, { timestamps: true });

const poolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  strategy: { type: String, default: "competitivo" },
  delayBase: { type: Number, default: 10000 },
  delayVariation: { type: Number, default: 5000 },
  sessionIds: [{ type: String }],
  active: { type: Boolean, default: true },
}, { timestamps: true });

const gsmLineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  urlTemplate: { type: String, required: true },
  status: { type: String, default: "active" },
  active: { type: Boolean, default: true },
  lastUsedAt: { type: Date, default: null },
}, { timestamps: true });

const gsmPoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  strategy: { type: String, default: "fixed_turns" },
  delayBase: { type: Number, default: 3000 },
  delayVariation: { type: Number, default: 1000 },
  lineIds: [{ type: String }],
  active: { type: Boolean, default: true },
}, { timestamps: true });

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  message: { type: String, required: true },
  messageVariants: { type: [String], default: [] },
  messageRotationStrategy: { type: String, default: "none" },
  channel: { type: String, default: "whatsapp" },
  smsPoolId: { type: mongoose.Schema.Types.ObjectId, ref: "GsmPool", default: null },
  fallbackSms: { type: Boolean, default: false },
  status: { type: String, default: "draft" },
  pausedReason: { type: String, default: null },
  poolId: { type: mongoose.Schema.Types.ObjectId, ref: "Pool", default: null },
  debtorRangeStart: { type: Number, default: null },
  debtorRangeEnd: { type: Number, default: null },
  totalDebtors: { type: Number, default: 0 },
  sent: { type: Number, default: 0 },
  delivered: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
}, { timestamps: true });

const debtorSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  debt: { type: Number, required: true },
  status: { type: String, default: "disponible" },
  lastContact: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  rut: { type: String, default: null },
}, { timestamps: true });

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  phoneNormalized: { type: String, default: null, index: true, unique: true, sparse: true },
  rut: { type: String, default: null },
  executiveName: { type: String, default: null },
  executivePhone: { type: String, default: null },
  executiveRut: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  debtorId: { type: mongoose.Schema.Types.ObjectId, ref: "Debtor", default: null },
  sessionId: { type: String, default: null },
  phone: { type: String, default: null },
  phoneNormalized: { type: String, default: null, index: true },
  content: { type: String, required: true },
  templateUsed: { type: String, default: null },
  templateVariantIndex: { type: Number, default: null },
  channel: { type: String, default: "whatsapp", index: true },
  providerResponse: { type: String, default: null },
  status: { type: String, default: "pending" },
  sentAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  editedAt: { type: Date, default: null },
  archived: { type: Boolean, default: false, index: true },
  error: { type: String, default: null },
}, { timestamps: true });

const systemLogSchema = new mongoose.Schema({
  level: { type: String, default: "info" },
  source: { type: String, required: true },
  message: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["admin", "supervisor", "executive"], default: "executive" },
  active: { type: Boolean, default: true },
  displayName: { type: String, default: null },
  executivePhone: { type: String, default: null },
  permissions: { type: [String], default: [] },
  notifyEnabled: { type: Boolean, default: true },
  notifyBatchWindowSec: { type: Number, default: 120 },
  notifyBatchMaxItems: { type: Number, default: 5 },
}, { timestamps: true });

const notificationItemSchema = new mongoose.Schema({
  debtorId: { type: mongoose.Schema.Types.ObjectId, ref: "Debtor", required: true },
  debtorName: { type: String, required: true },
  debtorRut: { type: String, required: true },
  snippet: { type: String, required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  campaignName: { type: String, default: null },
  receivedAt: { type: Date, required: true },
  sessionId: { type: String, default: null },
  count: { type: Number, default: 1 },
}, { _id: false });

const notificationBatchSchema = new mongoose.Schema({
  executiveId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  items: { type: [notificationItemSchema], default: [] },
  status: { type: String, enum: ["pending", "sending", "sent"], default: "pending", index: true },
  nextSendAt: { type: Date, default: null, index: true },
}, { timestamps: true });

const whatsappVerificationBatchSchema = new mongoose.Schema({
  poolId: { type: mongoose.Schema.Types.ObjectId, ref: "Pool", default: null, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  total: { type: Number, default: 0 },
  verified: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  status: { type: String, enum: ["running", "completed"], default: "completed" },
}, { timestamps: true });

const whatsappVerificationSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: "WhatsAppVerificationBatch", required: true, index: true },
  poolId: { type: mongoose.Schema.Types.ObjectId, ref: "Pool", default: null, index: true },
  rut: { type: String, default: null },
  phone: { type: String, required: true },
  whatsapp: { type: Boolean, default: false, index: true },
  waId: { type: String, default: null },
  verifiedBy: { type: String, default: null },
  verifiedAt: { type: Date, required: true },
}, { timestamps: true });

// Modelos de Mongoose
export const SessionModel = mongoose.model("Session", sessionSchema);
export const ProxyServerModel = mongoose.model("ProxyServer", proxyServerSchema);
export const PoolModel = mongoose.model("Pool", poolSchema);
export const GsmLineModel = mongoose.model("GsmLine", gsmLineSchema);
export const GsmPoolModel = mongoose.model("GsmPool", gsmPoolSchema);
export const CampaignModel = mongoose.model("Campaign", campaignSchema);
export const DebtorModel = mongoose.model("Debtor", debtorSchema);
export const ContactModel = mongoose.model("Contact", contactSchema);
export const MessageModel = mongoose.model("Message", messageSchema);
export const SystemLogModel = mongoose.model("SystemLog", systemLogSchema);
export const UserModel = mongoose.model("User", userSchema);
export const NotificationBatchModel = mongoose.model("NotificationBatch", notificationBatchSchema);
export const WhatsAppVerificationBatchModel = mongoose.model(
  "WhatsAppVerificationBatch",
  whatsappVerificationBatchSchema
);
export const WhatsAppVerificationModel = mongoose.model(
  "WhatsAppVerification",
  whatsappVerificationSchema
);

// Tipos TypeScript - Actualizados para coincidir con la transformación
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = BaseDocument & {
  username: string;
  passwordHash: string;
  role: "admin" | "supervisor" | "executive";
  active: boolean;
  displayName?: string | null;
  executivePhone?: string | null;
  permissions: string[];
  notifyEnabled: boolean;
  notifyBatchWindowSec: number;
  notifyBatchMaxItems: number;
};

// Base type para documentos transformados
interface BaseDocument {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = BaseDocument & {
  phoneNumber?: string | null;
  status: string;
  qrCode?: string | null;
  battery?: number | null;
  messagesSent: number;
  lastActive?: Date | null;
  purpose?: string;
  proxyServerId?: string | null;
  proxyLocked?: boolean;
  authClientId?: string | null;
  disconnectCount?: number;
  lastDisconnectAt?: Date | null;
  lastDisconnectReason?: string | null;
  authFailureCount?: number;
  lastAuthFailureAt?: Date | null;
  resetAuthCount?: number;
  lastResetAuthAt?: Date | null;
  reconnectCount?: number;
  lastReconnectAt?: Date | null;
  healthStatus?: "unknown" | "healthy" | "warning" | "risky" | "cooldown" | "blocked";
  healthScore?: number;
  healthReason?: string | null;
  healthUpdatedAt?: Date | null;
  cooldownUntil?: Date | null;
  strikeCount?: number;
  lastStrikeAt?: Date | null;
  lastStrikeReason?: string | null;
  sendLimits?: {
    tokensPerMinute: number;
    bucketSize: number;
    dailyMax: number;
    hourlyMax: number;
  };
  countersWindow?: {
    dayCount: number;
    dayStart?: Date | null;
    hourCount: number;
    hourStart?: Date | null;
  };
  lastLimitUpdateAt?: Date | null;
  limitChangeReason?: string | null;
};

export type InsertProxyServer = z.infer<typeof insertProxyServerSchema>;
export type ProxyServer = BaseDocument & {
  name: string;
  scheme: "socks5";
  host: string;
  port: number;
  enabled: boolean;
  status: "online" | "degraded" | "offline";
  lastPublicIp?: string | null;
  lastCheckAt?: Date | null;
  lastSeenAt?: Date | null;
  latencyMs?: number | null;
  lastError?: string | null;
};

export type InsertPool = z.infer<typeof insertPoolSchema>;
export type Pool = BaseDocument & {
  name: string;
  strategy: string;
  delayBase: number;
  delayVariation: number;
  sessionIds: string[];
  active: boolean;
};

export type InsertGsmLine = z.infer<typeof insertGsmLineSchema>;
export type GsmLine = BaseDocument & {
  name: string;
  urlTemplate: string;
  status: string;
  active: boolean;
  lastUsedAt?: Date | null;
};

export type InsertGsmPool = z.infer<typeof insertGsmPoolSchema>;
export type GsmPool = BaseDocument & {
  name: string;
  strategy: string;
  delayBase: number;
  delayVariation: number;
  lineIds: string[];
  active: boolean;
};

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = BaseDocument & {
  name: string;
  message: string;
  messageVariants?: string[];
  messageRotationStrategy?: string;
  channel?: string;
  smsPoolId?: string | null;
  fallbackSms?: boolean;
  status: string;
  pausedReason?: string | null;
  poolId?: string | null;
  debtorRangeStart?: number | null;
  debtorRangeEnd?: number | null;
  totalDebtors: number;
  sent: number;
  delivered: number;
  failed: number;
  progress: number;
  startedAt?: Date | null;
  completedAt?: Date | null;
  ownerUserId?: string | null;
};

export type InsertDebtor = z.infer<typeof insertDebtorSchema>;
export type Debtor = BaseDocument & {
  campaignId?: string | null;
  name: string;
  phone: string;
  debt: number;
  status: string;
  lastContact?: Date | null;
  metadata?: Record<string, any> | null;
  ownerUserId?: string | null;
  rut?: string | null;
};

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = BaseDocument & {
  name: string;
  phone: string;
  phoneNormalized?: string | null;
  rut?: string | null;
  executiveName?: string | null;
  executivePhone?: string | null;
  executiveRut?: string | null;
  metadata?: Record<string, any> | null;
};

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = BaseDocument & {
  campaignId?: string | null;
  debtorId?: string | null;
  sessionId?: string | null;
  phone?: string | null;
  phoneNormalized?: string | null;
  content: string;
  templateUsed?: string | null;
  templateVariantIndex?: number | null;
  channel?: string;
  providerResponse?: string | null;
  status: string;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  editedAt?: Date | null;
  archived?: boolean;
  error?: string | null;
};

export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
export type SystemLog = BaseDocument & {
  level: string;
  source: string;
  message: string;
  metadata?: Record<string, any> | null;
};

export type InsertNotificationBatch = z.infer<typeof insertNotificationBatchSchema>;
export type NotificationBatch = BaseDocument & {
  executiveId: string;
  items: Array<{
    debtorId: string;
    debtorName: string;
    debtorRut: string;
    snippet: string;
    campaignId?: string | null;
    campaignName?: string | null;
    receivedAt: Date;
    sessionId?: string | null;
    count: number;
  }>;
  status: "pending" | "sending" | "sent";
  nextSendAt?: Date | null;
};

export type InsertWhatsAppVerificationBatch = z.infer<
  typeof insertWhatsAppVerificationBatchSchema
>;
export type WhatsAppVerificationBatch = BaseDocument & {
  poolId?: string | null;
  requestedBy?: string | null;
  total: number;
  verified: number;
  failed: number;
  status: "running" | "completed";
};

export type InsertWhatsAppVerification = z.infer<
  typeof insertWhatsAppVerificationSchema
>;
export type WhatsAppVerification = BaseDocument & {
  batchId: string;
  poolId?: string | null;
  rut?: string | null;
  phone: string;
  whatsapp: boolean;
  waId?: string | null;
  verifiedBy?: string | null;
  verifiedAt: Date;
};
