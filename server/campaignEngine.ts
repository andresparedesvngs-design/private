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
    const debtors = await storage.getDebtors(campaignId);
    const availableDebtors = debtors.filter(d => d.status === 'disponible');

    if (availableDebtors.length === 0) {
      await storage.updateCampaign(campaignId, {
        status: 'completed',
        completedAt: new Date()
      });
      
      this.activeCampaigns.delete(campaignId);
      return;
    }

    let sessionIndex = 0;

    for (const debtor of availableDebtors) {
      if (!this.activeCampaigns.get(campaignId)) {
        break;
      }

      await storage.updateDebtor(debtor.id, {
        status: 'procesando'
      });

      const sessionId = this.getNextSession(pool, sessionIndex);
      sessionIndex++;

      try {
        const success = await this.sendMessage(sessionId, debtor, campaign);

        if (success) {
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

          const updatedCampaign = await storage.updateCampaign(campaignId, {
            sent: campaign.sent + 1,
            progress: Math.round(((campaign.sent + 1) / campaign.totalDebtors) * 100)
          });

          if (this.io && updatedCampaign) {
            this.io.emit('campaign:progress', updatedCampaign);
          }
        } else {
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

          const updatedCampaign = await storage.updateCampaign(campaignId, {
            failed: campaign.failed + 1
          });

          if (this.io && updatedCampaign) {
            this.io.emit('campaign:progress', updatedCampaign);
          }
        }
      } catch (error: any) {
        console.error('Error sending message:', error);
        
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

  private getNextSession(pool: Pool, index: number): string {
    if (pool.strategy === 'turnos_fijos') {
      return pool.sessionIds[index % pool.sessionIds.length];
    } else if (pool.strategy === 'turnos_aleatorios') {
      const randomIndex = Math.floor(Math.random() * pool.sessionIds.length);
      return pool.sessionIds[randomIndex];
    } else {
      return pool.sessionIds[index % pool.sessionIds.length];
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
        .replace('{deuda}', debtor.debt.toString());

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
