import { drizzle } from "drizzle-orm/node-postgres";
import pkg from 'pg';
const { Pool } = pkg;
import { eq, desc, and, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  User,
  InsertUser,
  Session,
  InsertSession,
  Pool as PoolType,
  InsertPool,
  Campaign,
  InsertCampaign,
  Debtor,
  InsertDebtor,
  Message,
  InsertMessage,
  SystemLog,
  InsertSystemLog,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | undefined>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, data: Partial<InsertSession>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;

  getPools(): Promise<PoolType[]>;
  getPool(id: string): Promise<PoolType | undefined>;
  createPool(pool: InsertPool): Promise<PoolType>;
  updatePool(id: string, data: Partial<InsertPool>): Promise<PoolType | undefined>;
  deletePool(id: string): Promise<void>;

  getCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, data: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string): Promise<void>;

  getDebtors(campaignId?: string): Promise<Debtor[]>;
  getDebtor(id: string): Promise<Debtor | undefined>;
  createDebtor(debtor: InsertDebtor): Promise<Debtor>;
  createDebtors(debtors: InsertDebtor[]): Promise<Debtor[]>;
  updateDebtor(id: string, data: Partial<InsertDebtor>): Promise<Debtor | undefined>;
  deleteDebtor(id: string): Promise<void>;

  getMessages(campaignId?: string): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined>;

  getSystemLogs(limit?: number): Promise<SystemLog[]>;
  createSystemLog(log: InsertSystemLog): Promise<SystemLog>;
  
  resetDebtorsStatus(): Promise<number>;

  getDashboardStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalCampaigns: number;
    activeCampaigns: number;
    totalDebtors: number;
    messagesSent: number;
  }>;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(schema.users).values(insertUser).returning();
    return result[0];
  }

  async getSessions(): Promise<Session[]> {
    return await db.select().from(schema.sessions).orderBy(desc(schema.sessions.createdAt));
  }

  async getSession(id: string): Promise<Session | undefined> {
    const result = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id));
    return result[0];
  }

  async createSession(session: InsertSession): Promise<Session> {
    const result = await db.insert(schema.sessions).values(session).returning();
    return result[0];
  }

  async updateSession(id: string, data: Partial<InsertSession>): Promise<Session | undefined> {
    const result = await db.update(schema.sessions).set(data).where(eq(schema.sessions.id, id)).returning();
    return result[0];
  }

  async deleteSession(id: string): Promise<void> {
    await db.update(schema.messages).set({ sessionId: null }).where(eq(schema.messages.sessionId, id));
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
  }

  async getPools(): Promise<PoolType[]> {
    return await db.select().from(schema.pools).orderBy(desc(schema.pools.createdAt));
  }

  async getPool(id: string): Promise<PoolType | undefined> {
    const result = await db.select().from(schema.pools).where(eq(schema.pools.id, id));
    return result[0];
  }

  async createPool(pool: InsertPool): Promise<PoolType> {
    const result = await db.insert(schema.pools).values(pool).returning();
    return result[0];
  }

  async updatePool(id: string, data: Partial<InsertPool>): Promise<PoolType | undefined> {
    const result = await db.update(schema.pools).set(data).where(eq(schema.pools.id, id)).returning();
    return result[0];
  }

  async deletePool(id: string): Promise<void> {
    await db.delete(schema.pools).where(eq(schema.pools.id, id));
  }

  async getCampaigns(): Promise<Campaign[]> {
    return await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.createdAt));
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const result = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
    return result[0];
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const result = await db.insert(schema.campaigns).values(campaign).returning();
    return result[0];
  }

  async updateCampaign(id: string, data: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const result = await db.update(schema.campaigns).set(data).where(eq(schema.campaigns.id, id)).returning();
    return result[0];
  }

  async deleteCampaign(id: string): Promise<void> {
    await db.delete(schema.messages).where(eq(schema.messages.campaignId, id));
    await db.update(schema.debtors).set({ campaignId: null }).where(eq(schema.debtors.campaignId, id));
    await db.delete(schema.campaigns).where(eq(schema.campaigns.id, id));
  }

  async getDebtors(campaignId?: string): Promise<Debtor[]> {
    if (campaignId) {
      return await db.select().from(schema.debtors).where(eq(schema.debtors.campaignId, campaignId)).orderBy(desc(schema.debtors.createdAt));
    }
    return await db.select().from(schema.debtors).orderBy(desc(schema.debtors.createdAt));
  }

  async getDebtor(id: string): Promise<Debtor | undefined> {
    const result = await db.select().from(schema.debtors).where(eq(schema.debtors.id, id));
    return result[0];
  }

  async createDebtor(debtor: InsertDebtor): Promise<Debtor> {
    const result = await db.insert(schema.debtors).values(debtor).returning();
    return result[0];
  }

  async createDebtors(debtors: InsertDebtor[]): Promise<Debtor[]> {
    if (debtors.length === 0) return [];
    const result = await db.insert(schema.debtors).values(debtors).returning();
    return result;
  }

  async updateDebtor(id: string, data: Partial<InsertDebtor>): Promise<Debtor | undefined> {
    const result = await db.update(schema.debtors).set(data).where(eq(schema.debtors.id, id)).returning();
    return result[0];
  }

  async deleteDebtor(id: string): Promise<void> {
    await db.delete(schema.debtors).where(eq(schema.debtors.id, id));
  }

  async getMessages(campaignId?: string): Promise<Message[]> {
    if (campaignId) {
      return await db.select().from(schema.messages).where(eq(schema.messages.campaignId, campaignId)).orderBy(desc(schema.messages.createdAt));
    }
    return await db.select().from(schema.messages).orderBy(desc(schema.messages.createdAt));
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const result = await db.select().from(schema.messages).where(eq(schema.messages.id, id));
    return result[0];
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const result = await db.insert(schema.messages).values(message).returning();
    return result[0];
  }

  async updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message | undefined> {
    const result = await db.update(schema.messages).set(data).where(eq(schema.messages.id, id)).returning();
    return result[0];
  }

  async getSystemLogs(limit: number = 100): Promise<SystemLog[]> {
    return await db.select().from(schema.systemLogs).orderBy(desc(schema.systemLogs.createdAt)).limit(limit);
  }

  async createSystemLog(log: InsertSystemLog): Promise<SystemLog> {
    const result = await db.insert(schema.systemLogs).values(log).returning();
    return result[0];
  }

  async resetDebtorsStatus(): Promise<number> {
    const result = await db.update(schema.debtors)
      .set({ status: 'disponible' })
      .where(sql`${schema.debtors.status} IN ('fallado', 'completado')`)
      .returning();
    return result.length;
  }

  async getDashboardStats() {
    const sessions = await db.select().from(schema.sessions);
    const campaigns = await db.select().from(schema.campaigns);
    const debtors = await db.select().from(schema.debtors);
    
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.status === 'connected').length,
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'active').length,
      totalDebtors: debtors.length,
      messagesSent: sessions.reduce((sum, s) => sum + (s.messagesSent || 0), 0),
    };
  }
}

export const storage = new DbStorage();
