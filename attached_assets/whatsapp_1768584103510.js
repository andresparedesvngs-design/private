const express = require('express');
const router = express.Router();
const whatsappManager = require('../services/whatsappManager');

// ===== MIDDLEWARES =====
const validateSessionId = (req, res, next) => {
  const { sessionId } = req.params;
  if (!sessionId || sessionId.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'sessionId es requerido'
    });
  }
  next();
};

const validatePhoneNumber = (req, res, next) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || phoneNumber.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'phoneNumber es requerido'
    });
  }
  next();
};

// ===== RUTAS DE SESIONES =====

// Obtener todas las sesiones
router.get('/sessions', (req, res) => {
  try {
    const sessions = whatsappManager.getAllSessions();
    res.json({ 
      success: true, 
      sessions,
      count: sessions.length
    });
  } catch (error) {
    console.error('Error obteniendo sesiones:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor al obtener sesiones' 
    });
  }
});

// Crear nueva sesión WhatsApp
router.post('/session', validatePhoneNumber, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    const result = await whatsappManager.addSession(phoneNumber.trim());
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error creando sesión:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Obtener sesión específica
router.get('/session/:sessionId', validateSessionId, (req, res) => {
  try {
    const { sessionId } = req.params;
    const status = whatsappManager.getSessionStatus(sessionId);
    
    if (status) {
      res.json({ 
        success: true, 
        session: status 
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'Sesión no encontrada' 
      });
    }
  } catch (error) {
    console.error('Error obteniendo sesión:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

// Eliminar sesión
router.delete('/session/:sessionId', validateSessionId, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { immediate } = req.query;
    
    console.log(`🗑️ Solicitando eliminar sesión: ${sessionId} (inmediato: ${immediate})`);
    
    const result = await whatsappManager.removeSession(
      sessionId, 
      immediate === 'true'
    );
    
    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Sesión eliminada correctamente',
        sessionId 
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error eliminando sesión:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ===== RUTAS DE MENSAJES =====

// Enviar mensaje de prueba
router.post('/send-test', async (req, res) => {
  try {
    const { sessionId, phoneNumber, message } = req.body;
    
    // Validaciones
    if (!sessionId?.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'sessionId es requerido' 
      });
    }

    if (!phoneNumber?.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'phoneNumber es requerido' 
      });
    }

    if (!message?.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'message es requerido' 
      });
    }

    const result = await whatsappManager.sendMessage(
      sessionId.trim(), 
      phoneNumber.trim(), 
      message.trim()
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error en ruta /send-test:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ===== RUTAS DE ESTADÍSTICAS E INFORMACIÓN =====

// Obtener estadísticas generales
router.get('/stats', (req, res) => {
  try {
    const stats = whatsappManager.getStats();
    res.json({ 
      success: true, 
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor al obtener estadísticas' 
    });
  }
});

// ===== RUTAS DE REPORTES DE CAMPAÑAS =====

// Obtener último reporte de campaña
router.get('/campaigns/last-report', (req, res) => {
  try {
    const report = whatsappManager.getLastCampaignReport();
    
    if (report) {
      res.json({
        success: true,
        report
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No hay reportes de campaña disponibles'
      });
    }
  } catch (error) {
    console.error('Error obteniendo reporte de campaña:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al obtener reporte'
    });
  }
});

// ===== RUTAS DE PAUSA INTELIGENTE =====

// Obtener estado de pausa de campaña
router.get('/campaign/pause-status', (req, res) => {
  try {
    const pauseStatus = whatsappManager.getCampaignPauseStatus();
    
    res.json({
      success: true,
      ...pauseStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo estado de pausa:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Pausar campaña manualmente
router.post('/campaign/pause', async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Se requiere una razón para la pausa'
      });
    }
    
    const result = await whatsappManager.manualPauseCampaign(reason.trim());
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error pausando campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reanudar campaña manualmente
router.post('/campaign/resume', async (req, res) => {
  try {
    const result = await whatsappManager.manualResumeCampaign();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error reanudando campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reemplazar sesión manualmente
router.post('/campaign/replace-session', async (req, res) => {
  try {
    const { oldSessionId, newSessionId } = req.body;
    
    if (!oldSessionId || !newSessionId) {
      return res.status(400).json({
        success: false,
        error: 'oldSessionId y newSessionId son requeridos'
      });
    }
    
    const result = await whatsappManager.manualReplaceSession(oldSessionId, newSessionId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error reemplazando sesión:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener sesiones disponibles para reemplazo
router.get('/campaign/available-replacements/:excludeSessionId?', (req, res) => {
  try {
    const { excludeSessionId } = req.params;
    const availableSessions = whatsappManager.getAvailableReplacements(excludeSessionId);
    const currentCampaignPhones = whatsappManager.getCurrentCampaignSessionPhones();
    
    res.json({
      success: true,
      availableSessions,
      count: availableSessions.length,
      currentCampaignSessionCount: currentCampaignPhones.length,
      currentCampaignSessions: currentCampaignPhones,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo reemplazos disponibles:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener sesiones desconectadas en campaña actual
router.get('/campaign/disconnected-sessions', (req, res) => {
  try {
    const pauseStatus = whatsappManager.getCampaignPauseStatus();
    const disconnectedSessions = pauseStatus.disconnectedSessionsInCampaign || [];
    
    // Enriquecer con información de sesión
    const enrichedSessions = disconnectedSessions.map(sessionInfo => {
      const session = whatsappManager.getSessionStatus(sessionInfo.sessionId);
      return {
        ...sessionInfo,
        sessionDetails: session
      };
    });
    
    res.json({
      success: true,
      disconnectedSessions: enrichedSessions,
      count: enrichedSessions.length,
      campaignPaused: pauseStatus.campaignPaused,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error obteniendo sesiones desconectadas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Configurar parámetros de pausa
router.post('/campaign/pause-config', (req, res) => {
  try {
    const { defaultPauseTime, maxPauseTime, minPauseTime, autoResume, notifyFrontend } = req.body;
    
    // Actualizar configuración si se proporciona
    if (defaultPauseTime !== undefined) {
      whatsappManager.pauseConfig.defaultPauseTime = parseInt(defaultPauseTime);
    }
    
    if (maxPauseTime !== undefined) {
      whatsappManager.pauseConfig.maxPauseTime = parseInt(maxPauseTime);
    }
    
    if (minPauseTime !== undefined) {
      whatsappManager.pauseConfig.minPauseTime = parseInt(minPauseTime);
    }
    
    if (autoResume !== undefined) {
      whatsappManager.pauseConfig.autoResume = Boolean(autoResume);
    }
    
    if (notifyFrontend !== undefined) {
      whatsappManager.pauseConfig.notifyFrontend = Boolean(notifyFrontend);
    }
    
    res.json({
      success: true,
      message: 'Configuración de pausa actualizada',
      config: whatsappManager.pauseConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error configurando pausa:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== RUTAS DE SALUD DEL SISTEMA =====

// Health check de WhatsApp Manager
router.get('/health', (req, res) => {
  try {
    const stats = whatsappManager.getStats();
    const sessions = whatsappManager.getAllSessions();
    const pauseStatus = whatsappManager.getCampaignPauseStatus();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      stats: {
        totalSessions: sessions.length,
        activeSessions: stats.activeSessions,
        blockedSessions: stats.blockedSessions,
        totalMessages: stats.totalMessages,
        successfulMessages: stats.successful,
        failedMessages: stats.failed,
        campaignPauses: stats.campaignPauses,
        sessionReplacements: stats.sessionReplacements
      },
      sessions: {
        connected: sessions.filter(s => s.status === 'connected').length,
        disconnected: sessions.filter(s => s.status === 'disconnected').length,
        qr_ready: sessions.filter(s => s.status === 'qr_ready').length,
        error: sessions.filter(s => s.status === 'error').length
      },
      campaignStatus: {
        isPaused: pauseStatus.campaignPaused,
        pauseReason: pauseStatus.pauseReason,
        disconnectedInCampaign: pauseStatus.disconnectedSessionsInCampaign.length
      }
    };
    
    res.json({
      success: true,
      health
    });
  } catch (error) {
    console.error('Error en health check:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.originalUrl}`,
    availableEndpoints: [
      'GET    /whatsapp/sessions',
      'POST   /whatsapp/session',
      'GET    /whatsapp/session/:sessionId',
      'DELETE /whatsapp/session/:sessionId',
      'POST   /whatsapp/send-test',
      'GET    /whatsapp/stats',
      'GET    /whatsapp/campaigns/last-report',
      'GET    /whatsapp/health',
      'GET    /whatsapp/campaign/pause-status',
      'POST   /whatsapp/campaign/pause',
      'POST   /whatsapp/campaign/resume',
      'POST   /whatsapp/campaign/replace-session',
      'GET    /whatsapp/campaign/available-replacements/:excludeSessionId?',
      'GET    /whatsapp/campaign/disconnected-sessions',
      'POST   /whatsapp/campaign/pause-config'
    ]
  });
});

module.exports = router;