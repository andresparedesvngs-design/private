import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import { storage } from './storage';
import type { Server as SocketServer } from 'socket.io';

export interface WhatsAppClient {
  id: string;
  client: typeof Client.prototype;
  status: string;
  qrCode?: string;
}

class WhatsAppManager {
  private clients: Map<string, WhatsAppClient> = new Map();
  private io?: SocketServer;

  setSocketServer(io: SocketServer) {
    this.io = io;
  }

  async createSession(sessionId: string): Promise<void> {
    if (this.clients.has(sessionId)) {
      throw new Error('Session already exists');
    }

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId
      }),
      puppeteer: {
        headless: true,
        executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ]
      }
    });

    const whatsappClient: WhatsAppClient = {
      id: sessionId,
      client,
      status: 'initializing'
    };

    this.clients.set(sessionId, whatsappClient);

    client.on('qr', async (qr) => {
      console.log('QR Code generated for session:', sessionId);
      
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
      console.log('WhatsApp client ready:', sessionId);
      whatsappClient.status = 'connected';
      
      const info = client.info;
      const phoneNumber = info?.wid?.user || 'Unknown';
      
      await storage.updateSession(sessionId, {
        status: 'connected',
        phoneNumber: phoneNumber,
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
        message: `Session ${sessionId} connected successfully`,
        metadata: { phoneNumber }
      });
    });

    client.on('authenticated', () => {
      console.log('Client authenticated:', sessionId);
      whatsappClient.status = 'authenticated';
    });

    client.on('auth_failure', async (msg) => {
      console.error('Authentication failed:', sessionId, msg);
      whatsappClient.status = 'auth_failed';
      
      await storage.updateSession(sessionId, {
        status: 'auth_failed'
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
      console.log('Client disconnected:', sessionId, reason);
      whatsappClient.status = 'disconnected';
      
      await storage.updateSession(sessionId, {
        status: 'disconnected'
      });

      if (this.io) {
        this.io.emit('session:disconnected', {
          sessionId,
          reason
        });
      }

      await storage.createSystemLog({
        level: 'warning',
        source: 'whatsapp',
        message: `Session ${sessionId} disconnected`,
        metadata: { reason }
      });
    });

    client.on('message', async (msg) => {
      console.log('Message received:', msg.from, msg.body);
    });

    try {
      await client.initialize();
      console.log('WhatsApp client initialized:', sessionId);
    } catch (error) {
      console.error('Error initializing client:', error);
      throw error;
    }
  }

  async destroySession(sessionId: string): Promise<void> {
    const whatsappClient = this.clients.get(sessionId);
    
    if (!whatsappClient) {
      throw new Error('Session not found');
    }

    try {
      await whatsappClient.client.destroy();
      this.clients.delete(sessionId);
      
      await storage.createSystemLog({
        level: 'info',
        source: 'whatsapp',
        message: `Session ${sessionId} destroyed`,
        metadata: {}
      });

      console.log('Session destroyed:', sessionId);
    } catch (error) {
      console.error('Error destroying session:', error);
      throw error;
    }
  }

  async sendMessage(sessionId: string, phoneNumber: string, message: string): Promise<boolean> {
    const whatsappClient = this.clients.get(sessionId);
    
    if (!whatsappClient) {
      throw new Error('Session not found');
    }

    if (whatsappClient.status !== 'connected') {
      throw new Error('Session not connected');
    }

    try {
      const formattedNumber = phoneNumber.includes('@c.us') 
        ? phoneNumber 
        : `${phoneNumber}@c.us`;
      
      await whatsappClient.client.sendMessage(formattedNumber, message);
      
      await storage.updateSession(sessionId, {
        messagesSent: (await storage.getSession(sessionId))!.messagesSent + 1,
        lastActive: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  getSession(sessionId: string): WhatsAppClient | undefined {
    return this.clients.get(sessionId);
  }

  getAllSessions(): WhatsAppClient[] {
    return Array.from(this.clients.values());
  }

  async restoreSessions(): Promise<void> {
    console.log('Restoring sessions from database...');
    
    const sessions = await storage.getSessions();
    const connectedSessions = sessions.filter(s => 
      s.status === 'connected' || s.status === 'qr_ready'
    );

    for (const session of connectedSessions) {
      try {
        console.log('Restoring session:', session.id);
        await this.createSession(session.id);
      } catch (error) {
        console.error('Error restoring session:', session.id, error);
      }
    }
  }
}

export const whatsappManager = new WhatsAppManager();
