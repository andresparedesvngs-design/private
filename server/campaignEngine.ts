import { storage } from './storage';
import { whatsappManager } from './whatsappManager';
import type { Campaign, Pool, Debtor } from '@shared/schema';
import type { Server as SocketServer } from 'socket.io';

class CampaignEngine {
  private activeCampaigns: Map<string, boolean> = new Map();
  private io?: SocketServer;

  setSocketServer(io: SocketServer) {
    this.io = io;
  }

  async startCampaign(campaignId: string): Promise<void> {
    if (this.activeCampaigns.get(campaignId)) {
      throw new Error('Campaign is already running');
    }

    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!campaign.poolId) {
      throw new Error('Campaign must have a pool assigned');
    }

    const pool = await storage.getPool(campaign.poolId);
    if (!pool) {
      throw new Error('Pool not found');
    }

    if (!pool.sessionIds || pool.sessionIds.length === 0) {
      throw new Error('Pool has no sessions assigned');
    }

    this.activeCampaigns.set(campaignId, true);

    await storage.createSystemLog({
      level: 'info',
      source: 'campaign',
      message: `Starting campaign: ${campaign.name}`,
      metadata: { campaignId, poolId: pool.id }
    });

    this.processCampaign(campaignId, campaign, pool).catch((error) => {
      console.error('Error processing campaign:', error);
      this.activeCampaigns.delete(campaignId);
    });
  }

  async stopCampaign(campaignId: string): Promise<void> {
    this.activeCampaigns.delete(campaignId);
    
    await storage.updateCampaign(campaignId, {
      status: 'paused'
    });

    await storage.createSystemLog({
      level: 'info',
      source: 'campaign',
      message: `Campaign paused: ${campaignId}`,
      metadata: { campaignId }
    });
  }

  private async processCampaign(campaignId: string, campaign: Campaign, pool: Pool): Promise<void> {
    const allDebtors = await storage.getDebtors();
    const availableDebtors = allDebtors.filter(d => d.status === 'disponible');

    await storage.createSystemLog({
      level: 'info',
      source: 'campaign',
      message: `Found ${availableDebtors.length} available debtors to process`,
      metadata: { campaignId, totalDebtors: allDebtors.length, availableDebtors: availableDebtors.length }
    });

    if (availableDebtors.length === 0) {
      await storage.updateCampaign(campaignId, {
        status: 'completed',
        completedAt: new Date()
      });
      
      await storage.createSystemLog({
        level: 'warn',
        source: 'campaign',
        message: `Campaign completed with no available debtors`,
        metadata: { campaignId }
      });
      
      this.activeCampaigns.delete(campaignId);
      return;
    }

    await storage.updateCampaign(campaignId, {
      totalDebtors: availableDebtors.length
    });

    let sessionIndex = 0;
    let sentCount = 0;
    let failedCount = 0;

    for (const debtor of availableDebtors) {
      if (!this.activeCampaigns.get(campaignId)) {
        break;
      }

      const connectedSessions = this.getConnectedSessions(pool);
      
      if (connectedSessions.length === 0) {
        await storage.createSystemLog({
          level: 'error',
          source: 'campaign',
          message: `No connected sessions available. Pausing campaign.`,
          metadata: { campaignId }
        });
        
        await storage.updateCampaign(campaignId, {
          status: 'paused'
        });
        
        this.activeCampaigns.delete(campaignId);
        
        if (this.io) {
          this.io.emit('campaign:error', {
            campaignId,
            error: 'No hay sesiones conectadas disponibles'
          });
        }
        return;
      }

      await storage.updateDebtor(debtor.id, {
        status: 'procesando'
      });

      const sessionId = this.getNextSession(pool, sessionIndex, connectedSessions);
      sessionIndex++;
      
      if (!sessionId) {
        failedCount++;
        await storage.updateDebtor(debtor.id, { status: 'fallado' });
        continue;
      }

      try {
        const success = await this.sendMessage(sessionId, debtor, campaign);

        if (success) {
          sentCount++;
          
          await storage.updateDebtor(debtor.id, {
            status: 'completado',
            lastContact: new Date()
          });

          await storage.createMessage({
            campaignId: campaign.id,
            debtorId: debtor.id,
            sessionId,
            content: campaign.message,
            status: 'sent',
            sentAt: new Date()
          });

          const progress = Math.round(((sentCount + failedCount) / availableDebtors.length) * 100);
          const updatedCampaign = await storage.updateCampaign(campaignId, {
            sent: sentCount,
            failed: failedCount,
            progress
          });

          if (this.io && updatedCampaign) {
            this.io.emit('campaign:progress', updatedCampaign);
          }
        } else {
          failedCount++;
          
          await storage.updateDebtor(debtor.id, {
            status: 'fallado'
          });

          await storage.createMessage({
            campaignId: campaign.id,
            debtorId: debtor.id,
            sessionId,
            content: campaign.message,
            status: 'failed',
            error: 'Failed to send message'
          });

          const progress = Math.round(((sentCount + failedCount) / availableDebtors.length) * 100);
          const updatedCampaign = await storage.updateCampaign(campaignId, {
            sent: sentCount,
            failed: failedCount,
            progress
          });

          if (this.io && updatedCampaign) {
            this.io.emit('campaign:progress', updatedCampaign);
          }
        }
      } catch (error: any) {
        failedCount++;
        console.error('Error sending message:', error.message);
        
        await storage.updateDebtor(debtor.id, {
          status: 'fallado'
        });

        await storage.createMessage({
          campaignId: campaign.id,
          debtorId: debtor.id,
          sessionId,
          content: campaign.message,
          status: 'failed',
          error: error.message
        });

        const progress = Math.round(((sentCount + failedCount) / availableDebtors.length) * 100);
        await storage.updateCampaign(campaignId, {
          sent: sentCount,
          failed: failedCount,
          progress
        });
      }

      const delay = this.calculateDelay(pool);
      await this.sleep(delay);
    }

    await storage.updateCampaign(campaignId, {
      status: 'completed',
      completedAt: new Date()
    });

    this.activeCampaigns.delete(campaignId);

    await storage.createSystemLog({
      level: 'info',
      source: 'campaign',
      message: `Campaign completed: ${campaign.name}`,
      metadata: { campaignId }
    });
  }

  private getConnectedSessions(pool: Pool): string[] {
    const connectedInMemory = whatsappManager.getConnectedSessionIds();
    return pool.sessionIds.filter(id => connectedInMemory.includes(id));
  }

  private getNextSession(pool: Pool, index: number, connectedSessions: string[]): string | null {
    if (connectedSessions.length === 0) {
      return null;
    }

    if (pool.strategy === 'fixed_turns' || pool.strategy === 'turnos_fijos') {
      return connectedSessions[index % connectedSessions.length];
    } else if (pool.strategy === 'random_turns' || pool.strategy === 'turnos_aleatorios') {
      const randomIndex = Math.floor(Math.random() * connectedSessions.length);
      return connectedSessions[randomIndex];
    } else {
      return connectedSessions[index % connectedSessions.length];
    }
  }

  private calculateDelay(pool: Pool): number {
    const variation = Math.floor(Math.random() * pool.delayVariation * 2) - pool.delayVariation;
    return pool.delayBase + variation;
  }

  private async sendMessage(sessionId: string, debtor: Debtor, campaign: Campaign): Promise<boolean> {
    try {
      const personalizedMessage = campaign.message
        .replace('{nombre}', debtor.name)
        .replace('{name}', debtor.name)
        .replace('{deuda}', debtor.debt.toString())
        .replace('{debt}', debtor.debt.toString())
        .replace('{phone}', debtor.phone);

      await whatsappManager.sendMessage(sessionId, debtor.phone, personalizedMessage);
      
      await storage.createSystemLog({
        level: 'info',
        source: 'campaign',
        message: `Message sent to ${debtor.name}`,
        metadata: { debtorId: debtor.id, sessionId }
      });

      return true;
    } catch (error: any) {
      await storage.createSystemLog({
        level: 'error',
        source: 'campaign',
        message: `Failed to send message to ${debtor.name}: ${error.message}`,
        metadata: { debtorId: debtor.id, sessionId, error: error.message }
      });

      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const campaignEngine = new CampaignEngine();
