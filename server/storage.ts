import mongoose from "mongoose";
import {
  SessionModel,
  PoolModel,
  GsmLineModel,
  GsmPoolModel,
  CampaignModel,
  DebtorModel,
  ContactModel,
  MessageModel,
  SystemLogModel,
  UserModel,
  NotificationBatchModel,
  WhatsAppVerificationBatchModel,
  WhatsAppVerificationModel,
  type Session, type InsertSession,
  type Pool, type InsertPool,
  type GsmLine, type InsertGsmLine,
  type GsmPool, type InsertGsmPool,
  type Campaign, type InsertCampaign,
  type Debtor, type InsertDebtor,
  type Contact, type InsertContact,
  type Message, type InsertMessage,
  type SystemLog, type InsertSystemLog,
  type User, type InsertUser,
  type NotificationBatch, type InsertNotificationBatch,
  type WhatsAppVerificationBatch, type InsertWhatsAppVerificationBatch,
  type WhatsAppVerification, type InsertWhatsAppVerification,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  getActiveAdminCount(): Promise<number>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  updateUserPassword(id: string, passwordHash: string): Promise<User | undefined>;
  updateUserPermissions(id: string, permissions: string[]): Promise<User | undefined>;

  getSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | undefined>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, data: Partial<InsertSession>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;

  getPools(): Promise<Pool[]>;
  getPool(id: string): Promise<Pool | undefined>;
  createPool(pool: InsertPool): Promise<Pool>;
  updatePool(id: string, data: Partial<InsertPool>): Promise<Pool | undefined>;
  deletePool(id: string): Promise<void>;

  getGsmLines(): Promise<GsmLine[]>;
  getGsmLine(id: string): Promise<GsmLine | undefined>;
  createGsmLine(line: InsertGsmLine): Promise<GsmLine>;
  updateGsmLine(id: string, data: Partial<InsertGsmLine>): Promise<GsmLine | undefined>;
  deleteGsmLine(id: string): Promise<void>;

  getGsmPools(): Promise<GsmPool[]>;
  getGsmPool(id: string): Promise<GsmPool | undefined>;
  createGsmPool(pool: InsertGsmPool): Promise<GsmPool>;
  updateGsmPool(id: string, data: Partial<InsertGsmPool>): Promise<GsmPool | undefined>;
  deleteGsmPool(id: string): Promise<void>;

  getCampaigns(ownerUserId?: string | null): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, data: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<void>;

  getDebtors(campaignId?: string, ownerUserId?: string | null): Promise<Debtor[]>;
  getDebtor(id: string): Promise<Debtor | undefined>;
  getDebtorByPhone(phone: string): Promise<Debtor | undefined>;
  createDebtor(debtor: InsertDebtor): Promise<Debtor>;
  createDebtors(debtors: InsertDebtor[]): Promise<Debtor[]>;
  updateDebtor(id: string, data: Partial<InsertDebtor>): Promise<Debtor | undefined>;
  deleteDebtor(id: string): Promise<void>;

  getContacts(limit?: number): Promise<Contact[]>;
  getContactByPhone(phone: string): Promise<Contact | undefined>;
  upsertContact(contact: InsertContact): Promise<Contact>;
  upsertContacts(contacts: InsertContact[]): Promise<Contact[]>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;

  getMessages(campaignId?: string, debtorIds?: string[], phones?: string[]): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined>;
  getMessageByProviderResponse(
    providerResponse: string,
    sessionId?: string | null
  ): Promise<Message | undefined>;
  updateMessageByProviderResponse(
    providerResponse: string,
    sessionId: string | null | undefined,
    data: Partial<InsertMessage>
  ): Promise<Message | undefined>;
  markMessagesReadByPhone(phone: string, read: boolean): Promise<number>;
  archiveMessagesByPhone(phone: string, archived: boolean): Promise<number>;
  deleteMessagesByPhone(phone: string): Promise<number>;

  getSystemLogs(limit?: number): Promise<SystemLog[]>;
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;

  getNotificationBatchesForExecutive(executiveId: string): Promise<NotificationBatch[]>;
  getPendingNotificationBatch(executiveId: string): Promise<NotificationBatch | undefined>;
  upsertNotificationBatch(
    executiveId: string,
    updater: (existing: NotificationBatch | undefined) => InsertNotificationBatch
  ): Promise<NotificationBatch>;
  claimNextNotificationBatch(now: Date): Promise<NotificationBatch | undefined>;
  markNotificationBatchSent(id: string): Promise<void>;
  rescheduleNotificationBatch(id: string, nextSendAt: Date): Promise<void>;

  getWhatsAppVerificationBatches(limit?: number): Promise<WhatsAppVerificationBatch[]>;
  getWhatsAppVerificationBatch(id: string): Promise<WhatsAppVerificationBatch | undefined>;
  createWhatsAppVerificationBatch(
    batch: InsertWhatsAppVerificationBatch
  ): Promise<WhatsAppVerificationBatch>;
  updateWhatsAppVerificationBatch(
    id: string,
    data: Partial<InsertWhatsAppVerificationBatch>
  ): Promise<WhatsAppVerificationBatch | undefined>;
  createWhatsAppVerifications(
    items: InsertWhatsAppVerification[]
  ): Promise<WhatsAppVerification[]>;
  getWhatsAppVerificationResults(
    batchId: string,
    limit?: number,
    skip?: number
  ): Promise<WhatsAppVerification[]>;
  
  resetDebtorsStatus(): Promise<number>;
  cleanupDebtors(statuses?: string[]): Promise<number>;
  releaseDebtorsByStatus(statuses: string[]): Promise<number>;
  releaseDebtorsByStatusFromInactiveCampaigns(statuses: string[], ownerUserId?: string | null): Promise<number>;
  resetDebtorsForCampaign(campaignId: string, statuses: string[]): Promise<number>;
  assignAvailableOrphanDebtorsToCampaign(
    campaignId: string,
    range?: { start?: number | null; end?: number | null },
    ownerUserId?: string | null
  ): Promise<number>;

  getDashboardStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalCampaigns: number;
    activeCampaigns: number;
    totalDebtors: number;
    messagesSent: number;
  }>;
}

