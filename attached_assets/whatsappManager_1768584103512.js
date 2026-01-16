// backend/services/whatsappManager.js - VERSIÓN COMPLETA Y TERMINADA
const { Client } = require('whatsapp-web.js');
const CustomLocalAuth = require('./CustomLocalAuth');
const qrcode = require('qrcode-terminal');
const { v4: uuidv4 } = require('uuid');
const SessionManager = require('./sessionManager');
const CleanupService = require('./CleanupService');

class WhatsAppManager {
  constructor() {
    // ===== MAPAS DE SESIONES =====
    this.sessions = new Map();
    this.activeSessions = new Map();
    this.zombieSessions = new Map();
    this.sessionsMarkedForRemoval = new Set();
    this.restoringSessions = new Set();
    
    // ===== SERVICIOS =====
    this.sessionManager = new SessionManager();
    this.cleanupService = new CleanupService();
    this.io = null;
    
    // ===== ESTADO DE CAMPAÑA ACTUAL =====
    this.currentCampaignPools = null;
    this.lastCampaignResults = null;
    
    // ===== SISTEMA DE PAUSA INTELIGENTE =====
    this.campaignPaused = false;
    this.pauseReason = null;
    this.pauseStartTime = null;
    this.pauseTimeout = null;
    this.disconnectedSessionsInCampaign = new Map();
    this.sessionReplacementQueue = new Map();
    
    // ===== CONFIGURACIÓN DE PAUSA =====
    this.pauseConfig = {
      defaultPauseTime: 5000,
      maxPauseTime: 30000,
      minPauseTime: 3000,
      autoResume: true,
      notifyFrontend: true
    };

    // ===== ESTADÍSTICAS =====
    this.stats = {
      totalMessages: 0,
      successful: 0,
      failed: 0,
      blockedSessions: 0,
      skippedMessages: 0,
      campaignPauses: 0,
      sessionReplacements: 0,
      automaticResumes: 0
    };

    // ===== MANEJO DE RESPUESTAS =====
    this.messageResponses = new Map();
    this.responseHandlers = [];

    // ===== SISTEMA DE TRACKING DE MENSAJES =====
    this.messageTracking = new Map();
    this.activeMessageIntervals = new Map();

    // ===== INICIALIZACIÓN =====
    this.startZombieCleanup();
    this.startSlowCleanupWorker();

    setTimeout(() => {
      this.restoreSessions();
    }, 3000);

    console.log('🔧 WhatsApp Manager inicializado con PAUSA INTELIGENTE Y TRACKING COMPLETO');
  }

