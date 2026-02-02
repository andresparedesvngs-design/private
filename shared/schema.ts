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
});

export const insertDebtorSchema = z.object({
  campaignId: z.string().optional().nullable(),
  name: z.string(),
  phone: z.string(),
  debt: z.number(),
  status: z.string().default("disponible"),
  lastContact: z.date().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
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
  archived: z.boolean().optional(),
  error: z.string().optional().nullable(),
});

export const insertSystemLogSchema = z.object({
  level: z.string().default("info"),
  source: z.string(),
  message: z.string(),
  metadata: z.record(z.any()).optional().nullable(),
});

// Esquemas de Mongoose (sin cambios)
const sessionSchema = new mongoose.Schema({
  phoneNumber: { type: String, default: null },
  status: { type: String, default: "disconnected" },
  qrCode: { type: String, default: null },
  battery: { type: Number, default: null },
  messagesSent: { type: Number, default: 0 },
  lastActive: { type: Date, default: null },
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
}, { timestamps: true });

const debtorSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign", default: null },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  debt: { type: Number, required: true },
  status: { type: String, default: "disponible" },
  lastContact: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
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
  archived: { type: Boolean, default: false, index: true },
  error: { type: String, default: null },
}, { timestamps: true });

const systemLogSchema = new mongoose.Schema({
  level: { type: String, default: "info" },
  source: { type: String, required: true },
  message: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// Modelos de Mongoose
export const SessionModel = mongoose.model("Session", sessionSchema);
export const PoolModel = mongoose.model("Pool", poolSchema);
export const GsmLineModel = mongoose.model("GsmLine", gsmLineSchema);
export const GsmPoolModel = mongoose.model("GsmPool", gsmPoolSchema);
export const CampaignModel = mongoose.model("Campaign", campaignSchema);
export const DebtorModel = mongoose.model("Debtor", debtorSchema);
export const ContactModel = mongoose.model("Contact", contactSchema);
export const MessageModel = mongoose.model("Message", messageSchema);
export const SystemLogModel = mongoose.model("SystemLog", systemLogSchema);

// Tipos TypeScript - Actualizados para coincidir con la transformación
export type InsertUser = any;
export type User = any;

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