export class MongoStorage implements IStorage {
  private normalizePhone(phone: string): string {
    return phone.replace(/@c\.us$/i, "").replace(/\D/g, "");
  }

  private buildMessagePhoneQuery(phone: string) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) {
      return { phone };
    }

    const suffix = normalized.slice(-8);
    const regex = new RegExp(`${suffix}(\\D.*)?$`, "i");

    return {
      $or: [
        { phoneNormalized: normalized },
        { phone: { $regex: regex } },
      ],
    };
  }

  // MÃ©todos de transformaciÃ³n
  private transformSession(session: any): Session {
    if (!session) return session;
    const obj = session.toObject ? session.toObject() : session;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      phoneNumber: obj.phoneNumber,
      status: obj.status,
      qrCode: obj.qrCode,
      battery: obj.battery,
      messagesSent: obj.messagesSent,
      lastActive: obj.lastActive,
      purpose: obj.purpose,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  private transformPool(pool: any): Pool {
    if (!pool) return pool;
    const obj = pool.toObject ? pool.toObject() : pool;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      name: obj.name,
      strategy: obj.strategy,
      delayBase: obj.delayBase,
      delayVariation: obj.delayVariation,
      sessionIds: obj.sessionIds,
      active: obj.active,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  private transformGsmLine(line: any): GsmLine {
    if (!line) return line;
    const obj = line.toObject ? line.toObject() : line;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      name: obj.name,
      urlTemplate: obj.urlTemplate,
      status: obj.status,
      active: obj.active,
      lastUsedAt: obj.lastUsedAt,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private transformGsmPool(pool: any): GsmPool {
    if (!pool) return pool;
    const obj = pool.toObject ? pool.toObject() : pool;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      name: obj.name,
      strategy: obj.strategy,
      delayBase: obj.delayBase,
      delayVariation: obj.delayVariation,
      lineIds: obj.lineIds,
      active: obj.active,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private transformCampaign(campaign: any): Campaign {
    if (!campaign) return campaign;
    const obj = campaign.toObject ? campaign.toObject() : campaign;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      name: obj.name,
      message: obj.message,
      messageVariants: obj.messageVariants,
      messageRotationStrategy: obj.messageRotationStrategy,
      channel: obj.channel,
      smsPoolId: obj.smsPoolId ? obj.smsPoolId.toString() : obj.smsPoolId,
      fallbackSms: obj.fallbackSms,
      status: obj.status,
      pausedReason: obj.pausedReason ?? null,
      poolId: obj.poolId ? obj.poolId.toString() : obj.poolId,
      debtorRangeStart: obj.debtorRangeStart,
      debtorRangeEnd: obj.debtorRangeEnd,
      totalDebtors: obj.totalDebtors,
      sent: obj.sent,
      delivered: obj.delivered,
      failed: obj.failed,
      progress: obj.progress,
      ownerUserId: obj.ownerUserId ? obj.ownerUserId.toString() : obj.ownerUserId,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      startedAt: obj.startedAt,
      completedAt: obj.completedAt
    };
  }

  private transformDebtor(debtor: any): Debtor {
    if (!debtor) return debtor;
    const obj = debtor.toObject ? debtor.toObject() : debtor;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      campaignId: obj.campaignId ? obj.campaignId.toString() : obj.campaignId,
      name: obj.name,
      phone: obj.phone,
      debt: obj.debt,
      status: obj.status,
      lastContact: obj.lastContact,
      metadata: obj.metadata,
      ownerUserId: obj.ownerUserId ? obj.ownerUserId.toString() : obj.ownerUserId,
      rut: obj.rut,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  private transformContact(contact: any): Contact {
    if (!contact) return contact;
    const obj = contact.toObject ? contact.toObject() : contact;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      name: obj.name,
      phone: obj.phone,
      phoneNormalized: obj.phoneNormalized,
      rut: obj.rut,
      executiveName: obj.executiveName,
      executivePhone: obj.executivePhone,
      executiveRut: obj.executiveRut,
      metadata: obj.metadata,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private transformMessage(message: any): Message {
    if (!message) return message;
    const obj = message.toObject ? message.toObject() : message;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      campaignId: obj.campaignId ? obj.campaignId.toString() : obj.campaignId,
      debtorId: obj.debtorId ? obj.debtorId.toString() : obj.debtorId,
      sessionId: obj.sessionId,
      phone: obj.phone,
      phoneNormalized: obj.phoneNormalized,
      content: obj.content,
      templateUsed: obj.templateUsed,
      templateVariantIndex: obj.templateVariantIndex,
      channel: obj.channel,
      providerResponse: obj.providerResponse,
      status: obj.status,
      sentAt: obj.sentAt,
      deliveredAt: obj.deliveredAt,
      readAt: obj.readAt,
      editedAt: obj.editedAt ?? null,
      archived: obj.archived,
      error: obj.error,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  private transformSystemLog(log: any): SystemLog {
    if (!log) return log;
    const obj = log.toObject ? log.toObject() : log;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      level: obj.level,
      source: obj.source,
      message: obj.message,
      metadata: obj.metadata,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  private transformUser(user: any): User {
    if (!user) return user;
    const obj = user.toObject ? user.toObject() : user;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      username: obj.username,
      passwordHash: obj.passwordHash,
      role: obj.role,
      active: obj.active,
      displayName: obj.displayName ?? null,
      executivePhone: obj.executivePhone ?? null,
      permissions: Array.isArray(obj.permissions) ? obj.permissions : [],
      notifyEnabled: obj.notifyEnabled ?? true,
      notifyBatchWindowSec: obj.notifyBatchWindowSec ?? 120,
      notifyBatchMaxItems: obj.notifyBatchMaxItems ?? 5,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private transformNotificationBatch(batch: any): NotificationBatch {
    if (!batch) return batch;
    const obj = batch.toObject ? batch.toObject() : batch;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      executiveId: obj.executiveId ? obj.executiveId.toString() : obj.executiveId,
      items: Array.isArray(obj.items)
        ? obj.items.map((item: any) => ({
            debtorId: item.debtorId ? item.debtorId.toString() : item.debtorId,
            debtorName: item.debtorName,
            debtorRut: item.debtorRut,
            snippet: item.snippet,
            campaignId: item.campaignId ? item.campaignId.toString() : item.campaignId,
            campaignName: item.campaignName ?? null,
            receivedAt: item.receivedAt,
            sessionId: item.sessionId ?? null,
            count: item.count ?? 1,
          }))
        : [],
      status: obj.status,
      nextSendAt: obj.nextSendAt ?? null,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private transformWhatsAppVerificationBatch(batch: any): WhatsAppVerificationBatch {
    if (!batch) return batch;
    const obj = batch.toObject ? batch.toObject() : batch;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      poolId: obj.poolId ? obj.poolId.toString() : obj.poolId,
      requestedBy: obj.requestedBy ? obj.requestedBy.toString() : obj.requestedBy,
      total: obj.total ?? 0,
      verified: obj.verified ?? 0,
      failed: obj.failed ?? 0,
      status: obj.status ?? "completed",
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private transformWhatsAppVerification(item: any): WhatsAppVerification {
    if (!item) return item;
    const obj = item.toObject ? item.toObject() : item;
    return {
      id: obj._id ? obj._id.toString() : obj.id,
      batchId: obj.batchId ? obj.batchId.toString() : obj.batchId,
      poolId: obj.poolId ? obj.poolId.toString() : obj.poolId,
      rut: obj.rut ?? null,
      phone: obj.phone,
      whatsapp: Boolean(obj.whatsapp),
      waId: obj.waId ?? null,
      verifiedBy: obj.verifiedBy ?? null,
      verifiedAt: obj.verifiedAt,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }

  private pickFirstText(values: Array<unknown>): string | undefined {
    for (const value of values) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
      }
    }
    return undefined;
  }

  private extractMetadataText(
    metadata: Record<string, any> | null | undefined,
    keys: string[]
  ): string | undefined {
    if (!metadata) return undefined;
    return this.pickFirstText(keys.map((key) => metadata[key]));
  }

  private buildContactFromDebtor(debtor: InsertDebtor | Debtor): InsertContact | null {
    if (!debtor?.phone) return null;
    const phone = String(debtor.phone).trim();
    if (!phone) return null;
    const phoneNormalized = this.normalizePhone(phone);
    const name = this.pickFirstText([debtor.name]) ?? phone;
    const metadata = debtor.metadata ?? {};

    const rut = debtor.rut ?? this.extractMetadataText(metadata, [
      "rut",
      "RUT",
      "rut_deudor",
      "rutdeudor",
    ]);

    const executiveName = this.extractMetadataText(metadata, [
      "nombre_ejecutivo",
      "nombreejecutivo",
      "ejecutivo",
      "ejecutivo_nombre",
      "nombreEjecutivo",
    ]);

    const executivePhone = this.extractMetadataText(metadata, [
      "fono_ejecutivo",
      "fonoejecutivo",
      "telefonoejecutivo",
      "telefono_ejecutivo",
      "ejecutivo_telefono",
      "telefonoEjecutivo",
    ]);

    const executiveRut = this.extractMetadataText(metadata, [
      "rut_ejecutivo",
      "rutejecutivo",
      "ejecutivo_rut",
      "rutEjecutivo",
    ]);

    return {
      name,
      phone,
      phoneNormalized,
      rut,
      executiveName,
      executivePhone,
      executiveRut,
      metadata,
    };
  }

  async getUser(id: string): Promise<User | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const user = await UserModel.findById(id);
    return user ? this.transformUser(user) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const trimmed = String(username ?? "").trim();
    if (!trimmed) return undefined;
    const user = await UserModel.findOne({ username: trimmed });
    return user ? this.transformUser(user) : undefined;
  }

  async getUsers(): Promise<User[]> {
    const users = await UserModel.find().sort({ createdAt: -1 });
    return users.map((user) => this.transformUser(user));
  }

  async getActiveAdminCount(): Promise<number> {
    return UserModel.countDocuments({ role: "admin", active: true });
  }

  async createUser(user: InsertUser): Promise<User> {
    const created = await UserModel.create(user);
    return this.transformUser(created);
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const cleanedData: any = { ...data };
    Object.keys(cleanedData).forEach((key) => {
      if (cleanedData[key] === undefined) {
        delete cleanedData[key];
      }
    });
    const updated = await UserModel.findByIdAndUpdate(id, cleanedData, { new: true });
    return updated ? this.transformUser(updated) : undefined;
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<User | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const updated = await UserModel.findByIdAndUpdate(
      id,
      { passwordHash },
      { new: true }
    );
    return updated ? this.transformUser(updated) : undefined;
  }

  async updateUserPermissions(id: string, permissions: string[]): Promise<User | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const updated = await UserModel.findByIdAndUpdate(
      id,
      { permissions },
      { new: true }
    );
    return updated ? this.transformUser(updated) : undefined;
  }

  async getSessions(): Promise<Session[]> {
    const sessions = await SessionModel.find().sort({ createdAt: -1 });
    return sessions.map(s => this.transformSession(s));
  }

  async getSession(id: string): Promise<Session | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const session = await SessionModel.findById(id);
    return session ? this.transformSession(session) : undefined;
  }

  async createSession(session: InsertSession): Promise<Session> {
    const created = await SessionModel.create(session);
    return this.transformSession(created);
  }

  async updateSession(id: string, data: Partial<InsertSession>): Promise<Session | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const cleanedData: any = { ...data };
    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === undefined) {
        delete cleanedData[key];
      }
    });
    const updated = await SessionModel.findByIdAndUpdate(id, cleanedData, { new: true });
    return updated ? this.transformSession(updated) : undefined;
  }

  async deleteSession(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await SessionModel.findByIdAndDelete(id);
  }

  async getPools(): Promise<Pool[]> {
    const pools = await PoolModel.find().sort({ createdAt: -1 });
    return pools.map(p => this.transformPool(p));
  }

  async getPool(id: string): Promise<Pool | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const pool = await PoolModel.findById(id);
    return pool ? this.transformPool(pool) : undefined;
  }

  async createPool(pool: InsertPool): Promise<Pool> {
    const created = await PoolModel.create(pool);
    return this.transformPool(created);
  }

  async updatePool(id: string, data: Partial<InsertPool>): Promise<Pool | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const updated = await PoolModel.findByIdAndUpdate(id, data, { new: true });
    return updated ? this.transformPool(updated) : undefined;
  }

  async deletePool(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await PoolModel.findByIdAndDelete(id);
  }

  async getGsmLines(): Promise<GsmLine[]> {
    const lines = await GsmLineModel.find().sort({ createdAt: -1 });
    return lines.map((line) => this.transformGsmLine(line));
  }

  async getGsmLine(id: string): Promise<GsmLine | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const line = await GsmLineModel.findById(id);
    return line ? this.transformGsmLine(line) : undefined;
  }

  async createGsmLine(line: InsertGsmLine): Promise<GsmLine> {
    const created = await GsmLineModel.create(line);
    return this.transformGsmLine(created);
  }

  async updateGsmLine(id: string, data: Partial<InsertGsmLine>): Promise<GsmLine | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const updated = await GsmLineModel.findByIdAndUpdate(id, data, { new: true });
    return updated ? this.transformGsmLine(updated) : undefined;
  }

  async deleteGsmLine(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await GsmLineModel.findByIdAndDelete(id);
  }

  async getGsmPools(): Promise<GsmPool[]> {
    const pools = await GsmPoolModel.find().sort({ createdAt: -1 });
    return pools.map((pool) => this.transformGsmPool(pool));
  }

  async getGsmPool(id: string): Promise<GsmPool | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const pool = await GsmPoolModel.findById(id);
    return pool ? this.transformGsmPool(pool) : undefined;
  }

  async createGsmPool(pool: InsertGsmPool): Promise<GsmPool> {
    const created = await GsmPoolModel.create(pool);
    return this.transformGsmPool(created);
  }

  async updateGsmPool(id: string, data: Partial<InsertGsmPool>): Promise<GsmPool | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const updated = await GsmPoolModel.findByIdAndUpdate(id, data, { new: true });
    return updated ? this.transformGsmPool(updated) : undefined;
  }

  async deleteGsmPool(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await GsmPoolModel.findByIdAndDelete(id);
  }

  async getCampaigns(ownerUserId?: string | null): Promise<Campaign[]> {
    const query =
      ownerUserId && mongoose.isValidObjectId(ownerUserId)
        ? { ownerUserId }
        : {};
    const campaigns = await CampaignModel.find(query).sort({ createdAt: -1 });
    return campaigns.map(c => this.transformCampaign(c));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const campaign = await CampaignModel.findById(id);
    return campaign ? this.transformCampaign(campaign) : undefined;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const created = await CampaignModel.create(campaign);
    return this.transformCampaign(created);
  }

  async updateCampaign(id: string, data: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const updated = await CampaignModel.findByIdAndUpdate(id, data, { new: true });
    return updated ? this.transformCampaign(updated) : undefined;
  }

  async deleteCampaign(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await CampaignModel.findByIdAndDelete(id);
  }

  async getDebtors(campaignId?: string, ownerUserId?: string | null): Promise<Debtor[]> {
    if (campaignId && !mongoose.isValidObjectId(campaignId)) {
      return [];
    }
    if (ownerUserId && !mongoose.isValidObjectId(ownerUserId)) {
      return [];
    }
    const query: Record<string, any> = {};
    if (campaignId) query.campaignId = campaignId;
    if (ownerUserId) query.ownerUserId = ownerUserId;
    const debtors = await DebtorModel.find(query).sort({ createdAt: -1 });
    return debtors.map(d => this.transformDebtor(d));
  }

  async getDebtor(id: string): Promise<Debtor | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const debtor = await DebtorModel.findById(id);
    return debtor ? this.transformDebtor(debtor) : undefined;
  }

  async getDebtorByPhone(phone: string): Promise<Debtor | undefined> {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return undefined;

    // Narrow down candidates by phone suffix to avoid scanning everything.
    const suffix = normalized.slice(-8);
    const candidates = await DebtorModel.find({
      phone: { $regex: suffix, $options: "i" },
    }).limit(50);

    const exactMatch =
      candidates.find((d) => this.normalizePhone(d.phone) === normalized) ??
      candidates[0];

    return exactMatch ? this.transformDebtor(exactMatch) : undefined;
  }

  async createDebtor(debtor: InsertDebtor): Promise<Debtor> {
    const created = await DebtorModel.create(debtor);
    const contactPayload = this.buildContactFromDebtor(this.transformDebtor(created));
    if (contactPayload) {
      await this.upsertContact(contactPayload);
    }
    return this.transformDebtor(created);
  }

  async createDebtors(debtors: InsertDebtor[]): Promise<Debtor[]> {
    const created = await DebtorModel.insertMany(debtors);
    await Promise.all(
      created.map((debtor) => {
        const contactPayload = this.buildContactFromDebtor(this.transformDebtor(debtor));
        return contactPayload ? this.upsertContact(contactPayload) : Promise.resolve(null);
      })
    );
    return created.map(d => this.transformDebtor(d));
  }

  async updateDebtor(id: string, data: Partial<InsertDebtor>): Promise<Debtor | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const updated = await DebtorModel.findByIdAndUpdate(id, data, { new: true });
    if (updated) {
      const contactPayload = this.buildContactFromDebtor(this.transformDebtor(updated));
      if (contactPayload) {
        await this.upsertContact(contactPayload);
      }
    }
    return updated ? this.transformDebtor(updated) : undefined;
  }

  async deleteDebtor(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await DebtorModel.findByIdAndDelete(id);
  }

  async getContacts(limit?: number): Promise<Contact[]> {
    const existingCount = await ContactModel.estimatedDocumentCount();
    if (!existingCount) {
      const debtors = await DebtorModel.find().select("name phone metadata");
      await Promise.all(
        debtors.map((debtor) => {
          const contactPayload = this.buildContactFromDebtor(this.transformDebtor(debtor));
          return contactPayload ? this.upsertContact(contactPayload) : Promise.resolve(null);
        })
      );
    }

    const query = ContactModel.find().sort({ updatedAt: -1 });
    if (typeof limit === "number" && limit > 0) {
      query.limit(limit);
    }
    const contacts = await query;
    return contacts.map((contact) => this.transformContact(contact));
  }

  async getContactByPhone(phone: string): Promise<Contact | undefined> {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return undefined;
    const contact = await ContactModel.findOne({ phoneNormalized: normalized });
    return contact ? this.transformContact(contact) : undefined;
  }

  async upsertContact(contact: InsertContact): Promise<Contact> {
    const normalized = contact.phoneNormalized ?? this.normalizePhone(contact.phone);
    const update: Record<string, any> = {
      phone: contact.phone,
      phoneNormalized: normalized,
    };
    if (contact.name) update.name = contact.name;
    if (contact.rut) update.rut = contact.rut;
    if (contact.executiveName) update.executiveName = contact.executiveName;
    if (contact.executivePhone) update.executivePhone = contact.executivePhone;
    if (contact.executiveRut) update.executiveRut = contact.executiveRut;
    if (contact.metadata && Object.keys(contact.metadata).length > 0) {
      update.metadata = contact.metadata;
    }

    const saved = await ContactModel.findOneAndUpdate(
      { phoneNormalized: normalized },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return this.transformContact(saved);
  }

  async upsertContacts(contacts: InsertContact[]): Promise<Contact[]> {
    const results = await Promise.all(
      contacts.map((contact) => this.upsertContact(contact))
    );
    return results;
  }

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const cleaned: Record<string, any> = {};

    const assignRequired = (key: keyof InsertContact) => {
      const value = data[key];
      if (value === undefined) return;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          cleaned[key] = trimmed;
        }
        return;
      }
      cleaned[key] = value;
    };

    const assignOptional = (key: keyof InsertContact) => {
      const value = data[key];
      if (value === undefined) return;
      if (typeof value === "string") {
        const trimmed = value.trim();
        cleaned[key] = trimmed ? trimmed : null;
        return;
      }
      cleaned[key] = value ?? null;
    };

    assignRequired("name");
    assignRequired("phone");
    assignOptional("rut");
    assignOptional("executiveName");
    assignOptional("executivePhone");
    assignOptional("executiveRut");
    if (data.metadata !== undefined) {
      cleaned.metadata = data.metadata;
    }

    if (cleaned.phone) {
      cleaned.phoneNormalized = this.normalizePhone(cleaned.phone);
    } else if (data.phoneNormalized !== undefined) {
      cleaned.phoneNormalized = data.phoneNormalized ?? null;
    }

    if (Object.keys(cleaned).length === 0) {
      const existing = await ContactModel.findById(id);
      return existing ? this.transformContact(existing) : undefined;
    }

    const updated = await ContactModel.findByIdAndUpdate(id, cleaned, { new: true });
    return updated ? this.transformContact(updated) : undefined;
  }

  async getMessages(
    campaignId?: string,
    debtorIds?: string[],
    phones?: string[]
  ): Promise<Message[]> {
    const query: Record<string, any> = {};
    if (campaignId) {
      query.campaignId = campaignId;
    }
    const hasDebtors = Array.isArray(debtorIds) && debtorIds.length > 0;
    const hasPhones = Array.isArray(phones) && phones.length > 0;
    if (hasDebtors && hasPhones) {
      query.$or = [
        { debtorId: { $in: debtorIds } },
        { phone: { $in: phones } },
      ];
    } else if (hasDebtors) {
      query.debtorId = { $in: debtorIds };
    } else if (hasPhones) {
      query.phone = { $in: phones };
    }
    const messages = await MessageModel.find(query).sort({ createdAt: -1 });
    return messages.map((m) => this.transformMessage(m));
  }

  async getMessage(id: string): Promise<Message | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const message = await MessageModel.findById(id);
    return message ? this.transformMessage(message) : undefined;
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const payload: InsertMessage = { ...message };

    if (payload.phone && !payload.phoneNormalized) {
      payload.phoneNormalized = this.normalizePhone(payload.phone);
    }

    if (!payload.channel) {
      payload.channel = "whatsapp";
    }

    if (payload.archived === undefined || payload.archived === null) {
      payload.archived = false;
    }

    if (payload.readAt === undefined) {
      payload.readAt = payload.status === "received" ? null : payload.readAt ?? null;
    }

    const created = await MessageModel.create(payload);
    return this.transformMessage(created);
  }

  async updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const updated = await MessageModel.findByIdAndUpdate(id, data, { new: true });
    return updated ? this.transformMessage(updated) : undefined;
  }

  async getMessageByProviderResponse(
    providerResponse: string,
    sessionId?: string | null
  ): Promise<Message | undefined> {
    if (!providerResponse) return undefined;
    const query: Record<string, any> = { providerResponse };
    if (sessionId) {
      query.sessionId = sessionId;
    }
    const message = await MessageModel.findOne(query).sort({ createdAt: -1 });
    return message ? this.transformMessage(message) : undefined;
  }

  async updateMessageByProviderResponse(
    providerResponse: string,
    sessionId: string | null | undefined,
    data: Partial<InsertMessage>
  ): Promise<Message | undefined> {
    if (!providerResponse) return undefined;
    const query: Record<string, any> = { providerResponse };
    if (sessionId) {
      query.sessionId = sessionId;
    }
    const updated = await MessageModel.findOneAndUpdate(query, data, { new: true });
    return updated ? this.transformMessage(updated) : undefined;
  }

  async markMessagesReadByPhone(phone: string, read: boolean): Promise<number> {
    const phoneQuery = this.buildMessagePhoneQuery(phone);
    const query = { ...phoneQuery, status: "received" };
    const update = read ? { $set: { readAt: new Date() } } : { $set: { readAt: null } };
    const result = await MessageModel.updateMany(query, update);
    return result.modifiedCount || 0;
  }

  async archiveMessagesByPhone(phone: string, archived: boolean): Promise<number> {
    const phoneQuery = this.buildMessagePhoneQuery(phone);
    const result = await MessageModel.updateMany(phoneQuery, { $set: { archived } });
    return result.modifiedCount || 0;
  }

  async deleteMessagesByPhone(phone: string): Promise<number> {
    const phoneQuery = this.buildMessagePhoneQuery(phone);
    const result = await MessageModel.deleteMany(phoneQuery);
    return result.deletedCount || 0;
  }

  async getSystemLogs(limit: number = 100): Promise<SystemLog[]> {
    const logs = await SystemLogModel.find().sort({ createdAt: -1 }).limit(limit);
    return logs.map(l => this.transformSystemLog(l));
  }

  async createSystemLog(log: InsertSystemLog): Promise<SystemLog> {
    const created = await SystemLogModel.create(log);
    return this.transformSystemLog(created);
  }

  async resetDebtorsStatus(): Promise<number> {
    const result = await DebtorModel.updateMany(
      { status: { $in: ["fallado", "completado"] } },
      { $set: { status: "disponible", campaignId: null } }
    );
    return result.modifiedCount || 0;
  }

  async cleanupDebtors(statuses?: string[]): Promise<number> {
    const query =
      statuses && statuses.length > 0 ? { status: { $in: statuses } } : {};
    const result = await DebtorModel.deleteMany(query);
    return result.deletedCount || 0;
  }

  async releaseDebtorsByStatus(statuses: string[]): Promise<number> {
    if (!statuses.length) {
      return 0;
    }

    const result = await DebtorModel.updateMany(
      { status: { $in: statuses } },
      { $set: { campaignId: null } }
    );

    return result.modifiedCount || 0;
  }

  async releaseDebtorsByStatusFromInactiveCampaigns(
    statuses: string[],
    ownerUserId?: string | null
  ): Promise<number> {
    if (!statuses.length) {
      return 0;
    }

    const activeCampaigns = await CampaignModel.find({ status: "active" }).select("_id");
    const activeCampaignIds = activeCampaigns.map((campaign) => campaign._id);

    const query: Record<string, any> = {
      status: { $in: statuses },
      campaignId: { $ne: null },
    };
    if (ownerUserId && mongoose.isValidObjectId(ownerUserId)) {
      query.ownerUserId = ownerUserId;
    }

    if (activeCampaignIds.length > 0) {
      query.campaignId.$nin = activeCampaignIds;
    }

    const result = await DebtorModel.updateMany(query, { $set: { campaignId: null } });
    return result.modifiedCount || 0;
  }

  async resetDebtorsForCampaign(campaignId: string, statuses: string[]): Promise<number> {
    if (!mongoose.isValidObjectId(campaignId)) {
      return 0;
    }
    if (!statuses.length) {
      return 0;
    }

    const result = await DebtorModel.updateMany(
      { campaignId, status: { $in: statuses } },
      { $set: { status: "disponible" } }
    );

    return result.modifiedCount || 0;
  }

  async assignAvailableOrphanDebtorsToCampaign(
    campaignId: string,
    range?: { start?: number | null; end?: number | null },
    ownerUserId?: string | null
  ): Promise<number> {
    if (!mongoose.isValidObjectId(campaignId)) {
      return 0;
    }

    const normalizeValue = (value?: number | null) => {
      if (value === null || value === undefined) return null;
      const parsed = Math.floor(Number(value));
      if (!Number.isFinite(parsed) || parsed <= 0) return null;
      return parsed;
    };

    const start = normalizeValue(range?.start);
    const end = normalizeValue(range?.end);

    const ownerFilter =
      ownerUserId && mongoose.isValidObjectId(ownerUserId)
        ? { ownerUserId }
        : {};

    if (start === null && end === null) {
      const result = await DebtorModel.updateMany(
        { campaignId: null, status: "disponible", ...ownerFilter },
        { $set: { campaignId } }
      );
      return result.modifiedCount || 0;
    }

    const effectiveStart = start ?? 1;
    if (end !== null && end < effectiveStart) {
      return 0;
    }

    const query = { campaignId: null, status: "disponible", ...ownerFilter };
    const cursor = DebtorModel.find(query)
      .sort({ createdAt: -1 })
      .skip(Math.max(effectiveStart - 1, 0));

    if (end !== null) {
      const limit = Math.max(end - effectiveStart + 1, 0);
      if (limit === 0) {
        return 0;
      }
      cursor.limit(limit);
    }

    const ids = await cursor.select("_id");
    if (ids.length === 0) {
      return 0;
    }

    const result = await DebtorModel.updateMany(
      { _id: { $in: ids } },
      { $set: { campaignId } }
    );

    return result.modifiedCount || 0;
  }

  async getDashboardStats() {
    const [sessions, campaigns, debtors, sentCount] = await Promise.all([
      SessionModel.find(),
      CampaignModel.find(),
      DebtorModel.find(),
      MessageModel.countDocuments({ status: "sent" }),
    ]);

    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === "connected").length,
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === "active").length,
      totalDebtors: debtors.length,
      messagesSent: sentCount,
    };
  }

  async getNotificationBatchesForExecutive(executiveId: string): Promise<NotificationBatch[]> {
    if (!mongoose.isValidObjectId(executiveId)) return [];
    const batches = await NotificationBatchModel.find({ executiveId }).sort({
      createdAt: -1,
    });
    return batches.map((batch) => this.transformNotificationBatch(batch));
  }

  async getPendingNotificationBatch(executiveId: string): Promise<NotificationBatch | undefined> {
    if (!mongoose.isValidObjectId(executiveId)) return undefined;
    const batch = await NotificationBatchModel.findOne({
      executiveId,
      status: "pending",
    }).sort({ createdAt: -1 });
    return batch ? this.transformNotificationBatch(batch) : undefined;
  }

  async upsertNotificationBatch(
    executiveId: string,
    updater: (existing: NotificationBatch | undefined) => InsertNotificationBatch
  ): Promise<NotificationBatch> {
    if (!mongoose.isValidObjectId(executiveId)) {
      throw new Error("Invalid executive id");
    }
    const existingDoc = await NotificationBatchModel.findOne({
      executiveId,
      status: "pending",
    }).sort({ createdAt: -1 });
    const existing = existingDoc ? this.transformNotificationBatch(existingDoc) : undefined;
    const next = updater(existing);
    if (existingDoc) {
      existingDoc.set(next);
      const saved = await existingDoc.save();
      return this.transformNotificationBatch(saved);
    }
    const created = await NotificationBatchModel.create(next);
    return this.transformNotificationBatch(created);
  }

  async claimNextNotificationBatch(now: Date): Promise<NotificationBatch | undefined> {
    const claimed = await NotificationBatchModel.findOneAndUpdate(
      {
        status: "pending",
        nextSendAt: { $lte: now },
      },
      { $set: { status: "sending" } },
      { new: true }
    ).sort({ nextSendAt: 1 });
    return claimed ? this.transformNotificationBatch(claimed) : undefined;
  }

  async markNotificationBatchSent(id: string): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await NotificationBatchModel.findByIdAndUpdate(id, {
      status: "sent",
    });
  }

  async rescheduleNotificationBatch(id: string, nextSendAt: Date): Promise<void> {
    if (!mongoose.isValidObjectId(id)) return;
    await NotificationBatchModel.findByIdAndUpdate(id, {
      status: "pending",
      nextSendAt,
    });
  }

  async getWhatsAppVerificationBatches(
    limit: number = 20
  ): Promise<WhatsAppVerificationBatch[]> {
    const batches = await WhatsAppVerificationBatchModel.find()
      .sort({ createdAt: -1 })
      .limit(Math.max(limit, 0));
    return batches.map((batch) => this.transformWhatsAppVerificationBatch(batch));
  }

  async getWhatsAppVerificationBatch(
    id: string
  ): Promise<WhatsAppVerificationBatch | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const batch = await WhatsAppVerificationBatchModel.findById(id);
    return batch ? this.transformWhatsAppVerificationBatch(batch) : undefined;
  }

  async createWhatsAppVerificationBatch(
    batch: InsertWhatsAppVerificationBatch
  ): Promise<WhatsAppVerificationBatch> {
    const created = await WhatsAppVerificationBatchModel.create(batch);
    return this.transformWhatsAppVerificationBatch(created);
  }

  async updateWhatsAppVerificationBatch(
    id: string,
    data: Partial<InsertWhatsAppVerificationBatch>
  ): Promise<WhatsAppVerificationBatch | undefined> {
    if (!mongoose.isValidObjectId(id)) return undefined;
    const cleanedData: any = { ...data };
    Object.keys(cleanedData).forEach((key) => {
      if (cleanedData[key] === undefined) {
        delete cleanedData[key];
      }
    });
    const updated = await WhatsAppVerificationBatchModel.findByIdAndUpdate(
      id,
      cleanedData,
      { new: true }
    );
    return updated ? this.transformWhatsAppVerificationBatch(updated) : undefined;
  }

  async createWhatsAppVerifications(
    items: InsertWhatsAppVerification[]
  ): Promise<WhatsAppVerification[]> {
    if (!items.length) return [];
    const created = await WhatsAppVerificationModel.insertMany(items);
    return created.map((item) => this.transformWhatsAppVerification(item));
  }

  async getWhatsAppVerificationResults(
    batchId: string,
    limit: number = 0,
    skip: number = 0
  ): Promise<WhatsAppVerification[]> {
    if (!mongoose.isValidObjectId(batchId)) return [];
    const query = WhatsAppVerificationModel.find({ batchId }).sort({ createdAt: -1 });
    if (skip > 0) query.skip(skip);
    if (limit > 0) query.limit(limit);
    const results = await query;
    return results.map((item) => this.transformWhatsAppVerification(item));
  }
}

export const storage = new MongoStorage();