  // ===== SISTEMA DE TRACKING DE MENSAJES =====
  async sendMessageWithTracking(sessionId, phoneNumber, message, campaignId = null) {
    try {
      console.log(`✉️ Enviando mensaje con tracking a: ${phoneNumber}`);
      
      const result = await this.sendMessage(sessionId, phoneNumber, message);
      
      if (result.success) {
        const messageId = result.messageId;
        
        const trackingInfo = {
          messageId,
          sessionId,
          phoneNumber,
          campaignId,
          status: 'sent',
          sentAt: new Date(),
          delivered: false,
          read: false,
          blocked: false,
          error: null,
          messageContent: message,
          tracking: {
            sent: new Date(),
            delivered: null,
            read: null,
            blocked: null,
            lastUpdate: new Date()
          }
        };
        
        this.messageTracking.set(messageId, trackingInfo);
        this.setupMessageTracking(sessionId, messageId, phoneNumber);
        
        return {
          ...result,
          tracking: trackingInfo
        };
      }
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error en sendMessageWithTracking:`, error);
      return {
        success: false,
        error: error.message,
        status: 'failed'
      };
    }
  }

  setupMessageTracking(sessionId, messageId, phoneNumber) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.client) return;

    const client = session.client;
    
    const checkMessageStatus = async () => {
      try {
        const message = await client.getMessageById(messageId);
        
        if (message) {
          const trackingInfo = this.messageTracking.get(messageId);
          if (!trackingInfo) return;
          
          let statusChanged = false;
          
          if (message.ack === 2 && !trackingInfo.delivered) {
            trackingInfo.delivered = true;
            trackingInfo.status = 'delivered';
            trackingInfo.tracking.delivered = new Date();
            statusChanged = true;
            console.log(`✅ Mensaje entregado a: ${phoneNumber}`);
          }
          
          if (message.ack === 3 && !trackingInfo.read) {
            trackingInfo.read = true;
            trackingInfo.status = 'read';
            trackingInfo.tracking.read = new Date();
            statusChanged = true;
            console.log(`📖 Mensaje leído por: ${phoneNumber}`);
          }
          
          if (message.ack === -1 || (message.ack === 0 && trackingInfo.sentAt)) {
            const timeSinceSent = Date.now() - trackingInfo.sentAt.getTime();
            if (timeSinceSent > 300000 && !trackingInfo.delivered) {
              trackingInfo.blocked = true;
              trackingInfo.status = 'blocked';
              trackingInfo.tracking.blocked = new Date();
              statusChanged = true;
              console.log(`🚫 Mensaje probablemente bloqueado para: ${phoneNumber}`);
            }
          }
          
          if (statusChanged) {
            trackingInfo.tracking.lastUpdate = new Date();
            this.messageTracking.set(messageId, trackingInfo);
            
            this.emitToFrontend('message_status_update', {
              messageId,
              phoneNumber,
              sessionId,
              status: trackingInfo.status,
              delivered: trackingInfo.delivered,
              read: trackingInfo.read,
              blocked: trackingInfo.blocked,
              tracking: trackingInfo.tracking
            });
          }
        }
      } catch (error) {
        // Ignorar errores
      }
    };
    
    let checkCount = 0;
    const maxChecks = 12;
    
    const intervalId = setInterval(() => {
      checkMessageStatus();
      checkCount++;
      
      if (checkCount >= maxChecks) {
        clearInterval(intervalId);
        this.activeMessageIntervals.delete(messageId);
        
        const trackingInfo = this.messageTracking.get(messageId);
        if (trackingInfo && !trackingInfo.delivered && !trackingInfo.blocked) {
          trackingInfo.status = 'pending';
          trackingInfo.tracking.lastUpdate = new Date();
          this.messageTracking.set(messageId, trackingInfo);
          
          this.emitToFrontend('message_status_update', {
            messageId,
            phoneNumber,
            sessionId,
            status: 'pending',
            delivered: false,
            read: false,
            blocked: false,
            note: 'Estado final: pendiente de confirmación'
          });
        }
      }
    }, 10000);
    
    this.activeMessageIntervals.set(messageId, intervalId);
    
    setTimeout(() => {
      this.clearMessageTracking(messageId);
    }, 24 * 60 * 60 * 1000);
  }

  clearMessageTracking(messageId) {
    const intervalId = this.activeMessageIntervals.get(messageId);
    if (intervalId) {
      clearInterval(intervalId);
      this.activeMessageIntervals.delete(messageId);
    }
    this.messageTracking.delete(messageId);
  }

  getMessageStatus(messageId) {
    return this.messageTracking.get(messageId) || null;
  }

  getCampaignMessageStats(campaignId) {
    const stats = {
      total: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      blocked: 0,
      failed: 0,
      pending: 0,
      successRate: 0
    };
    
    for (const [messageId, tracking] of this.messageTracking.entries()) {
      if (tracking.campaignId === campaignId) {
        stats.total++;
        
        switch (tracking.status) {
          case 'sent': stats.sent++; break;
          case 'delivered': stats.delivered++; break;
          case 'read': stats.read++; break;
          case 'blocked': stats.blocked++; break;
          case 'failed': stats.failed++; break;
          case 'pending': stats.pending++; break;
        }
      }
    }
    
    if (stats.total > 0) {
      const successful = stats.delivered + stats.read;
      stats.successRate = (successful / stats.total) * 100;
    }
    
    return stats;
  }

  // ===== SISTEMA DE PAUSA INTELIGENTE =====
  pauseCampaignForReplacement(disconnectedSessionId, reason) {
    console.log(`\n⏸️ PAUSA INTELIGENTE ACTIVADA: ${reason}`);
    
    this.stats.campaignPauses++;
    this.campaignPaused = true;
    this.pauseReason = reason;
    this.pauseStartTime = Date.now();
    
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
    }
    
    if (this.pauseConfig.notifyFrontend) {
      this.emitToFrontend('campaign_paused_for_replacement', {
        disconnectedSessionId,
        reason,
        pausedAt: new Date().toISOString(),
        expectedResumeIn: this.pauseConfig.defaultPauseTime,
        pauseId: `pause_${Date.now()}`,
        timestamp: Date.now()
      });
    }
    
    if (this.pauseConfig.autoResume) {
      this.pauseTimeout = setTimeout(() => {
        this.resumeCampaignAfterReplacement(disconnectedSessionId);
      }, this.pauseConfig.defaultPauseTime);
      
      console.log(`⏰ Reanudación automática en ${this.pauseConfig.defaultPauseTime / 1000} segundos`);
    }
    
    return {
      success: true,
      pauseId: `pause_${Date.now()}`,
      duration: this.pauseConfig.defaultPauseTime,
      reason
    };
  }

  async resumeCampaignAfterReplacement(disconnectedSessionId) {
    if (!this.campaignPaused) return;
    
    console.log(`\n▶️ REANUDANDO CAMPAÑA DESPUÉS DE REEMPLAZO...`);
    
    const pauseDuration = Date.now() - this.pauseStartTime;
    const replacement = await this.findSessionReplacement(disconnectedSessionId);
    
    if (replacement.found) {
      console.log(`🔄 REEMPLAZO ENCONTRADO: ${replacement.oldPhoneNumber} → ${replacement.newPhoneNumber}`);
      
      const updateSuccess = this.updateCampaignPoolsWithReplacement(
        disconnectedSessionId, 
        replacement.newSessionId
      );
      
      if (updateSuccess) {
        this.stats.sessionReplacements++;
        
        this.emitToFrontend('campaign_session_replaced', {
          disconnectedSessionId,
          newSessionId: replacement.newSessionId,
          oldPhoneNumber: replacement.oldPhoneNumber,
          newPhoneNumber: replacement.newPhoneNumber,
          replacementTime: pauseDuration,
          resumedAt: new Date().toISOString(),
          pauseId: `pause_${this.pauseStartTime}`,
          automatic: true
        });
        
        console.log(`✅ Reemplazo automático exitoso en ${pauseDuration}ms`);
      }
    } else {
      console.log(`⚠️ NO SE ENCONTRÓ REEMPLAZO para ${disconnectedSessionId}`);
      
      this.emitToFrontend('campaign_session_lost', {
        disconnectedSessionId,
        oldPhoneNumber: replacement.oldPhoneNumber,
        note: 'No hay sesiones de reemplazo disponibles',
        resumedAt: new Date().toISOString(),
        campaignContinues: true,
        pauseId: `pause_${this.pauseStartTime}`
      });
    }
    
    this.campaignPaused = false;
    this.pauseReason = null;
    this.pauseStartTime = null;
    this.pauseTimeout = null;
    
    this.emitToFrontend('campaign_resumed', {
      reason: 'session_replacement_completed',
      disconnectedSessionId,
      hasReplacement: replacement.found,
      resumedAt: new Date().toISOString(),
      totalPauseTime: pauseDuration,
      pauseId: `pause_${this.pauseStartTime}`
    });
    
    this.stats.automaticResumes++;
    
    return {
      success: true,
      resumed: true,
      hadReplacement: replacement.found,
      pauseDuration
    };
  }

  async findSessionReplacement(disconnectedSessionId) {
    console.log(`🔍 BUSCANDO REEMPLAZO PARA: ${disconnectedSessionId}`);
    
    const disconnectedSession = this.sessions.get(disconnectedSessionId);
    if (!disconnectedSession) {
      console.log(`❌ Sesión desconectada no encontrada en memoria`);
      return { found: false, reason: 'disconnected_session_not_found' };
    }
    
    const oldPhoneNumber = disconnectedSession.phoneNumber;
    const allActiveSessions = this.getActiveSessions();
    const currentCampaignSessionPhones = this.getCurrentCampaignSessionPhones();
    
    console.log(`📊 Sesiones activas totales: ${allActiveSessions.length}`);
    console.log(`📊 Sesiones en campaña actual: ${currentCampaignSessionPhones.length}`);
    
    const availableReplacement = allActiveSessions.find(session => {
      const notInCampaign = !currentCampaignSessionPhones.includes(session.phoneNumber);
      const isConnected = session.status === 'connected';
      const notMarked = !this.sessionsMarkedForRemoval.has(session.sessionId);
      
      return notInCampaign && isConnected && notMarked;
    });
    
    if (availableReplacement) {
      console.log(`✅ Reemplazo encontrado en sesiones activas: ${availableReplacement.phoneNumber}`);
      
      return {
        found: true,
        newSessionId: availableReplacement.sessionId,
        newPhoneNumber: availableReplacement.phoneNumber,
        oldPhoneNumber,
        sessionData: availableReplacement,
        source: 'active_pool'
      };
    }
    
    const allSessions = Array.from(this.sessions.entries());
    const restorableSessions = allSessions.filter(([sessionId, sessionData]) => {
      const isDisconnected = sessionData.status === 'disconnected';
      const notThisSession = sessionId !== disconnectedSessionId;
      const notBlocked = !sessionData.isBlocked;
      const hasSessionFiles = this.sessionManager.sessionExistsInWhatsApp(sessionId);
      
      return isDisconnected && notThisSession && notBlocked && hasSessionFiles;
    });
    
    if (restorableSessions.length > 0) {
      const [sessionId, sessionData] = restorableSessions[0];
      console.log(`🔄 Reemplazo encontrado en sesiones restaurables: ${sessionData.phoneNumber}`);
      
      return {
        found: true,
        newSessionId: sessionId,
        newPhoneNumber: sessionData.phoneNumber,
        oldPhoneNumber,
        sessionData,
        source: 'restorable_pool'
      };
    }
    
    console.log(`❌ No hay sesiones disponibles para reemplazo`);
    
    return { 
      found: false, 
      reason: 'no_available_sessions',
      oldPhoneNumber
    };
  }

  getCurrentCampaignSessionPhones() {
    if (!this.currentCampaignPools) return [];
    
    const phones = [];
    this.currentCampaignPools.forEach(pool => {
      if (pool.sessions && Array.isArray(pool.sessions)) {
        pool.sessions.forEach(phone => {
          if (phone !== null && phone !== undefined) {
            phones.push(phone);
          }
        });
      }
    });
    
    return [...new Set(phones)];
  }

  removeSessionFromPoolsButKeepReference(sessionId, phoneNumber) {
    console.log(`🔄 Removiendo ${phoneNumber} de pools (manteniendo índice)...`);
    
    let removedCount = 0;
    
    if (this.currentCampaignPools) {
      this.currentCampaignPools.forEach(pool => {
        if (pool.sessions && Array.isArray(pool.sessions)) {
          for (let i = 0; i < pool.sessions.length; i++) {
            if (pool.sessions[i] === phoneNumber) {
              pool.sessions[i] = null;
              removedCount++;
              console.log(`   → Marcada como null en índice ${i} del pool "${pool.name}"`);
              
              if (!this.disconnectedSessionsInCampaign.has(sessionId)) {
                this.disconnectedSessionsInCampaign.set(sessionId, {
                  phoneNumber,
                  poolName: pool.name,
                  poolIndex: i,
                  disconnectedAt: new Date(),
                  originalIndex: i
                });
              }
            }
          }
        }
      });
    }
    
    console.log(`✅ ${removedCount} referencias removidas de pools`);
    return removedCount;
  }

  updateCampaignPoolsWithReplacement(oldSessionId, newSessionId) {
    if (!this.currentCampaignPools) {
      console.log(`❌ No hay campaña activa para actualizar`);
      return false;
    }
    
    const oldSession = this.sessions.get(oldSessionId);
    const newSession = this.sessions.get(newSessionId);
    
    if (!oldSession) {
      console.log(`❌ Sesión antigua no encontrada: ${oldSessionId}`);
      return false;
    }
    
    if (!newSession) {
      console.log(`❌ Nueva sesión no encontrada: ${newSessionId}`);
      return false;
    }
    
    console.log(`🔄 ACTUALIZANDO POOLS: ${oldSession.phoneNumber} → ${newSession.phoneNumber}`);
    
    let replacementsMade = 0;
    const replacementDetails = [];
    
    this.currentCampaignPools.forEach(pool => {
      if (pool.sessions && Array.isArray(pool.sessions)) {
        for (let i = 0; i < pool.sessions.length; i++) {
          if (pool.sessions[i] === null) {
            const disconnectedSession = this.disconnectedSessionsInCampaign.get(oldSessionId);
            if (disconnectedSession && 
                disconnectedSession.poolName === pool.name && 
                disconnectedSession.poolIndex === i) {
              
              pool.sessions[i] = newSession.phoneNumber;
              replacementsMade++;
              
              replacementDetails.push({
                poolName: pool.name,
                index: i,
                oldPhone: oldSession.phoneNumber,
                newPhone: newSession.phoneNumber,
                method: 'null_replacement'
              });
              
              console.log(`   ✅ Pool "${pool.name}": índice ${i} reemplazado (null → ${newSession.phoneNumber})`);
            }
          }
        }
        
        for (let i = 0; i < pool.sessions.length; i++) {
          if (pool.sessions[i] === oldSession.phoneNumber) {
            pool.sessions[i] = newSession.phoneNumber;
            replacementsMade++;
            
            replacementDetails.push({
              poolName: pool.name,
              index: i,
              oldPhone: oldSession.phoneNumber,
              newPhone: newSession.phoneNumber,
              method: 'direct_replacement'
            });
            
            console.log(`   ✅ Pool "${pool.name}": reemplazo directo en índice ${i}`);
          }
        }
      }
    });
    
    this.disconnectedSessionsInCampaign.delete(oldSessionId);
    console.log(`✅ ${replacementsMade} reemplazos realizados en pools`);
    
    if (replacementsMade > 0) {
      this.emitToFrontend('campaign_pools_updated', {
        oldSessionId,
        newSessionId,
        oldPhoneNumber: oldSession.phoneNumber,
        newPhoneNumber: newSession.phoneNumber,
        replacementsMade,
        replacementDetails,
        pools: this.currentCampaignPools.map(p => ({
          name: p.name,
          sessions: p.sessions,
          sessionCount: p.sessions.filter(s => s !== null).length,
          nullCount: p.sessions.filter(s => s === null).length
        }))
      });
    }
    
    return replacementsMade > 0;
  }

  isSessionInCurrentCampaign(sessionId) {
    if (!this.currentCampaignPools) return false;
    
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    for (const pool of this.currentCampaignPools) {
      if (pool.sessions && pool.sessions.includes(session.phoneNumber)) {
        return true;
      }
    }
    
    return false;
  }

  // ===== GESTIÓN DE SESIONES =====
  startZombieCleanup() {
    if (this.zombieCleanupInterval) {
      clearInterval(this.zombieCleanupInterval);
    }
    
    this.zombieCleanupInterval = setInterval(() => {
      this.cleanupZombieSessions();
    }, 60000);
    
    console.log('🧹 Sistema de limpieza zombie iniciado');
  }

  startSlowCleanupWorker() {
    setInterval(() => {
      this.cleanupOldDisconnectedSessions();
    }, 3600000);
    
    console.log('⏰ Worker de limpieza lenta iniciado (sesiones >24h desconectadas)');
  }

  setIO(io) {
    this.io = io;
    console.log('✅ IO establecido en WhatsAppManager');
  }

  async addSession(phoneNumber) {
    try {
      if (this.hasExistingSession(phoneNumber)) {
        return { 
          success: false, 
          error: `Ya existe una sesión activa para el número ${phoneNumber}. Elimina la sesión existente primero.` 
        };
      }
      
      const sessionId = uuidv4();
      console.log(`\n🎯 CREANDO NUEVA SESIÓN: ${phoneNumber} -> ${sessionId}`);
      return await this.createSession(sessionId, phoneNumber, false);
    } catch (error) {
      console.error('💥 Error añadiendo sesión:', error);
      return { success: false, error: error.message };
    }
  }

  hasExistingSession(phoneNumber) {
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      if (sessionData.phoneNumber === phoneNumber) {
        if (this.sessionsMarkedForRemoval.has(sessionId)) {
          continue;
        }
        const status = sessionData.status;
        if (['connected', 'qr_ready', 'authenticated', 'initializing'].includes(status)) {
          console.log(`⚠️ Sesión duplicada encontrada: ${phoneNumber} (${status})`);
          return true;
        }
      }
    }
    
    const allSessions = this.sessionManager.getAllSessions();
    for (const [sessionId, sessionData] of Object.entries(allSessions)) {
      if (sessionData.phoneNumber === phoneNumber) {
        if (sessionData.markedForCleanup) {
          continue;
        }
        const status = sessionData.status;
        if (['connected', 'qr_ready', 'authenticated', 'initializing'].includes(status)) {
          console.log(`⚠️ Sesión duplicada encontrada en almacenamiento: ${phoneNumber} (${status})`);
          return true;
        }
      }
    }
    
    return false;
  }

  isSessionActive(sessionId) {
    if (this.sessionsMarkedForRemoval.has(sessionId)) {
      return false;
    }
    
    const session = this.sessions.get(sessionId);
    return session && 
           session.status === 'connected' && 
           !session.isBlocked && 
           !session.markedForCleanup;
  }

  getActiveSessions() {
    const activeSessions = [];
    
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      if (this.isSessionActive(sessionId) && 
          !sessionData.markedForCleanup && 
          !this.sessionsMarkedForRemoval.has(sessionId)) {
        activeSessions.push({
          sessionId,
          client: sessionData.client,
          phoneNumber: sessionData.phoneNumber,
          status: sessionData.status,
          messagesSent: sessionData.messagesSent || 0
        });
      }
    }
    
    return activeSessions;
  }

  // ===== CREACIÓN Y CONFIGURACIÓN DE SESIONES =====
  async createSession(sessionId, phoneNumber, isRestore = false) {
    try {
        if (this.sessions.has(sessionId) && this.sessions.get(sessionId).status === 'connected') {
            console.log(`⚠️ Sesión ${sessionId} ya está activa, omitiendo creación`);
            return { success: true, sessionId, phoneNumber, alreadyActive: true };
        }

        if (this.sessionsMarkedForRemoval.has(sessionId)) {
            console.log(`⚠️ Sesión ${sessionId} está marcada para remoción. No se puede crear.`);
            return { success: false, error: 'SESSION_MARKED_FOR_REMOVAL' };
        }

        if (isRestore) {
            const randomDelay = Math.random() * 5000 + 2000;
            console.log(`⏳ Esperando ${randomDelay}ms antes de restaurar...`);
            await new Promise(resolve => setTimeout(resolve, randomDelay));
        }

        const customAuth = new CustomLocalAuth({
            clientId: sessionId,
            dataPath: './storage/sessions'
        });

        customAuth.setCleanupService(this.cleanupService);

        const client = new Client({
            authStrategy: customAuth,
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ],
                timeout: 60000
            },
            authTimeoutMs: isRestore ? 120000 : 60000,
            takeoverOnConflict: false,
            restartOnAuthFail: true,
            qrMaxRetries: 3
        });

        const sessionData = {
            client,
            phoneNumber,
            status: 'initializing',
            qrCode: null,
            connectedNumber: null,
            messagesSent: 0,
            lastConnection: null,
            createdAt: new Date(),
            isBlocked: false,
            disconnectedAt: null,
            crashReason: null,
            markedForCleanup: false,
            sessionPath: `./storage/sessions/${sessionId}`
        };

        this.sessions.set(sessionId, sessionData);

        if (!isRestore) {
            this.sessionManager.saveSession(sessionId, {
                phoneNumber,
                status: 'initializing',
                messagesSent: 0,
                createdAt: new Date().toISOString(),
                isBlocked: false,
                markedForCleanup: false
            });
        } else {
            this.sessionManager.updateSession(sessionId, {
                status: 'initializing',
                lastUpdate: new Date().toISOString()
            });
        }

        this.setupClientEvents(client, sessionId, phoneNumber);
        
        console.log(`🚀 Inicializando cliente WhatsApp con CustomLocalAuth...`);
        await client.initialize();
        console.log(`✅ Cliente inicializado exitosamente: ${phoneNumber}`);
        
        return { success: true, sessionId, phoneNumber };
        
    } catch (error) {
        console.error('💥 ERROR CREANDO SESIÓN:', error);
        
        if (error.message.includes('EBUSY') || error.message.includes('resource busy')) {
            console.log('🔄 Error de archivo bloqueado (EBUSY), usando CleanupService...');
            
            try {
                await this.cleanupService.handleEBUSY(`./storage/sessions/${sessionId}`, sessionId, phoneNumber);
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                return await this.createSession(sessionId, phoneNumber, isRestore);
            } catch (cleanupError) {
                console.error('💥 CleanupService no pudo resolver EBUSY:', cleanupError);
            }
        }
        
        this.sessionManager.updateSession(sessionId, {
            status: 'error',
            error: error.message,
            lastUpdate: new Date().toISOString()
        });
        
        return { success: false, error: error.message };
    }
  }

  setupClientEvents(client, sessionId, phoneNumber) {
    let qrEmitted = false;
    let authenticated = false;

    client.on('authenticated', () => {
      console.log(`🔐 AUTENTICADO: ${phoneNumber} - Sesión GUARDADA correctamente`);
      authenticated = true;
      
      this.sessionManager.updateSession(sessionId, {
        status: 'authenticated',
        lastUpdate: new Date().toISOString()
      });
    });

    client.on('loading_screen', (percent, message) => {
      console.log(`📱 Cargando WhatsApp [${phoneNumber}]: ${percent}% - ${message}`);
    });

    client.on('qr', (qr) => {
      console.log(`\n📱 QR RECIBIDO para: ${phoneNumber}`);
      console.log('🔢 Escanea este código QR con tu WhatsApp:');
      qrcode.generate(qr, { small: true });
      
      const session = this.sessions.get(sessionId);
      if (session) {
        session.qrCode = qr;
        session.status = 'qr_ready';
      }
      
      if (!qrEmitted) {
        this.sessionManager.updateSession(sessionId, {
          status: 'qr_ready',
          qrCode: qr,
          lastUpdate: new Date().toISOString()
        });
        qrEmitted = true;
      }
      
      this.emitToFrontend('qr_update', { 
        sessionId, 
        phoneNumber,
        qr, 
        status: 'qr_ready' 
      });
    });

   client.on('ready', async () => {
  console.log(`\n WHATSAPP LISTO: ${phoneNumber}`);
  
  // ============ PATCH PARA ERROR markedUnread ============
  try {
    await client.pupPage.evaluate(() => {
      if (window.WWebJS && window.WWebJS.sendSeen) {
        const originalSendSeen = window.WWebJS.sendSeen;
        window.WWebJS.sendSeen = async function(chatId) {
          try {
            return await originalSendSeen.call(this, chatId);
          } catch (error) {
            // Si es el error "markedUnread", ignorarlo y retornar éxito
            if (error.message && error.message.includes('markedUnread')) {
              console.log('[Patch] Error markedUnread ignorado - continuando');
              return true;
            }
            // Si es otro error, lanzarlo normalmente
            throw error;
          }
        };
        console.log('[Patch] sendSeen parcheado exitosamente');
      }
    });
  } catch (patchError) {
    console.log('⚠️ No se pudo aplicar patch (continuando de todas formas)');
  }
  // ============ FIN DEL PATCH ============
  
  const session = this.sessions.get(sessionId);
  if (session) {
    session.status = 'connected';
    session.lastConnection = new Date();
    
    try {
      if (client.info && client.info.wid) {
        session.connectedNumber = client.info.wid._serialized;
        console.log(`📱 Número conectado: ${session.connectedNumber}`);
      } else {
        session.connectedNumber = phoneNumber.includes('@c.us') 
          ? phoneNumber 
          : `${phoneNumber}@c.us`;
        console.log(`📱 Usando número proporcionado: ${session.connectedNumber}`);
      }
    } catch (error) {
      console.error('Error obteniendo número conectado:', error);
      session.connectedNumber = phoneNumber;
    }

    this.sessionsMarkedForRemoval.delete(sessionId);
    this.activeSessions.set(sessionId, client);
  }
  
  this.verifySessionFiles(sessionId, phoneNumber);
  
  this.sessionManager.updateSession(sessionId, {
    status: 'connected',
    connectedNumber: session?.connectedNumber,
    lastConnection: new Date().toISOString(),
    isBlocked: false,
    lastUpdate: new Date().toISOString()
  });
  
  console.log(`💾 SESIÓN GUARDADA: ${phoneNumber} está ahora CONECTADA`);
  
  this.emitToFrontend('session_ready', { 
    sessionId, 
    phoneNumber,
    status: 'connected',
    connectedNumber: session?.connectedNumber
  });
});

    client.on('message', async (message) => {
      await this.handleIncomingMessage(message, sessionId, phoneNumber);
    });

    // EVENTO DISCONNECTED CON PAUSA INTELIGENTE
    client.on('disconnected', async (reason) => {
      console.log(`\n🔇 DESCONEXIÓN DETECTADA: ${phoneNumber} - Razón: ${reason}`);
      
      const session = this.sessions.get(sessionId);
      const isBlocked = reason === 'NAVIGATION' || 
                       reason.includes('blocked') || 
                       reason.includes('LOGOUT');
      
      if (session) {
        session.status = 'disconnected';
        session.isBlocked = isBlocked;
        session.disconnectedAt = new Date();
        session.disconnectedReason = reason;
        session.markedForCleanup = false;
        session.canReconnect = !isBlocked;
        
        if (isBlocked) {
          this.stats.blockedSessions++;
          console.log(`🚫 SESIÓN BLOQUEADA: ${phoneNumber}`);
        }
        
        this.activeSessions.delete(sessionId);
        this.sessionsMarkedForRemoval.add(sessionId);
      }
      
      const isInActiveCampaign = this.currentCampaignPools && 
        this.isSessionInCurrentCampaign(sessionId);
      
      if (isInActiveCampaign && !this.campaignPaused) {
        console.log(`🎯 Sesión ${phoneNumber} está en campaña activa. Activando pausa inteligente...`);
        
        const pauseResult = this.pauseCampaignForReplacement(
          sessionId, 
          `session_disconnected_${reason}`
        );
        
        this.removeSessionFromPoolsButKeepReference(sessionId, phoneNumber);
        
        this.emitToFrontend('session_disconnected_in_campaign', {
          sessionId,
          phoneNumber,
          reason,
          isBlocked,
          campaignPaused: true,
          replacementInProgress: true,
          pauseId: pauseResult.pauseId,
          estimatedResumeTime: new Date(Date.now() + this.pauseConfig.defaultPauseTime).toISOString(),
          timestamp: new Date().toISOString()
        });
        
      } else {
        this.removeSessionFromPoolsImmediately(sessionId, phoneNumber);
        
        this.emitToFrontend('session_disconnected', {
          sessionId,
          phoneNumber,
          reason,
          isBlocked,
          note: 'Sesión removida de pools'
        });
      }
      
      this.sessionManager.updateSession(sessionId, {
        status: 'disconnected',
        isBlocked: isBlocked,
        lastConnection: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        disconnectedReason: reason,
        canReconnect: !isBlocked,
        markedForCleanup: false
      });
    });

    client.on('auth_failure', (error) => {
      console.error(`\n❌ ERROR DE AUTENTICACIÓN: ${phoneNumber}`, error);
      const session = this.sessions.get(sessionId);
      if (session) {
        session.status = 'auth_failed';
        session.isBlocked = true;
        this.stats.blockedSessions++;
      }
      
      this.sessionManager.updateSession(sessionId, {
        status: 'auth_failed',
        isBlocked: true,
        error: error.message,
        lastUpdate: new Date().toISOString()
      });
      
      this.emitToFrontend('auth_failure', { 
        sessionId, 
        phoneNumber,
        error: error.message 
      });
    });

    client.on('error', (error) => {
      console.error(`❌ Error del cliente WhatsApp (${phoneNumber}):`, error);
    });
  }

  // ===== LIMPIEZA DE SESIONES =====
  removeSessionFromPoolsImmediately(sessionId, phoneNumber) {
    console.log(`🔥 Removiendo INMEDIATAMENTE ${phoneNumber} de pools...`);
    
    let removedCount = 0;
    
    if (this.currentCampaignPools) {
      this.currentCampaignPools.forEach(pool => {
        if (pool.sessions && Array.isArray(pool.sessions)) {
          const originalLength = pool.sessions.length;
          pool.sessions = pool.sessions.filter(sessionPhone => 
            sessionPhone !== phoneNumber
          );
          
          if (pool.sessions.length < originalLength) {
            removedCount += (originalLength - pool.sessions.length);
            console.log(`   → Removida de Pool "${pool.name}"`);
          }
        }
      });
    }
    
    this.activeSessions.delete(sessionId);
    this.sessionsMarkedForRemoval.add(sessionId);
    
    console.log(`✅ ${removedCount} referencias removidas inmediatamente`);
    return removedCount;
  }

  async cleanupZombieSessions() {
    const now = new Date();
    const sessionsToRemove = [];
    
    console.log('🧹 Revisando sesiones zombie para limpieza...');
    
    for (const [sessionId, zombieData] of this.zombieSessions.entries()) {
      if (now >= zombieData.cleanupAt) {
        sessionsToRemove.push(sessionId);
      }
    }
    
    if (sessionsToRemove.length === 0) {
      return;
    }
    
    console.log(`🧹 ${sessionsToRemove.length} sesiones zombie listas para limpieza`);
    
    for (const sessionId of sessionsToRemove) {
      try {
        const zombieData = this.zombieSessions.get(sessionId);
        if (!zombieData) continue;
        
        const session = zombieData.data;
        const phoneNumber = session.phoneNumber;
        const sessionPath = session.sessionPath || `./storage/sessions/${sessionId}`;
        
        console.log(`🧹 Limpiando sesión zombie: ${phoneNumber}`);
        
        const cleanupResult = await this.cleanupService.cleanupSession(
          sessionId,
          sessionPath,
          phoneNumber,
          { isEBUSY: zombieData.reason === 'EBUSY' }
        );
        
        if (cleanupResult.success) {
          console.log(`✅ CleanupService limpió exitosamente: ${phoneNumber}`);
          
          this.sessions.delete(sessionId);
          this.activeSessions.delete(sessionId);
          this.zombieSessions.delete(sessionId);
          this.sessionsMarkedForRemoval.delete(sessionId);
          
          await this.sessionManager.deleteSession(sessionId);
          
          console.log(`✅ Sesión zombie ${phoneNumber} eliminada exitosamente`);
          
          this.emitToFrontend('session_zombie_cleaned', {
            sessionId,
            phoneNumber,
            reason: zombieData.reason,
            cleanedAt: new Date().toISOString(),
            note: 'Sesión zombie limpiada por CleanupService',
            cleanupStrategy: cleanupResult.strategy
          });
          
        } else {
          console.error(`❌ CleanupService no pudo limpiar ${phoneNumber}:`, cleanupResult.error);
          
          zombieData.cleanupAt = new Date(Date.now() + 600000);
          console.log(`🔄 Reagendando limpieza de ${sessionId} para dentro de 10 minutos`);
        }
        
      } catch (error) {
        console.error(`💥 Error limpiando sesión zombie ${sessionId}:`, error);
        
        const zombieData = this.zombieSessions.get(sessionId);
        if (zombieData) {
          zombieData.cleanupAt = new Date(Date.now() + 600000);
          console.log(`🔄 Reagendando limpieza de ${sessionId} para dentro de 10 minutos`);
        }
      }
    }
  }

  async cleanupOldDisconnectedSessions() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let cleaned = 0;
    
    console.log('🧹 Revisando sesiones desconectadas >24h para limpieza...');
    
    for (const [sessionId, sessionData] of this.sessions.entries()) {
      if (sessionData.status === 'disconnected' && 
          sessionData.disconnectedAt &&
          sessionData.disconnectedAt < twentyFourHoursAgo &&
          !sessionData.markedForCleanup) {
        
        console.log(`🧹 Limpiando sesión antigua: ${sessionData.phoneNumber}`);
        
        sessionData.markedForCleanup = true;
        
        const cleanupResult = await this.cleanupService.cleanupSession(
          sessionId,
          sessionData.sessionPath || `./storage/sessions/${sessionId}`,
          sessionData.phoneNumber,
          { force: false }
        );
        
        if (cleanupResult.success) {
          this.sessions.delete(sessionId);
          this.sessionManager.deleteSession(sessionId);
          cleaned++;
          console.log(`✅ Sesión antigua eliminada: ${sessionData.phoneNumber}`);
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`✅ ${cleaned} sesiones antiguas limpiadas`);
    }
  }

  async safeDestroyClient(client, sessionId) {
    console.log(`🔄 Intentando destruir cliente ${sessionId}`);
    
    try {
      await client.destroy();
      console.log(`✅ Cliente ${sessionId} destruido exitosamente`);
      return true;
    } catch (error) {
      console.error(`❌ Error destruyendo cliente:`, error.message);
      
      if (error.message.includes('EBUSY') || error.message.includes('resource busy')) {
        console.log(`⚠️ EBUSY detectado, CleanupService manejará en limpieza zombie`);
        return false;
      }
      
      return false;
    }
  }

  // ===== ELIMINACIÓN DE SESIONES =====
  async removeSession(sessionId, immediate = false) {
    try {
      console.log(`\n🗑️  SOLICITUD DE ELIMINACIÓN: ${sessionId} (inmediato: ${immediate})`);
      
      const session = this.sessions.get(sessionId);
      if (!session) {
        const zombieData = this.zombieSessions.get(sessionId);
        if (zombieData) {
          console.log(`🧟 Sesión ${sessionId} ya está marcada como zombie`);
          return { 
            success: true, 
            sessionId, 
            note: 'La sesión ya está en proceso de limpieza diferida' 
          };
        }
        return { success: false, error: 'Sesión no encontrada' };
      }
      
      if (immediate) {
        console.log(`⚠️ ELIMINACIÓN INMEDIATA SOLICITADA PARA ${session.phoneNumber}`);
        
        this.removeSessionFromPoolsImmediately(sessionId, session.phoneNumber);
        this.sessionsMarkedForRemoval.add(sessionId);
        
        const sessionPath = session.sessionPath || `./storage/sessions/${sessionId}`;
        
        const cleanupResult = await this.cleanupService.cleanupSession(
          sessionId,
          sessionPath,
          session.phoneNumber,
          { force: true, isEBUSY: true }
        );
        
        if (cleanupResult.success) {
          this.sessions.delete(sessionId);
          this.activeSessions.delete(sessionId);
          this.zombieSessions.delete(sessionId);
          this.sessionsMarkedForRemoval.delete(sessionId);
          
          await this.sessionManager.deleteSession(sessionId);
          
          return { 
            success: true, 
            sessionId, 
            note: 'Sesión eliminada inmediatamente con CleanupService',
            cleanupResult
          };
        } else {
          console.log(`⚠️ Limpieza inmediata fallida, moviendo a zombies: ${session.phoneNumber}`);
          this.zombieSessions.set(sessionId, {
            data: session,
            markedAt: new Date(),
            cleanupAt: new Date(Date.now() + 300000),
            reason: 'manual_immediate_removal_failed'
          });
          
          return { 
            success: false, 
            sessionId, 
            error: 'Limpieza inmediata falló, sesión movida a zombies',
            cleanupResult
          };
        }
        
      } else {
        console.log(`🧟 Marcando sesión ${session.phoneNumber} como zombie para limpieza diferida`);
        
        session.status = 'zombie';
        session.markedForCleanup = true;
        this.sessionsMarkedForRemoval.add(sessionId);
        
        this.zombieSessions.set(sessionId, {
          data: session,
          markedAt: new Date(),
          cleanupAt: new Date(Date.now() + 300000),
          reason: 'manual_removal'
        });
        
        this.removeSessionFromPoolsImmediately(sessionId, session.phoneNumber);
        
        this.emitToFrontend('session_removal_scheduled', {
          sessionId,
          phoneNumber: session.phoneNumber,
          scheduledCleanup: new Date(Date.now() + 300000).toISOString(),
          note: 'La sesión será limpiada automáticamente en 5 minutos por CleanupService'
        });
        
        return { 
          success: true, 
          sessionId,
          scheduledCleanup: new Date(Date.now() + 300000).toISOString()
        };
      }
      
    } catch (error) {
      console.error('Error en removeSession:', error);
      return { success: false, error: error.message };
    }
  }

  // ===== CAMPAÑAS CON PAUSA INTELIGENTE =====
  async startCampaign({ message, debtors, sessions, config, pools }) {
    console.log('🚀 INICIANDO CAMPAÑA CON SISTEMA DE PAUSA INTELIGENTE');
    
    if (pools && pools.length > 0) {
      this.currentCampaignPools = pools;
      console.log('🎯 Usando sistema de pools con pausa inteligente');
      return await this.startCampaignWithPools({ message, debtors, pools, config });
    }
    
    try {
      let availableSessions = this.getActiveSessions().filter(session => 
        sessions.includes(session.phoneNumber)
      );
      
      console.log(`📱 Sesiones activas iniciales: ${availableSessions.length}`);
      
      if (availableSessions.length === 0) {
        throw new Error('No hay sesiones de WhatsApp conectadas disponibles');
      }

      const debtorsQueue = [...debtors];
      const totalDebtors = debtorsQueue.length;
      
      const results = {
        successes: [],
        failures: [],
        skipped: [],
        sessionProblems: [],
        campaignPauses: [],
        startTime: new Date().toISOString(),
        endTime: null,
        summary: {}
      };

      let processed = 0;
      let successful = 0;
      let failed = 0;
      let skipped = 0;
      
      let queueLock = false;
      const acquireLock = async () => {
        while (queueLock) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        queueLock = true;
      };
      const releaseLock = () => {
        queueLock = false;
      };

      const recordResult = (debtor, success, error = null, sessionPhone = null, details = {}) => {
        const resultEntry = {
          debtor: {
            nombre: debtor.nombre,
            telefono: debtor.telefono,
            rut: debtor.rut,
            deuda: debtor.deuda
          },
          session: sessionPhone,
          timestamp: new Date().toISOString(),
          success: success,
          error: error,
          details: details
        };

        if (success) {
          results.successes.push(resultEntry);
        } else if (details.skipped) {
          results.skipped.push(resultEntry);
        } else {
          if (error && error.includes('SESSION_NOT_AVAILABLE')) {
            results.sessionProblems.push(resultEntry);
          } else {
            results.failures.push(resultEntry);
          }
        }
      };

      const getNextDebtor = async () => {
        await acquireLock();
        try {
          if (debtorsQueue.length > 0) {
            return debtorsQueue.shift();
          }
          return null;
        } finally {
          releaseLock();
        }
      };

      const updateProgress = (debtor, success, error = null, sessionPhone = null, skippedFlag = false) => {
        processed++;
        if (success) {
          successful++;
        } else if (skippedFlag) {
          skipped++;
        } else {
          failed++;
        }

        const progress = Math.round((processed / totalDebtors) * 100);
        
        this.emitToFrontend('campaign_progress_with_pause', {
          progress: progress,
          sent: processed,
          total: totalDebtors,
          successful: successful,
          failed: failed,
          skipped: skipped,
          status: this.campaignPaused ? 'paused' : 'sending',
          campaignPaused: this.campaignPaused,
          pauseReason: this.pauseReason,
          currentSession: sessionPhone,
          activeSessions: availableSessions.length,
          queueLength: debtorsQueue.length
        });
      };

      const createWorker = (session) => {
        return new Promise(async (resolve, reject) => {
          console.log(`👷 Worker iniciado para: ${session.phoneNumber}`);
          
          try {
            while (availableSessions.includes(session) && debtorsQueue.length > 0) {
              if (this.campaignPaused) {
                console.log(`⏸️ Campaña pausada, worker ${session.phoneNumber} esperando...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
              }
              
              const debtor = await getNextDebtor();
              
              if (!debtor) {
                break;
              }

              try {
                if (this.sessionsMarkedForRemoval.has(session.sessionId)) {
                  console.log(`⏭️ Sesión ${session.phoneNumber} marcada para remoción, terminando worker`);
                  availableSessions = availableSessions.filter(s => s.sessionId !== session.sessionId);
                  break;
                }

                if (!this.isSessionActive(session.sessionId)) {
                  console.log(`⏭️ Sesión ${session.phoneNumber} ya no está activa, terminando worker`);
                  availableSessions = availableSessions.filter(s => s.sessionId !== session.sessionId);
                  break;
                }

                const result = await this.sendMessageToDebtorWithTracking(session.sessionId, debtor, message);
                
                if (result.skipped) {
                  recordResult(debtor, false, result.error, session.phoneNumber, {
                    errorType: result.errorType,
                    retryAttempt: 0,
                    skipped: true
                  });
                  updateProgress(debtor, false, result.error, session.phoneNumber, true);
                  continue;
                }
                
                if (result.success) {
                  recordResult(debtor, true, null, session.phoneNumber, {
                    messageId: result.messageId,
                    sentAt: new Date().toISOString(),
                    tracking: result.tracking
                  });
                  updateProgress(debtor, true, null, session.phoneNumber);
                } else {
                  recordResult(debtor, false, result.error, session.phoneNumber, {
                    errorType: result.errorType,
                    retryAttempt: 0
                  });
                  updateProgress(debtor, false, result.error, session.phoneNumber);
                }

              } catch (error) {
                console.error(`❌ Error enviando a ${debtor.telefono} desde ${session.phoneNumber}:`, error.message);
                
                recordResult(debtor, false, error.message, session.phoneNumber, {
                  errorType: this.classifyError(error),
                  retryAttempt: 0
                });

                if (error.message.includes('SESSION_NOT_AVAILABLE') || 
                    error.message.includes('Sesión no encontrada') ||
                    error.message.includes('no disponible')) {
                  
                  console.log(`🔄 Removiendo sesión ${session.phoneNumber} del pool por error`);
                  availableSessions = availableSessions.filter(s => s.sessionId !== session.sessionId);
                  
                  await acquireLock();
                  debtorsQueue.unshift(debtor);
                  releaseLock();
                  
                  break;
                }

                updateProgress(debtor, false, error.message, session.phoneNumber);
              }

              if (config.delay && config.delay > 0) {
                await new Promise(resolve => setTimeout(resolve, config.delay));
              }
            }
            
            console.log(`👷 Worker terminado para: ${session.phoneNumber}. Razón: ${debtorsQueue.length === 0 ? 'Cola vacía' : 'Sesión removida'}`);
            resolve();
            
          } catch (workerError) {
            console.error(`💥 Error en worker ${session.phoneNumber}:`, workerError);
            reject(workerError);
          }
        });
      };

      this.emitToFrontend('campaign_started_with_pause_system', {
        message: 'Campaña iniciada con sistema de pausa inteligente',
        debtorsCount: totalDebtors,
        sessionsCount: availableSessions.length,
        startTime: new Date().toISOString(),
        mode: 'queue_workers_with_pause',
        pauseConfig: this.pauseConfig
      });

      console.log(`🎯 Iniciando ${availableSessions.length} workers para ${totalDebtors} deudores`);

      const workerPromises = availableSessions.map(session => createWorker(session));
      await Promise.allSettled(workerPromises);

      this.currentCampaignPools = null;

      results.endTime = new Date().toISOString();
      results.summary = {
        total: totalDebtors,
        successful: results.successes.length,
        failed: results.failures.length,
        skipped: results.skipped.length,
        sessionProblems: results.sessionProblems.length,
        successRate: totalDebtors > 0 ? (results.successes.length / totalDebtors) * 100 : 0,
        skipRate: totalDebtors > 0 ? (results.skipped.length / totalDebtors) * 100 : 0,
        duration: new Date(results.endTime) - new Date(results.startTime),
        pauses: this.stats.campaignPauses,
        replacements: this.stats.sessionReplacements
      };

      const successRate = totalDebtors > 0 ? (successful / totalDebtors) * 100 : 0;
      const skipRate = totalDebtors > 0 ? (skipped / totalDebtors) * 100 : 0;
      const remainingInQueue = debtorsQueue.length;

      console.log(`📊 CAMPAÑA COMPLETADA: ${successful}/${totalDebtors} exitosos (${successRate.toFixed(1)}%)`);
      console.log(`⏭️  Mensajes saltados: ${skipped} (${skipRate.toFixed(1)}%)`);
      console.log(`⏸️  Pausas: ${this.stats.campaignPauses}`);
      console.log(`📱 Sesiones activas al finalizar: ${availableSessions.length}`);
      console.log(`📬 Deudores pendientes en cola: ${remainingInQueue}`);

      this.lastCampaignResults = results;

      this.emitToFrontend('campaign_completed_with_pause_system', {
        totalSent: totalDebtors,
        successful: results.successes.length,
        failed: results.failures.length,
        skipped: results.skipped.length,
        successRate: successRate,
        skipRate: skipRate,
        completedAt: new Date().toISOString(),
        results: results,
        activeSessionsAtEnd: availableSessions.length,
        remainingInQueue: remainingInQueue,
        campaignPauses: this.stats.campaignPauses,
        sessionReplacements: this.stats.sessionReplacements,
        detailedReport: this.generateDetailedReport(results),
        note: remainingInQueue > 0 ? 
          `Campaña terminada con ${remainingInQueue} deudores pendientes (sesiones insuficientes)` :
          'Todos los deudores procesados exitosamente'
      });

      return {
        success: true,
        total: totalDebtors,
        successful: results.successes.length,
        failed: results.failures.length,
        skipped: results.skipped.length,
        sessionProblems: results.sessionProblems.length,
        successRate: results.summary.successRate,
        skipRate: results.summary.skipRate,
        sessionsStarted: sessions.length,
        sessionsActiveAtEnd: availableSessions.length,
        campaignPauses: this.stats.campaignPauses,
        sessionReplacements: this.stats.sessionReplacements,
        remainingInQueue: remainingInQueue,
        detailedResults: results,
        report: this.generateDetailedReport(results)
      };

    } catch (error) {
      console.error('💥 ERROR EN CAMPAÑA:', error);
      
      this.currentCampaignPools = null;
      
      this.emitToFrontend('campaign_error_with_pause', {
        error: error.message,
        failedAt: new Date().toISOString(),
        campaignPaused: this.campaignPaused,
        pauseReason: this.pauseReason
      });
      
      throw error;
    }
  }

  // ===== CAMPAÑA CON POOLS Y PAUSA INTELIGENTE =====
  async startCampaignWithPools({ message, debtors, pools, config }) {
    console.log('🚀 INICIANDO CAMPAÑA CON SISTEMA DE PAUSA INTELIGENTE');
    
    try {
      this.currentCampaignPools = pools;
      this.disconnectedSessionsInCampaign.clear();
      
      const validPools = pools.filter(pool => 
        pool.sessions && pool.sessions.length > 0 && 
        ['turnos_fijos', 'turnos_aleatorios', 'competitivo'].includes(pool.mode)
      );
      
      if (validPools.length === 0) {
        throw new Error('No hay pools válidos para ejecutar la campaña');
      }

      const debtorsQueue = [...debtors];
      const totalDebtors = debtorsQueue.length;
      
      const results = {
        successes: [],
        failures: [],
        skipped: [],
        sessionProblems: [],
        poolPerformance: {},
        campaignPauses: [],
        sessionReplacements: [],
        startTime: new Date().toISOString(),
        endTime: null,
        summary: {}
      };

      let processed = 0;
      let successful = 0;
      let failed = 0;
      let skipped = 0;
      
      validPools.forEach(pool => {
        pool.delayBase = pool.delayBase || 8000;
        pool.delayVariacion = pool.delayVariacion || 2000;
        pool.delayMinimo = pool.delayMinimo || 6000;
        pool.delayMaximo = pool.delayMaximo || 10000;
        pool.maxSesionesSimultaneas = pool.maxSesionesSimultaneas || pool.sessions.length;

        results.poolPerformance[pool.name] = {
          sessions: pool.sessions.length,
          activeSessions: 0,
          mode: pool.mode,
          processed: 0,
          successful: 0,
          failed: 0,
          skipped: 0,
          delays: 0,
          pauses: 0
        };
      });

      const processDebtor = async (debtor, session, poolName, poolIndex) => {
        if (this.campaignPaused) {
          console.log(`⏸️ Campaña pausada, esperando para procesar ${debtor.telefono}`);
          
          while (this.campaignPaused) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(`⏳ Esperando reanudación... ${debtor.telefono}`);
          }
        }
        
        try {
          const result = await this.sendMessageToDebtorWithTracking(
            session.sessionId, 
            debtor, 
            message
          );
          
          if (result.skipped) {
            results.skipped.push({
              debtor: debtor,
              session: session.phoneNumber,
              pool: poolName,
              error: result.error,
              timestamp: new Date().toISOString(),
              success: false,
              skipped: true,
              poolIndex: poolIndex
            });
            
            return { success: false, skipped: true, error: result.error };
          }
          
          if (result.success) {
            results.successes.push({
              debtor: debtor,
              session: session.phoneNumber,
              pool: poolName,
              timestamp: new Date().toISOString(),
              success: true,
              tracking: result.tracking,
              poolIndex: poolIndex
            });
            
            return { success: true };
          } else {
            results.failures.push({
              debtor: debtor,
              session: session.phoneNumber,
              pool: poolName,
              error: result.error,
              timestamp: new Date().toISOString(),
              success: false,
              poolIndex: poolIndex
            });
            
            return { success: false, error: result.error };
          }
        } catch (error) {
          results.failures.push({
            debtor: debtor,
            session: session.phoneNumber,
            pool: poolName,
            error: error.message,
            timestamp: new Date().toISOString(),
            success: false,
            poolIndex: poolIndex
          });
          
          return { success: false, error: error.message };
        }
      };

      const processPool = async (pool) => {
        console.log(`👷 PROCESANDO POOL: ${pool.name} (${pool.mode})`);
        
        const poolSessions = pool.sessions
          .map((sessionPhone, index) => {
            if (sessionPhone === null) {
              console.log(`   ⏭️  Índice ${index} vacío (sesión desconectada anteriormente)`);
              return null;
            }
            
            const sessionEntry = Array.from(this.sessions.entries())
              .find(([id, data]) => data.phoneNumber === sessionPhone);
            
            if (sessionEntry) {
              const [sessionId, sessionData] = sessionEntry;
              
              const isEligible = 
                sessionData.status === 'connected' && 
                !sessionData.isBlocked && 
                !sessionData.markedForCleanup &&
                !this.sessionsMarkedForRemoval.has(sessionId);
              
              if (isEligible) {
                return {
                  sessionId,
                  phoneNumber: sessionData.phoneNumber,
                  client: sessionData.client,
                  status: sessionData.status,
                  poolIndex: index
                };
              } else {
                console.log(`⏭️  Sesión ${sessionPhone} no elegible (estado: ${sessionData.status})`);
                return null;
              }
            }
            
            console.log(`❌ Sesión ${sessionPhone} no encontrada en manager`);
            return null;
          })
          .filter(session => session !== null);

        results.poolPerformance[pool.name].activeSessions = poolSessions.length;
        
        if (poolSessions.length === 0) {
          console.log(`⚠️ Pool ${pool.name} no tiene sesiones activas. Saltando...`);
          return {
            poolName: pool.name,
            processed: 0,
            successful: 0,
            failed: 0,
            skipped: 0,
            status: 'skipped_no_active_sessions'
          };
        }

        console.log(`✅ Pool ${pool.name}: ${poolSessions.length}/${pool.sessions.length} sesiones activas`);

        let poolProcessed = 0;
        let poolSuccessful = 0;
        let poolFailed = 0;
        let poolSkipped = 0;
        let poolDelays = 0;
        let poolPauses = 0;

        switch (pool.mode) {
          case 'turnos_fijos':
            console.log(`🎯 Ejecutando turnos fijos para pool: ${pool.name}`);
            let turnoIndex = 0;
            
            while (debtorsQueue.length > 0 && !this.campaignPaused) {
              if (this.campaignPaused) {
                poolPauses++;
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
              }
              
              const session = poolSessions[turnoIndex % poolSessions.length];
              const debtor = debtorsQueue.shift();
              
              if (!debtor) break;
              
              const result = await processDebtor(debtor, session, pool.name, session.poolIndex);
              
              if (result.success) {
                poolSuccessful++;
                successful++;
              } else if (result.skipped) {
                poolSkipped++;
                skipped++;
                this.stats.skippedMessages++;
              } else {
                poolFailed++;
                failed++;
              }
              
              poolProcessed++;
              processed++;
              
              this.updateCampaignProgress(processed, totalDebtors, successful, failed, skipped);
              
              const delay = this.calcularDelayHibrido(pool);
              poolDelays += delay;
              await new Promise(resolve => setTimeout(resolve, delay));
              
              turnoIndex++;
            }
            break;
            
          case 'turnos_aleatorios':
            console.log(`🎲 Ejecutando turnos aleatorios para pool: ${pool.name}`);
            let ordenSesiones = this.barajarArray([...poolSessions]);
            let cicloIndex = 0;
            
            while (debtorsQueue.length > 0 && !this.campaignPaused) {
              if (this.campaignPaused) {
                poolPauses++;
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
              }
              
              if (cicloIndex >= ordenSesiones.length) {
                ordenSesiones = this.barajarArray([...poolSessions]);
                cicloIndex = 0;
              }
              
              const session = ordenSesiones[cicloIndex];
              const debtor = debtorsQueue.shift();
              
              if (!debtor) break;
              
              const result = await processDebtor(debtor, session, pool.name, session.poolIndex);
              
              if (result.success) {
                poolSuccessful++;
                successful++;
              } else if (result.skipped) {
                poolSkipped++;
                skipped++;
                this.stats.skippedMessages++;
              } else {
                poolFailed++;
                failed++;
              }
              
              poolProcessed++;
              processed++;
              
              this.updateCampaignProgress(processed, totalDebtors, successful, failed, skipped);
              
              const delay = this.calcularDelayHibrido(pool);
              poolDelays += delay;
              await new Promise(resolve => setTimeout(resolve, delay));
              
              cicloIndex++;
            }
            break;
            
          case 'competitivo':
            console.log(`⚡ Ejecutando modo competitivo para pool: ${pool.name}`);
            const maxSesiones = pool.maxSesionesSimultaneas || poolSessions.length;
            const sesionesActivas = poolSessions.slice(0, maxSesiones);
            
            const promisesCompetitivas = sesionesActivas.map(async (session) => {
              let sesionProcesados = 0;
              
              while (debtorsQueue.length > 0 && !this.campaignPaused) {
                if (this.campaignPaused) {
                  poolPauses++;
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  continue;
                }
                
                const debtor = debtorsQueue.shift();
                if (!debtor) break;
                
                const result = await processDebtor(debtor, session, pool.name, session.poolIndex);
                
                if (result.success) {
                  poolSuccessful++;
                  successful++;
                } else if (result.skipped) {
                  poolSkipped++;
                  skipped++;
                  this.stats.skippedMessages++;
                } else {
                  poolFailed++;
                  failed++;
                }
                
                poolProcessed++;
                processed++;
                sesionProcesados++;
                
                this.updateCampaignProgress(processed, totalDebtors, successful, failed, skipped);
                
                const delay = this.calcularDelayHibrido(pool);
                poolDelays += delay;
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              
              console.log(`✅ Sesión ${session.phoneNumber} procesó ${sesionProcesados} mensajes`);
            });
            
            await Promise.allSettled(promisesCompetitivas);
            break;

          default:
            console.log(`❌ Modo no reconocido: ${pool.mode}`);
            break;
        }

        results.poolPerformance[pool.name].processed += poolProcessed;
        results.poolPerformance[pool.name].successful += poolSuccessful;
        results.poolPerformance[pool.name].failed += poolFailed;
        results.poolPerformance[pool.name].skipped += poolSkipped;
        results.poolPerformance[pool.name].delays += poolDelays;
        results.poolPerformance[pool.name].pauses += poolPauses;

        console.log(`✅ Pool ${pool.name} completado: ${poolSuccessful}/${poolProcessed} exitosos, ${poolSkipped} saltados`);
        
        return {
          poolName: pool.name,
          processed: poolProcessed,
          successful: poolSuccessful,
          failed: poolFailed,
          skipped: poolSkipped,
          delays: poolDelays,
          pauses: poolPauses,
          status: 'completed'
        };
      };

      this.emitToFrontend('campaign_started_with_pause_system', {
        message: 'Campaña iniciada con sistema de pausa inteligente',
        debtorsCount: totalDebtors,
        poolsCount: validPools.length,
        startTime: new Date().toISOString(),
        mode: 'pause_intelligent_system',
        pauseConfig: this.pauseConfig
      });

      const poolPromises = validPools.map(pool => processPool(pool));
      const poolResults = await Promise.allSettled(poolPromises);

      this.currentCampaignPools = null;
      this.disconnectedSessionsInCampaign.clear();

      results.endTime = new Date().toISOString();
      const campaignDuration = new Date(results.endTime) - new Date(results.startTime);
      
      results.summary = {
        total: totalDebtors,
        successful: successful,
        failed: failed,
        skipped: skipped,
        poolsUsed: validPools.length,
        successRate: totalDebtors > 0 ? (successful / totalDebtors) * 100 : 0,
        skipRate: totalDebtors > 0 ? (skipped / totalDebtors) * 100 : 0,
        duration: campaignDuration,
        pauses: this.stats.campaignPauses,
        replacements: this.stats.sessionReplacements,
        averagePauseTime: this.stats.campaignPauses > 0 ? 
          (campaignDuration / this.stats.campaignPauses) : 0
      };

      console.log(`📊 CAMPAÑA COMPLETADA CON SISTEMA DE PAUSA:`);
      console.log(`   ✅ Exitosa: ${successful}/${totalDebtors} (${results.summary.successRate.toFixed(1)}%)`);
      console.log(`   ⏭️  Saltados: ${skipped}`);
      console.log(`   ⏸️  Pausas: ${this.stats.campaignPauses}`);
      console.log(`   🔄 Reemplazos: ${this.stats.sessionReplacements}`);
      console.log(`   ⏱️  Duración: ${(campaignDuration / 1000).toFixed(1)}s`);

      this.lastCampaignResults = results;

      this.emitToFrontend('campaign_completed_with_pause_system', {
        totalSent: totalDebtors,
        successful: successful,
        failed: failed,
        skipped: skipped,
        successRate: results.summary.successRate,
        skipRate: results.summary.skipRate,
        completedAt: new Date().toISOString(),
        results: results,
        activeSessionsAtEnd: this.getActiveSessions().length,
        remainingInQueue: debtorsQueue.length,
        campaignPauses: this.stats.campaignPauses,
        sessionReplacements: this.stats.sessionReplacements,
        detailedReport: this.generateDetailedReport(results),
        note: debtorsQueue.length > 0 ? 
          `Campaña terminada con ${debtorsQueue.length} deudores pendientes` :
          'Todos los deudores procesados exitosamente'
      });

      return {
        success: true,
        total: totalDebtors,
        successful: successful,
        failed: failed,
        skipped: skipped,
        poolsUsed: validPools.length,
        successRate: results.summary.successRate,
        skipRate: results.summary.skipRate,
        campaignPauses: this.stats.campaignPauses,
        sessionReplacements: this.stats.sessionReplacements,
        remainingInQueue: debtorsQueue.length,
        detailedResults: results
      };

    } catch (error) {
      console.error('💥 ERROR EN CAMPAÑA CON SISTEMA DE PAUSA:', error);
      
      this.currentCampaignPools = null;
      this.disconnectedSessionsInCampaign.clear();
      
      this.emitToFrontend('campaign_error_with_pause', {
        error: error.message,
        failedAt: new Date().toISOString(),
        campaignPaused: this.campaignPaused,
        pauseReason: this.pauseReason
      });
      
      throw error;
    }
  }

  updateCampaignProgress(processed, total, successful, failed, skipped) {
    const progress = Math.round((processed / total) * 100);
    
    this.emitToFrontend('campaign_progress_with_pause', {
      progress: progress,
      sent: processed,
      total: total,
      successful: successful,
      failed: failed,
      skipped: skipped,
      status: this.campaignPaused ? 'paused' : 'sending',
      campaignPaused: this.campaignPaused,
      pauseReason: this.pauseReason,
      disconnectedSessions: Array.from(this.disconnectedSessionsInCampaign.keys()).length,
      activeSessions: this.getActiveSessions().length
    });
  }

  // ===== ENVÍO DE MENSAJES =====
  async sendMessageToDebtorWithTracking(sessionId, debtor, messageTemplate) {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'connected' || session.isBlocked || session.markedForCleanup) {
        console.log(`⏭️  Sesión no disponible para ${debtor.telefono}. Saltando...`);
        return { 
            success: false, 
            debtor: debtor.telefono,
            error: 'SESSION_UNAVAILABLE',
            skipped: true,
            reason: 'session_unavailable'
        };
    }

    if (this.sessionsMarkedForRemoval.has(sessionId)) {
        console.log(`⏭️  Sesión ${session.phoneNumber} marcada para remoción. Saltando...`);
        return { 
            success: false, 
            debtor: debtor.telefono,
            error: 'SESSION_MARKED_FOR_REMOVAL',
            skipped: true,
            reason: 'session_marked_for_removal'
        };
    }

    try {
        let personalizedMessage = messageTemplate;
        const variables = {
            nombre: debtor.nombre || '',
            telefono: debtor.telefono || '',
            deuda: `$${debtor.deuda?.toLocaleString() || '0'}`,
            capital: `$${debtor.capital?.toLocaleString() || '0'}`,
            estado: debtor.estado || '',
            vencimiento: debtor.vencimiento ? new Date(debtor.vencimiento).toLocaleDateString() : '',
            rut: debtor.rut || '',
            ejecutivo: debtor.nombre_ejecutivo || '',
            numero_ejecutivo: debtor.numero_ejecutivo || '',
            titulo: debtor.titulo || ''
        };

        for (const [key, value] of Object.entries(variables)) {
            personalizedMessage = personalizedMessage.replace(
                new RegExp(`{{${key}}}`, 'gi'), 
                value
            );
        }

        const result = await this.sendMessageWithTracking(sessionId, debtor.telefono, personalizedMessage);
        
        if (result.skipped) {
            return result;
        }
        
        if (!result.success) {
            if (result.error.includes('SESSION') || result.errorType === 'SESSION_DISCONNECTED') {
                return { 
                    success: false, 
                    debtor: debtor.telefono,
                    error: result.error,
                    skipped: true,
                    reason: 'session_error'
                };
            }
            return result;
        }
        
        return {
            success: true,
            debtor: debtor.telefono,
            message: 'Mensaje enviado correctamente',
            sessionId: sessionId,
            sessionPhone: session.phoneNumber,
            messageId: result.messageId,
            tracking: result.tracking
        };
        
    } catch (error) {
        console.error(`❌ Error en sendMessageToDebtor para ${debtor.telefono}:`, error.message);
        
        return {
            success: false,
            debtor: debtor.telefono,
            error: error.message,
            errorType: this.classifyError(error),
            skipped: true
        };
    }
  }

  async sendMessage(sessionId, phoneNumber, message) {
    try {
        if (!sessionId || !phoneNumber || !message) {
            return { 
                success: false, 
                error: 'sessionId, phoneNumber y message son requeridos', 
                skipped: true,
                reason: 'invalid_parameters'
            };
        }

        const session = this.sessions.get(sessionId);
        
        if (!session) {
            console.log(`⏭️  Sesión ${sessionId} no encontrada. Saltando...`);
            return { 
                success: false, 
                error: 'SESSION_NOT_FOUND', 
                skipped: true,
                reason: 'session_not_found'
            };
        }
        
        if (this.sessionsMarkedForRemoval.has(sessionId)) {
            console.log(`⏭️  Sesión ${session.phoneNumber} marcada para remoción. Saltando...`);
            return { 
                success: false, 
                error: 'SESSION_MARKED_FOR_REMOVAL', 
                skipped: true,
                reason: 'session_marked_for_removal'
            };
        }
        
        if (session.status !== 'connected' || session.isBlocked || session.markedForCleanup) {
            console.log(`⏭️  Sesión ${session.phoneNumber} no disponible (estado: ${session.status}). Saltando...`);
            return { 
                success: false, 
                error: 'SESSION_UNAVAILABLE', 
                skipped: true,
                reason: `session_${session.status}`
            };
        }

        const client = session.client;
        if (!client) {
            console.log(`⏭️  Cliente no disponible para sesión ${session.phoneNumber}. Saltando...`);
            return { 
                success: false, 
                error: 'CLIENT_UNAVAILABLE', 
                skipped: true,
                reason: 'client_not_found'
            };
        }

        let cleanNumber = phoneNumber.trim().replace(/\s+/g, '');
        
        if (cleanNumber.startsWith('+')) {
            cleanNumber = cleanNumber.substring(1);
        }
        
        if (!cleanNumber.endsWith('@c.us')) {
            cleanNumber = cleanNumber.split('@')[0] + '@c.us';
        }

        const numberWithoutSuffix = cleanNumber.replace('@c.us', '');
        if (numberWithoutSuffix.length < 8) {
            return { 
                success: false, 
                error: 'NUMBER_TOO_SHORT', 
                skipped: true,
                reason: 'invalid_number_length'
            };
        }

        console.log(`✉️ Enviando mensaje a: ${cleanNumber} desde ${session.phoneNumber}`);

        if (!cleanNumber || cleanNumber === '@c.us') {
            return { 
                success: false, 
                error: 'INVALID_PHONE_NUMBER', 
                skipped: true,
                reason: 'invalid_number_format'
            };
        }

        let numberId;
        try {
            numberId = await client.getNumberId(cleanNumber);
        } catch (error) {
            console.error('Error al obtener numberId:', error);
            return { 
                success: false, 
                error: `NUMBER_VERIFICATION_FAILED: ${error.message}`, 
                skipped: true,
                reason: 'number_verification_failed'
            };
        }

        if (!numberId) {
            console.log(`📵 Número no existe en WhatsApp: ${cleanNumber}`);
            return { 
                success: false, 
                error: 'NUMBER_NOT_EXISTS', 
                skipped: true,
                reason: 'number_not_exists'
            };
        }

      // REEMPLAZA desde la línea que tiene client.sendMessage
      const sentMessage = await client.sendMessage(numberId._serialized, message, {
      sendSeen: true
     });

console.log(`✅ Mensaje enviado a: ${cleanNumber} desde ${session.phoneNumber}`);

this.stats.totalMessages++;
this.stats.successful++;
        
        if (session) {
            session.messagesSent++;
            this.sessionManager.updateSession(sessionId, {
                messagesSent: session.messagesSent,
                lastUpdate: new Date().toISOString()
            });
        }
        
        return { 
            success: true, 
            message: 'Mensaje enviado correctamente',
            to: cleanNumber,
            sessionId: sessionId,
            sessionPhone: session.phoneNumber,
            messageId: sentMessage.id._serialized
        };

    } catch (error) {
        console.error('Error en sendMessage:', error.message);
        this.stats.totalMessages++;
        this.stats.failed++;
        
        const errorType = this.classifyError(error);
        
        return { 
            success: false, 
            error: error.message,
            errorType: errorType,
            sessionId: sessionId,
            skipped: errorType === 'SESSION_DISCONNECTED' || errorType === 'NUMBER_NOT_EXISTS'
        };
    }
  }

  // ===== API PARA GESTIÓN DE PAUSA =====
  async manualReplaceSession(oldSessionId, newSessionId) {
    try {
      console.log(`🔄 REEMPLAZO MANUAL SOLICITADO: ${oldSessionId} → ${newSessionId}`);
      
      const oldSession = this.sessions.get(oldSessionId);
      const newSession = this.sessions.get(newSessionId);
      
      if (!oldSession) {
        throw new Error('Sesión antigua no encontrada');
      }
      
      if (!newSession || newSession.status !== 'connected') {
        throw new Error('Nueva sesión no está conectada');
      }
      
      const currentCampaignPhones = this.getCurrentCampaignSessionPhones();
      if (currentCampaignPhones.includes(newSession.phoneNumber)) {
        throw new Error('La nueva sesión ya está en la campaña actual');
      }
      
      const updateSuccess = this.updateCampaignPoolsWithReplacement(
        oldSessionId,
        newSessionId
      );
      
      if (updateSuccess) {
        this.stats.sessionReplacements++;
        
        return {
          success: true,
          message: 'Reemplazo manual exitoso',
          oldSessionId,
          newSessionId,
          oldPhoneNumber: oldSession.phoneNumber,
          newPhoneNumber: newSession.phoneNumber,
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error('No se pudo actualizar los pools');
      }
    } catch (error) {
      console.error('Error en reemplazo manual:', error);
      return { success: false, error: error.message };
    }
  }

  async manualPauseCampaign(reason) {
    try {
      if (this.campaignPaused) {
        return { success: false, error: 'La campaña ya está pausada' };
      }
      
      if (!this.currentCampaignPools) {
        return { success: false, error: 'No hay campaña activa' };
      }
      
      console.log(`⏸️ PAUSA MANUAL SOLICITADA: ${reason}`);
      
      const pauseResult = this.pauseCampaignForReplacement('manual', reason);
      
      return {
        success: true,
        message: 'Campaña pausada manualmente',
        pauseId: pauseResult.pauseId,
        reason,
        pausedAt: new Date().toISOString(),
        expectedResumeIn: this.pauseConfig.defaultPauseTime
      };
    } catch (error) {
      console.error('Error en pausa manual:', error);
      return { success: false, error: error.message };
    }
  }

  async manualResumeCampaign() {
    try {
      if (!this.campaignPaused) {
        return { success: false, error: 'La campaña no está pausada' };
      }
      
      console.log(`▶️ REANUDACIÓN MANUAL SOLICITADA`);
      
      if (this.pauseTimeout) {
        clearTimeout(this.pauseTimeout);
        this.pauseTimeout = null;
      }
      
      this.campaignPaused = false;
      this.pauseReason = null;
      this.pauseStartTime = null;
      
      this.emitToFrontend('campaign_resumed_manual', {
        reason: 'manual_resume',
        resumedAt: new Date().toISOString(),
        pausedDuration: Date.now() - (this.pauseStartTime || Date.now())
      });
      
      return {
        success: true,
        message: 'Campaña reanudada manualmente',
        resumedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error en reanudación manual:', error);
      return { success: false, error: error.message };
    }
  }

  getCampaignPauseStatus() {
    return {
      campaignPaused: this.campaignPaused,
      pauseReason: this.pauseReason,
      pauseStartTime: this.pauseStartTime ? new Date(this.pauseStartTime).toISOString() : null,
      pausedDuration: this.pauseStartTime ? Date.now() - this.pauseStartTime : 0,
      disconnectedSessionsInCampaign: Array.from(this.disconnectedSessionsInCampaign.entries()).map(([sessionId, data]) => ({
        sessionId,
        ...data
      })),
      pauseConfig: this.pauseConfig,
      stats: {
        campaignPauses: this.stats.campaignPauses,
        sessionReplacements: this.stats.sessionReplacements,
        automaticResumes: this.stats.automaticResumes
      }
    };
  }

  getAvailableReplacements(excludeSessionId = null) {
    const allActiveSessions = this.getActiveSessions();
    const currentCampaignPhones = this.getCurrentCampaignSessionPhones();
    
    const availableSessions = allActiveSessions.filter(session => {
      const notInCampaign = !currentCampaignPhones.includes(session.phoneNumber);
      const notExcluded = excludeSessionId ? session.sessionId !== excludeSessionId : true;
      const isConnected = session.status === 'connected';
      const notMarked = !this.sessionsMarkedForRemoval.has(session.sessionId);
      
      return notInCampaign && notExcluded && isConnected && notMarked;
    });
    
    return availableSessions;
  }

  // ===== MANEJO DE MENSAJES ENTRANTES =====
  async handleIncomingMessage(message, sessionId, phoneNumber) {
    try {
      if (message.fromMe) return;
      
      if (message.type === 'protocol' || message.type === 'e2e_notification') return;
      
      console.log(`📩 MENSAJE RECIBIDO en ${phoneNumber}:`, {
        from: message.from,
        body: message.body,
        type: message.type,
        timestamp: message.timestamp
      });

      const messageData = {
        sessionId,
        sessionPhone: phoneNumber,
        from: message.from,
        body: message.body,
        type: message.type,
        timestamp: new Date(message.timestamp * 1000),
        messageId: message.id._serialized,
        hasMedia: message.hasMedia,
        isGroupMsg: message.isGroupMsg
      };

      this.emitToFrontend('message_received', messageData);

      try {
        const fetch = require('node-fetch');
        await fetch(`http://localhost:${process.env.PORT || 3000}/api/messages/webhook/incoming`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: message.from.replace('@c.us', ''),
            message: {
              id: message.id._serialized,
              body: message.body,
              type: message.type,
              hasMedia: message.hasMedia,
              timestamp: message.timestamp
            },
            sessionId: sessionId,
            sessionPhone: phoneNumber
          })
        });
        console.log('✅ Mensaje enviado al sistema de chat global');
      } catch (error) {
        console.error('❌ Error enviando mensaje al chat global:', error);
      }

      await this.processResponseHandlers(messageData);
      await this.identifyCampaignResponse(messageData);

    } catch (error) {
      console.error('Error procesando mensaje entrante:', error);
    }
  }

  async identifyCampaignResponse(messageData) {
    try {
      if (!this.lastCampaignResults) return;

      const fromNumber = messageData.from.replace('@c.us', '');
      
      const campaignDebtor = [
        ...this.lastCampaignResults.successes,
        ...this.lastCampaignResults.failures
      ].find(result => 
        result.debtor.telefono === fromNumber
      );

      if (campaignDebtor) {
        console.log(`🎯 RESPUESTA IDENTIFICADA de campaña: ${fromNumber}`);
        
        const responseData = {
          ...messageData,
          campaignRelated: true,
          debtor: campaignDebtor.debtor,
          originalCampaign: {
            timestamp: this.lastCampaignResults.startTime,
            success: campaignDebtor.success
          }
        };

        this.emitToFrontend('campaign_response', responseData);
        await this.updateDebtorStatus(campaignDebtor.debtor.telefono, 'contactado');
      }

    } catch (error) {
      console.error('Error identificando respuesta de campaña:', error);
    }
  }

  async updateDebtorStatus(phoneNumber, newStatus) {
    try {
      console.log(`🔄 Actualizando estado de ${phoneNumber} a: ${newStatus}`);
      
      this.emitToFrontend('debtor_status_updated', {
        phoneNumber,
        newStatus,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error actualizando estado de deudor:', error);
    }
  }

  async processResponseHandlers(messageData) {
    for (const handler of this.responseHandlers) {
      try {
        await handler(messageData);
      } catch (error) {
        console.error('Error en handler de respuesta:', error);
      }
    }
  }

  addResponseHandler(handler) {
    this.responseHandlers.push(handler);
  }

  // ===== RESTAURACIÓN DE SESIONES =====
  shouldRestoreSession(savedSession) {
    const restorableStates = ['connected', 'authenticated', 'ready', 'qr_ready'];
    
    if (!restorableStates.includes(savedSession.status)) {
        console.log(`   ❌ Sesión no restaurable - Estado: ${savedSession.status}`);
        return false;
    }
    
    const sessionExists = this.sessionManager.sessionExistsInWhatsApp(savedSession.sessionId);
    if (!sessionExists) {
        console.log(`   ❌ Sesión no existe en almacenamiento WhatsApp`);
        return false;
    }
    
    if (savedSession.markedForCleanup) {
        console.log(`   ❌ Sesión marcada para limpieza - No restaurar`);
        return false;
    }
    
    console.log(`   ✅ Sesión restaurable - Estado: ${savedSession.status}`);
    return true;
  }

  verifySessionFiles(sessionId, phoneNumber) {
    console.log(`🔍 Verificando archivos de sesión para: ${phoneNumber}`);
    return this.sessionManager.sessionExistsInWhatsApp(sessionId);
  }

  async restoreSessions() {
    console.log('🔄 RESTAURANDO SESIONES GUARDADAS...');
    const savedSessions = this.sessionManager.getConnectedSessions();
    
    console.log(`📋 Encontradas ${savedSessions.length} sesiones para restaurar`);
    
    if (savedSessions.length === 0) {
      console.log('ℹ️  No hay sesiones para restaurar');
      return;
    }
    
    for (const savedSession of savedSessions) {
      try {
        console.log(`\n🔍 PROCESANDO SESIÓN: ${savedSession.phoneNumber} (${savedSession.sessionId})`);
        
        if (savedSession.markedForCleanup) {
          console.log(`❌ Sesión ${savedSession.phoneNumber} marcada para limpieza, omitiendo restauración`);
          continue;
        }
        
        const shouldRestore = this.shouldRestoreSession(savedSession);
        console.log(`📊 ¿Debe restaurarse?: ${shouldRestore}`);

        if (!shouldRestore) {
          console.log(`❌ Sesión no cumple criterios para restauración, marcando como desconectada`);
          this.sessionManager.updateSession(savedSession.sessionId, {
            status: 'disconnected',
            error: 'Sesión no cumple criterios para restauración'
          });
          continue;
        }

        console.log(`🔄 Restaurando sesión: ${savedSession.phoneNumber}`);
        
        const result = await this.createSession(
          savedSession.sessionId, 
          savedSession.phoneNumber, 
          true
        );
        
        if (result.success) {
          console.log(`✅ Sesión restaurada exitosamente: ${savedSession.phoneNumber}`);
        } else {
          console.log(`❌ Error restaurando sesión: ${result.error}`);
        }
        
      } catch (error) {
        console.error(`💥 Error crítico restaurando sesión ${savedSession.phoneNumber}:`, error);
        this.sessionManager.updateSession(savedSession.sessionId, {
          status: 'error',
          error: error.message
        });
      }
    }
    
    console.log('✅ PROCESO DE RESTAURACIÓN COMPLETADO');
  }

  // ===== SISTEMA DE REPORTES =====
  classifyError(error) {
    const errorMessage = error.message || String(error);
    
    if (errorMessage.includes('SESSION_NOT_AVAILABLE') || 
        errorMessage.includes('SESSION_NOT_FOUND') ||
        errorMessage.includes('SESSION_UNAVAILABLE') ||
        errorMessage.includes('SESSION_MARKED_FOR_REMOVAL')) {
        return 'SESSION_DISCONNECTED';
    } else if (errorMessage.includes('blocked')) {
        return 'NUMBER_BLOCKED';
    } else if (errorMessage.includes('not exist') || 
               errorMessage.includes('no existe') ||
               errorMessage.includes('NUMBER_NOT_EXISTS')) {
        return 'NUMBER_NOT_EXISTS';
    } else if (errorMessage.includes('timeout')) {
        return 'TIMEOUT';
    } else if (errorMessage.includes('demasiado corto') || 
               errorMessage.includes('INVALID_PHONE_NUMBER')) {
        return 'INVALID_NUMBER';
    } else if (errorMessage.includes('no válido')) {
        return 'INVALID_NUMBER';
    } else if (errorMessage.includes('skipped')) {
        return 'SKIPPED';
    } else if (errorMessage.includes('CLIENT_UNAVAILABLE')) {
        return 'SESSION_DISCONNECTED';
    } else {
        return 'UNKNOWN_ERROR';
    }
  }

  generateDetailedReport(results) {
    if (!results) {
        console.error('❌ Results es undefined en generateDetailedReport');
        return {
            summary: {},
            failuresByType: {},
            topFailedDebtors: [],
            sessionHealth: {},
            recommendations: []
        };
    }

    const report = {
        summary: results.summary || {},
        failuresByType: {},
        topFailedDebtors: [],
        sessionHealth: {},
        recommendations: []
    };

    const failures = results.failures || [];
    const sessionProblems = results.sessionProblems || [];
    const successes = results.successes || [];
    const skipped = results.skipped || [];

    failures.forEach(failure => {
        const errorType = failure.details?.errorType || 'UNKNOWN';
        if (!report.failuresByType[errorType]) {
            report.failuresByType[errorType] = [];
        }
        report.failuresByType[errorType].push(failure);
    });

    skipped.forEach(skip => {
        const errorType = skip.details?.errorType || 'SKIPPED';
        if (!report.failuresByType[errorType]) {
            report.failuresByType[errorType] = [];
        }
        report.failuresByType[errorType].push(skip);
    });

    const allProblems = [...failures, ...skipped].slice(0, 10);
    report.topFailedDebtors = allProblems.map(f => ({
        nombre: f.debtor?.nombre || 'N/A',
        telefono: f.debtor?.telefono || 'N/A',
        error: f.error || 'Error desconocido',
        tipo: f.details?.errorType || 'UNKNOWN',
        skipped: f.skipped || false
    }));

    if (sessionProblems.length > 0) {
        report.recommendations.push({
            type: 'SESSION_ISSUE',
            message: `${sessionProblems.length} mensajes fallaron por problemas de sesión. Verifica la conexión de los WhatsApp.`,
            priority: 'HIGH'
        });
    }

    if (skipped.length > 0) {
        report.recommendations.push({
            type: 'SKIPPED_MESSAGES',
            message: `${skipped.length} mensajes fueron saltados (sesiones desconectadas o números inválidos).`,
            priority: 'MEDIUM'
        });
    }

    if (report.failuresByType['NUMBER_NOT_EXISTS']) {
        report.recommendations.push({
            type: 'INVALID_NUMBERS',
            message: `${report.failuresByType.NUMBER_NOT_EXISTS.length} números no existen en WhatsApp. Considera limpiar tu base de datos.`,
            priority: 'MEDIUM'
        });
    }

    if (report.failuresByType['NUMBER_BLOCKED']) {
        report.recommendations.push({
            type: 'BLOCKED_NUMBERS',
            message: `${report.failuresByType.NUMBER_BLOCKED.length} números están bloqueados.`,
            priority: 'MEDIUM'
        });
    }

    return report;
  }

  getLastCampaignReport() {
    return this.lastCampaignResults ? {
      results: this.lastCampaignResults,
      report: this.generateDetailedReport(this.lastCampaignResults)
    } : null;
  }

  // ===== CONSULTA DE ESTADOS =====
  getSessionStatus(sessionId) {
    const zombieData = this.zombieSessions.get(sessionId);
    if (zombieData) {
      const session = zombieData.data;
      return {
        sessionId,
        phoneNumber: session.phoneNumber,
        connectedNumber: session.connectedNumber,
        status: 'zombie',
        messagesSent: session.messagesSent,
        lastConnection: session.lastConnection,
        createdAt: session.createdAt,
        isBlocked: session.isBlocked,
        hasQr: !!session.qrCode,
        uptime: session.lastConnection ? 
          Date.now() - session.lastConnection.getTime() : 0,
        disconnectedAt: session.disconnectedAt,
        crashReason: session.crashReason,
        markedForCleanup: true,
        cleanupScheduled: zombieData.cleanupAt,
        reason: zombieData.reason,
        isZombie: true
      };
    }
    
    const session = this.sessions.get(sessionId);
    if (!session) {
      const savedSession = this.sessionManager.getSession(sessionId);
      if (savedSession) {
        return {
          sessionId,
          phoneNumber: savedSession.phoneNumber,
          connectedNumber: savedSession.connectedNumber,
          status: savedSession.status,
          messagesSent: savedSession.messagesSent,
          lastConnection: savedSession.lastConnection ? new Date(savedSession.lastConnection) : null,
          createdAt: savedSession.createdAt ? new Date(savedSession.createdAt) : null,
          isBlocked: savedSession.isBlocked,
          hasQr: !!savedSession.qrCode,
          uptime: savedSession.lastConnection ? 
            Date.now() - new Date(savedSession.lastConnection).getTime() : 0,
          markedForCleanup: savedSession.markedForCleanup || false
        };
      }
      return null;
    }
    
    return {
      sessionId,
      phoneNumber: session.phoneNumber,
      connectedNumber: session.connectedNumber,
      status: session.status,
      messagesSent: session.messagesSent,
      lastConnection: session.lastConnection,
      createdAt: session.createdAt,
      isBlocked: session.isBlocked,
      hasQr: !!session.qrCode,
      uptime: session.lastConnection ? 
        Date.now() - session.lastConnection.getTime() : 0,
      disconnectedAt: session.disconnectedAt,
      crashReason: session.crashReason,
      markedForCleanup: session.markedForCleanup || false
    };
  }

  getAllSessions() {
    const sessions = [];
    
    const allSessionIds = new Set([
      ...Array.from(this.sessions.keys()),
      ...Array.from(this.zombieSessions.keys()),
      ...Object.keys(this.sessionManager.getAllSessions())
    ]);
    
    for (const sessionId of allSessionIds) {
      const status = this.getSessionStatus(sessionId);
      if (status) sessions.push(status);
    }
    
    return sessions;
  }

  getStats() {
    const activeSessions = Array.from(this.sessions.values()).filter(s => 
      s.status === 'connected' && !s.markedForCleanup
    ).length;
    
    const blockedSessions = Array.from(this.sessions.values()).filter(s => 
      s.isBlocked
    ).length;

    const disconnectedSessions = Array.from(this.sessions.values()).filter(s => 
      s.status.includes('disconnected') || s.status === 'crashed' || s.status === 'zombie'
    ).length;

    const zombieSessions = this.zombieSessions.size;

    const cleanupStats = this.cleanupService ? this.cleanupService.getStats() : null;

    return {
      ...this.stats,
      activeSessions,
      blockedSessions,
      disconnectedSessions,
      zombieSessions,
      totalSessions: this.sessions.size,
      cleanupService: cleanupStats,
      timestamp: new Date().toISOString()
    };
  }

  // ===== UTILIDADES =====
  calcularDelayHibrido(config) {
    const variacion = (Math.random() * 2 - 1) * (config.delayVariacion || 2000);
    let delayFinal = (config.delayBase || 8000) + variacion;
    
    const minimo = config.delayMinimo || 6000;
    const maximo = config.delayMaximo || 10000;
    delayFinal = Math.max(minimo, Math.min(maximo, delayFinal));
    
    console.log(`⏰ Delay calculado: ${Math.round(delayFinal)}ms (base: ${config.delayBase} ± ${config.delayVariacion})`);
    return delayFinal;
  }

  barajarArray(array) {
    const nuevoArray = [...array];
    for (let i = nuevoArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nuevoArray[i], nuevoArray[j]] = [nuevoArray[j], nuevoArray[i]];
    }
    return nuevoArray;
  }

  emitToFrontend(event, data) {
    try {
      if (this.io) {
        this.io.emit(event, data);
        console.log(`📤 Evento emitido: ${event} para sesión ${data.sessionId}`);
      } else {
        console.log(`⚠️  Socket.io no disponible para emitir: ${event}`);
      }
    } catch (error) {
      console.error('Error emitiendo evento:', error);
    }
  }
}

const whatsappManagerInstance = new WhatsAppManager();
module.exports = whatsappManagerInstance;