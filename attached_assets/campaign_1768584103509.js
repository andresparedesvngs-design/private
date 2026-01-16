// backend/routes/campaign.js - VERSIÓN COMPLETA CON VALIDACIÓN DE DEUDORES Y PAUSA INTELIGENTE
const express = require('express');
const router = express.Router();

// ===== VARIABLES DE CONTROL DE CAMPAÑA =====
let isCampaignRunning = false;
let lastCampaignStart = 0;
let currentCampaignId = null;

// ===== CONFIGURACIÓN PERSISTENTE =====
let campaignConfig = {
  message: '',
  mode: 'sequential',
  simultaneousMessages: 1,
  delay: 1000,
  maxActiveWhatsApps: 5,
  speed: 'medium',
  antiBlock: true,
  pauseIntelligent: true,
  pauseConfig: {
    autoPause: true,
    pauseTime: 5000,
    maxPauses: 10,
    allowManualOverride: true
  },
  filters: {
    minDebt: 0,
    maxDebt: 1000000,
    states: ['pendiente'],
    executive: '',
    dueDate: null
  }
};

// ===== FUNCIÓN DE VALIDACIÓN DE DEUDORES =====
const validateDebtors = (debtors) => {
  const validationResults = {
    valid: [],
    invalid: [],
    duplicates: [],
    statistics: {
      total: debtors ? debtors.length : 0,
      valid: 0,
      invalid: 0,
      duplicates: 0,
      withPhone: 0,
      withoutPhone: 0,
      phoneFormatErrors: 0
    }
  };

  if (!debtors || !Array.isArray(debtors) || debtors.length === 0) {
    return validationResults;
  }

  const seenPhones = new Set();
  const seenRUTs = new Set();

  debtors.forEach((debtor, index) => {
    const errors = [];
    const warnings = [];
    
    // Validación básica
    if (!debtor.nombre || debtor.nombre.trim() === '') {
      errors.push('Nombre vacío o inválido');
    }
    
    // Validación de teléfono
    if (!debtor.telefono || debtor.telefono.toString().trim() === '') {
      errors.push('Teléfono requerido');
      validationResults.statistics.withoutPhone++;
    } else {
      validationResults.statistics.withPhone++;
      
      // Limpiar y validar formato
      const cleanPhone = debtor.telefono.toString().replace(/\D/g, '');
      
      if (cleanPhone.length < 8) {
        errors.push(`Teléfono demasiado corto: ${debtor.telefono}`);
        validationResults.statistics.phoneFormatErrors++;
      }
      
      // Verificar duplicados
      if (cleanPhone && seenPhones.has(cleanPhone)) {
        warnings.push('Teléfono duplicado');
        validationResults.duplicates.push({
          index,
          debtor,
          field: 'telefono',
          value: debtor.telefono
        });
        validationResults.statistics.duplicates++;
      } else if (cleanPhone) {
        seenPhones.add(cleanPhone);
      }
    }
    
    // Validación de RUT (opcional)
    if (debtor.rut && debtor.rut.trim() !== '') {
      if (seenRUTs.has(debtor.rut)) {
        warnings.push('RUT duplicado');
        validationResults.duplicates.push({
          index,
          debtor,
          field: 'rut',
          value: debtor.rut
        });
        validationResults.statistics.duplicates++;
      } else {
        seenRUTs.add(debtor.rut);
      }
    }
    
    // Validación de deuda
    if (debtor.deuda === undefined || debtor.deuda === null) {
      warnings.push('Deuda no especificada');
    } else if (isNaN(parseFloat(debtor.deuda))) {
      errors.push('Deuda inválida');
    }
    
    const debtorValidation = {
      debtor,
      index,
      isValid: errors.length === 0,
      errors,
      warnings,
      cleanPhone: debtor.telefono ? debtor.telefono.toString().replace(/\D/g, '') : null
    };
    
    if (debtorValidation.isValid) {
      validationResults.valid.push(debtorValidation);
      validationResults.statistics.valid++;
    } else {
      validationResults.invalid.push(debtorValidation);
      validationResults.statistics.invalid++;
    }
  });
  
  return validationResults;
};

// ===== MIDDLEWARES ACTUALIZADOS =====

const validateCampaignConfig = (req, res, next) => {
  const { message, config } = req.body;
  
  if (!message || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'El mensaje no puede estar vacío'
    });
  }
  
  next();
};

const validateCampaignStart = (req, res, next) => {
  const { pools, debtors, debtorsCount } = req.body;
  
  if (!pools || pools.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No hay pools configurados'
    });
  }

  // Validar que los pools tengan la estructura correcta
  const validPools = pools.filter(pool => 
    pool.sessions && 
    pool.sessions.length > 0 && 
    ['turnos_fijos', 'turnos_aleatorios', 'competitivo'].includes(pool.mode)
  );

  if (validPools.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No hay pools válidos. Cada pool debe tener sesiones y un modo válido'
    });
  }

  const finalDebtorsCount = debtors ? debtors.length : debtorsCount;
  if (!finalDebtorsCount || finalDebtorsCount === 0) {
    return res.status(400).json({
      success: false,
      error: 'No hay deudores cargados en el sistema'
    });
  }
  
  next();
};

// ===== MIDDLEWARE PARA PROTECCIÓN DE CAMPAÑAS SIMULTÁNEAS =====
const protectConcurrentCampaigns = (req, res, next) => {
  const now = Date.now();
  
  // 1. Prevenir múltiples campañas simultáneas
  if (isCampaignRunning) {
    return res.status(429).json({
      success: false,
      error: 'Ya hay una campaña en ejecución. Espera a que termine.',
      code: 'CAMPAIGN_ALREADY_RUNNING',
      campaignId: currentCampaignId
    });
  }
  
  // 2. Prevenir clicks rápidos (debounce en backend)
  if (now - lastCampaignStart < 3000) { // 3 segundos mínimo entre campañas
    return res.status(429).json({
      success: false,
      error: 'Por favor espera 3 segundos antes de iniciar otra campaña',
      code: 'TOO_SOON',
      waitTime: Math.ceil((3000 - (now - lastCampaignStart)) / 1000)
    });
  }
  
  // 3. Marcar como en ejecución y actualizar timestamp
  isCampaignRunning = true;
  lastCampaignStart = now;
  currentCampaignId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`🔒 Campaña bloqueada para ejecución única. ID: ${currentCampaignId}`);
  
  // Agregar cleanup para cuando la respuesta termine
  const originalEnd = res.end;
  res.end = function(...args) {
    // Solo liberar si no se ha liberado ya
    if (isCampaignRunning) {
      isCampaignRunning = false;
      console.log(`🔓 Campaña liberada. ID: ${currentCampaignId}`);
    }
    return originalEnd.apply(this, args);
  };
  
  next();
};

// ===== MIDDLEWARE PARA PAUSA INTELIGENTE =====
const checkCampaignPauseStatus = async (req, res, next) => {
  try {
    const WhatsAppManager = require('../services/whatsappManager');
    const pauseStatus = WhatsAppManager.getCampaignPauseStatus();
    
    if (pauseStatus.campaignPaused) {
      return res.status(429).json({
        success: false,
        error: 'La campaña está actualmente pausada',
        code: 'CAMPAIGN_PAUSED',
        pauseReason: pauseStatus.pauseReason,
        pausedSince: pauseStatus.pauseStartTime,
        expectedResume: new Date(Date.now() + pauseStatus.pausedDuration).toISOString()
      });
    }
    
    next();
  } catch (error) {
    console.error('Error verificando estado de pausa:', error);
    next();
  }
};

// ===== RUTAS DE CONFIGURACIÓN =====

// Guardar configuración de campaña
router.post('/config', (req, res) => {
  try {
    const { message, pauseIntelligent, pauseConfig, ...config } = req.body;
    
    // Actualizar configuración de pausa si se proporciona
    if (pauseIntelligent !== undefined) {
      campaignConfig.pauseIntelligent = pauseIntelligent;
    }
    
    if (pauseConfig) {
      campaignConfig.pauseConfig = {
        ...campaignConfig.pauseConfig,
        ...pauseConfig
      };
    }
    
    // Actualizar configuración principal
    campaignConfig = { 
      ...campaignConfig, 
      ...config,
      message: message || campaignConfig.message 
    };
    
    // Asegurar valores por defecto en filtros
    campaignConfig.filters = {
      minDebt: 0,
      maxDebt: 1000000,
      states: ['pendiente'],
      executive: '',
      dueDate: null,
      ...campaignConfig.filters
    };

    const io = req.app.get('io');
    io.emit('campaign_updated_with_pause', campaignConfig);
    
    res.json({ 
      success: true, 
      message: 'Configuración guardada correctamente',
      config: campaignConfig,
      pauseIntelligent: campaignConfig.pauseIntelligent,
      pauseConfig: campaignConfig.pauseConfig
    });
  } catch (error) {
    console.error('Error guardando configuración:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Obtener configuración de campaña
router.get('/config', (req, res) => {
  // Ejemplos de configuración para nuevos modos
  const configEjemplos = {
    modos_disponibles: {
      turnos_fijos: {
        descripcion: "Sesiones en orden fijo con delays variables",
        config_recomendada: {
          delayBase: 8000,
          delayVariacion: 2000,
          delayMinimo: 6000,
          delayMaximo: 10000
        }
      },
      turnos_aleatorios: {
        descripcion: "Sesiones en orden aleatorio que cambia cada ciclo",
        config_recomendada: {
          delayBase: 8000,
          delayVariacion: 2000,
          delayMinimo: 6000,
          delayMaximo: 10000
        }
      },
      competitivo: {
        descripcion: "Múltiples sesiones trabajando en paralelo",
        config_recomendada: {
          delayBase: 3000,
          delayVariacion: 1000,
          delayMinimo: 2000,
          delayMaximo: 5000,
          maxSesionesSimultaneas: 3
        }
      }
    },
    pausa_inteligente: {
      activado: campaignConfig.pauseIntelligent,
      configuracion: campaignConfig.pauseConfig,
      descripcion: "Sistema de pausa automática para evitar bloqueos",
      beneficios: [
        "Detección automática de patrones de bloqueo",
        "Reemplazo inteligente de sesiones",
        "Pausas estratégicas para evitar límites de WhatsApp"
      ]
    }
  };
  
  res.json({ 
    success: true, 
    config: campaignConfig,
    ejemplos: configEjemplos
  });
});

// ===== RUTAS DE VALIDACIÓN DE DEUDORES =====

// Validar lista de deudores
router.post('/validate-debtors', (req, res) => {
  try {
    const { debtors } = req.body;
    
    if (!debtors || !Array.isArray(debtors)) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un array de deudores'
      });
    }
    
    const validation = validateDebtors(debtors);
    
    res.json({
      success: true,
      validation: validation,
      summary: {
        message: `Validación completada: ${validation.statistics.valid} válidos, ${validation.statistics.invalid} inválidos, ${validation.duplicates.length} duplicados`,
        canProceed: validation.statistics.valid > 0
      }
    });
    
  } catch (error) {
    console.error('Error validando deudores:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== RUTAS DE EJECUCIÓN DE CAMPAÑA =====

// Iniciar campaña con sistema de pools, validación de deudores y pausa inteligente
router.post('/start', protectConcurrentCampaigns, validateCampaignConfig, 
  validateCampaignStart, checkCampaignPauseStatus, async (req, res) => {
  
  console.log('🚀 SOLICITUD DE INICIO DE CAMPAÑA CON VALIDACIÓN Y PAUSA INTELIGENTE');
  
  try {
    const { message, config, debtors, debtorsCount, pools, viewType, enablePauseIntelligent } = req.body;
    
    // Validar deudores si se proporcionan
    let finalDebtors = debtors || [];
    let validationResults = null;
    
    if (finalDebtors.length > 0) {
      console.log('🔍 Validando lista de deudores...');
      validationResults = validateDebtors(finalDebtors);
      
      console.log('📊 Resultados de validación:', {
        total: validationResults.statistics.total,
        validos: validationResults.statistics.valid,
        invalidos: validationResults.statistics.invalid,
        duplicados: validationResults.duplicates.length
      });
      
      // Si hay deudores inválidos, mostrar advertencia
      if (validationResults.statistics.invalid > 0) {
        console.warn(`⚠️ Advertencia: ${validationResults.statistics.invalid} deudores inválidos encontrados`);
        
        // Mostrar primeros 5 errores
        validationResults.invalid.slice(0, 5).forEach(invalid => {
          console.warn(`   Deudor ${invalid.index + 1}: ${invalid.errors.join(', ')}`);
        });
      }
      
      // Usar solo deudores válidos
      const validDebtors = validationResults.valid.map(v => v.debtor);
      
      if (validDebtors.length === 0) {
        // Liberar bloqueo antes de responder
        isCampaignRunning = false;
        return res.status(400).json({
          success: false,
          error: 'No hay deudores válidos para enviar',
          validation: validationResults
        });
      }
      
      console.log(`✅ Usando ${validDebtors.length} deudores válidos de ${validationResults.statistics.total} totales`);
      finalDebtors = validDebtors;
    }
    
    const finalDebtorsCount = finalDebtors.length;

    // Preparar pools con configuración completa
    const preparedPools = pools.map(pool => ({
      ...pool,
      // Asegurar valores por defecto para delays
      delayBase: pool.delayBase || 8000,
      delayVariacion: pool.delayVariacion || 2000,
      delayMinimo: pool.delayMinimo || 6000,
      delayMaximo: pool.delayMaximo || 10000,
      maxSesionesSimultaneas: pool.maxSesionesSimultaneas || pool.sessions.length
    }));

    // Actualizar configuración de campaña
    if (config) {
      campaignConfig = { ...campaignConfig, ...config, message };
    } else {
      campaignConfig.message = message;
    }
    
    // Activar/desactivar pausa inteligente según solicitud
    if (enablePauseIntelligent !== undefined) {
      campaignConfig.pauseIntelligent = enablePauseIntelligent;
    }

    console.log('📋 Configuración final de campaña:', {
      pauseIntelligent: campaignConfig.pauseIntelligent,
      pauseConfig: campaignConfig.pauseConfig,
      pools: preparedPools.length,
      debtors: finalDebtorsCount,
      messageLength: campaignConfig.message?.length || 0
    });

    // Emitir evento de inicio con información de pausa
    const io = req.app.get('io');
    io.emit('campaign_started_with_pause', {
      message: 'Campaña iniciada con validación de deudores y sistema de pausa inteligente',
      config: campaignConfig,
      debtorsCount: finalDebtorsCount,
      pools: preparedPools,
      startTime: new Date().toISOString(),
      viewType: viewType,
      mode: 'nuevo_sistema_pools_con_pausa',
      campaignId: currentCampaignId,
      pauseIntelligent: campaignConfig.pauseIntelligent,
      validation: validationResults ? {
        valid: validationResults.statistics.valid,
        invalid: validationResults.statistics.invalid,
        duplicates: validationResults.duplicates.length
      } : null
    });

    // Ejecutar campaña con pools preparados
    const WhatsAppManager = require('../services/whatsappManager');
    
    if (!WhatsAppManager || typeof WhatsAppManager.startCampaignWithPools !== 'function') {
      // Liberar bloqueo antes de responder
      isCampaignRunning = false;
      throw new Error('WhatsAppManager no tiene el método startCampaignWithPools');
    }

    console.log(`✅ Iniciando campaña con nuevo sistema de pools y pausa inteligente... ID: ${currentCampaignId}`);
    
    const result = await WhatsAppManager.startCampaignWithPools({
      message: campaignConfig.message,
      debtors: finalDebtors,
      pools: preparedPools,
      config: campaignConfig,
      campaignId: currentCampaignId
    });
    
    console.log(`✅ Campaña ${currentCampaignId} ejecutada exitosamente:`, {
      successful: result.successful,
      total: result.total,
      poolsUsed: result.poolsUsed,
      campaignPauses: result.campaignPauses || 0,
      sessionReplacements: result.sessionReplacements || 0,
      successRate: result.successRate
    });
    
    // Mensaje de finalización con detalles de pools y pausas
    let completionMessage = `Campaña completada: ${result.successful}/${result.total} mensajes enviados`;
    completionMessage += ` usando ${result.poolsUsed} pools`;
    if (result.campaignPauses > 0) {
      completionMessage += ` (${result.campaignPauses} pausas, ${result.sessionReplacements} reemplazos)`;
    }
    
    // Liberar bloqueo después de completar exitosamente
    isCampaignRunning = false;
    
    res.json({ 
      success: true, 
      message: completionMessage,
      data: {
        campaignId: currentCampaignId,
        debtorsCount: finalDebtorsCount,
        poolsCount: preparedPools.length,
        poolsUsed: result.poolsUsed,
        successful: result.successful,
        failed: result.failed,
        skipped: result.skipped,
        remainingInQueue: result.remainingInQueue,
        campaignPauses: result.campaignPauses || 0,
        sessionReplacements: result.sessionReplacements || 0,
        successRate: result.successRate,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        mode: 'nuevo_sistema_pools_con_pausa',
        pauseIntelligent: campaignConfig.pauseIntelligent,
        hasReport: !result.reportError,
        reportError: result.reportError || null,
        validation: validationResults ? {
          totalChecked: validationResults.statistics.total,
          validDebtors: validationResults.statistics.valid,
          invalidDebtors: validationResults.statistics.invalid,
          duplicatesFound: validationResults.duplicates.length
        } : null
      }
    });

  } catch (error) {
    console.error('💥 ERROR iniciando campaña:', error);
    
    // Liberar bloqueo en caso de error
    isCampaignRunning = false;
    
    // Emitir evento de error
    const io = req.app.get('io');
    io.emit('campaign_error_with_pause', {
      error: error.message,
      campaignId: currentCampaignId,
      failedAt: new Date().toISOString(),
      pauseIntelligent: campaignConfig.pauseIntelligent
    });
    
    res.status(500).json({ 
      success: false, 
      error: 'Error iniciando campaña: ' + error.message,
      campaignId: currentCampaignId
    });
  }
});

// ===== RUTAS DE GESTIÓN DE PAUSA =====

// Obtener estado de pausa de campaña actual
router.get('/pause-status', (req, res) => {
  try {
    const WhatsAppManager = require('../services/whatsappManager');
    const pauseStatus = WhatsAppManager.getCampaignPauseStatus();
    const campaignStatus = {
      isCampaignRunning,
      currentCampaignId,
      lastCampaignStart: lastCampaignStart ? new Date(lastCampaignStart).toISOString() : null
    };
    
    res.json({
      success: true,
      campaignStatus,
      pauseStatus,
      config: {
        pauseIntelligent: campaignConfig.pauseIntelligent,
        pauseConfig: campaignConfig.pauseConfig
      },
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

// Pausar campaña actual manualmente
router.post('/pause', async (req, res) => {
  try {
    if (!isCampaignRunning) {
      return res.status(400).json({
        success: false,
        error: 'No hay campaña en ejecución para pausar'
      });
    }
    
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Se requiere una razón para la pausa'
      });
    }
    
    const WhatsAppManager = require('../services/whatsappManager');
    const result = await WhatsAppManager.manualPauseCampaign(reason.trim());
    
    if (result.success) {
      const io = req.app.get('io');
      io.emit('campaign_paused_manual', {
        reason,
        pausedAt: new Date().toISOString(),
        pauseId: result.pauseId,
        campaignId: currentCampaignId
      });
      
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

// Reanudar campaña actual manualmente
router.post('/resume', async (req, res) => {
  try {
    if (!isCampaignRunning) {
      return res.status(400).json({
        success: false,
        error: 'No hay campaña en ejecución para reanudar'
      });
    }
    
    const WhatsAppManager = require('../services/whatsappManager');
    const result = await WhatsAppManager.manualResumeCampaign();
    
    if (result.success) {
      const io = req.app.get('io');
      io.emit('campaign_resumed_manual', {
        resumedAt: new Date().toISOString(),
        campaignId: currentCampaignId,
        pauseDuration: result.pausedDuration
      });
      
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

// Reemplazar sesión en campaña actual
router.post('/replace-session', async (req, res) => {
  try {
    if (!isCampaignRunning) {
      return res.status(400).json({
        success: false,
        error: 'No hay campaña en ejecución'
      });
    }
    
    const { oldSessionId, newSessionId } = req.body;
    
    if (!oldSessionId || !newSessionId) {
      return res.status(400).json({
        success: false,
        error: 'oldSessionId y newSessionId son requeridos'
      });
    }
    
    const WhatsAppManager = require('../services/whatsappManager');
    const result = await WhatsAppManager.manualReplaceSession(oldSessionId, newSessionId);
    
    if (result.success) {
      const io = req.app.get('io');
      io.emit('campaign_session_replaced_manual', {
        oldSessionId,
        newSessionId,
        oldPhoneNumber: result.oldPhoneNumber,
        newPhoneNumber: result.newPhoneNumber,
        replacedAt: new Date().toISOString(),
        campaignId: currentCampaignId
      });
      
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
router.get('/available-replacements', (req, res) => {
  try {
    if (!isCampaignRunning) {
      return res.status(400).json({
        success: false,
        error: 'No hay campaña en ejecución'
      });
    }
    
    const { excludeSessionId } = req.query;
    const WhatsAppManager = require('../services/whatsappManager');
    const availableSessions = WhatsAppManager.getAvailableReplacements(excludeSessionId);
    
    res.json({
      success: true,
      availableSessions,
      count: availableSessions.length,
      campaignId: currentCampaignId,
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

// Validar configuración de pools
router.post('/validate-pools', (req, res) => {
  try {
    const { pools } = req.body;
    
    if (!pools || !Array.isArray(pools)) {
      return res.status(400).json({
        success: false,
        error: 'Pools debe ser un array'
      });
    }

    const validationResults = pools.map((pool, index) => {
      const errors = [];
      
      // Validar campos requeridos
      if (!pool.name) errors.push('Nombre es requerido');
      if (!pool.sessions || pool.sessions.length === 0) errors.push('Sesiones son requeridas');
      if (!pool.mode) errors.push('Modo es requerido');
      
      // Validar modo
      if (pool.mode && !['turnos_fijos', 'turnos_aleatorios', 'competitivo'].includes(pool.mode)) {
        errors.push('Modo no válido');
      }
      
      // Validar delays
      if (pool.delayBase && (pool.delayBase < 1000 || pool.delayBase > 30000)) {
        errors.push('Delay base debe estar entre 1000 y 30000 ms');
      }
      
      if (pool.delayVariacion && (pool.delayVariacion < 0 || pool.delayVariacion > 10000)) {
        errors.push('Variación de delay debe estar entre 0 y 10000 ms');
      }
      
      return {
        pool: pool.name || `Pool ${index + 1}`,
        isValid: errors.length === 0,
        errors: errors
      };
    });

    const allValid = validationResults.every(result => result.isValid);
    
    res.json({
      success: true,
      allValid: allValid,
      results: validationResults,
      message: allValid ? 
        'Todos los pools son válidos' : 
        'Algunos pools tienen errores de configuración'
    });

  } catch (error) {
    console.error('Error validando pools:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Detener campaña
router.post('/stop', async (req, res) => {
  try {
    const io = req.app.get('io');
    
    // Liberar el bloqueo de campaña en ejecución
    isCampaignRunning = false;
    console.log(`🔓 Campaña detenida manualmente. ID anterior: ${currentCampaignId}`);
    
    io.emit('campaign_stopped', {
      message: 'Campaña detenida por el usuario',
      campaignId: currentCampaignId,
      stoppedAt: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Solicitud de detención recibida',
      campaignId: currentCampaignId
    });
  } catch (error) {
    console.error('Error deteniendo campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Cancelar campaña
router.post('/cancel', async (req, res) => {
  try {
    const io = req.app.get('io');
    
    // Liberar el bloqueo de campaña en ejecución
    isCampaignRunning = false;
    console.log(`🔓 Campaña cancelada manualmente. ID anterior: ${currentCampaignId}`);
    
    io.emit('campaign_cancelled', {
      message: 'Campaña cancelada por el usuario',
      campaignId: currentCampaignId,
      cancelledAt: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Campaña cancelada exitosamente',
      campaignId: currentCampaignId
    });
  } catch (error) {
    console.error('Error cancelando campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener estado de la campaña actual
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: isCampaignRunning ? 'running' : 'ready',
    isRunning: isCampaignRunning,
    currentCampaignId: currentCampaignId,
    timeSinceLastStart: lastCampaignStart ? Date.now() - lastCampaignStart : null,
    config: campaignConfig,
    lastUpdated: new Date().toISOString()
  });
});

// Forzar liberación de campaña (para casos de emergencia)
router.post('/force-release', (req, res) => {
  const wasRunning = isCampaignRunning;
  isCampaignRunning = false;
  
  console.log(`🔄 Estado de campaña forzado a liberado. Anterior: ${wasRunning ? 'Ejecutando' : 'Libre'}`);
  
  res.json({
    success: true,
    message: 'Estado de campaña liberado forzosamente',
    wasRunning: wasRunning,
    nowRunning: false,
    timestamp: new Date().toISOString()
  });
});

// ===== RUTAS DE REPORTES =====

// Obtener reporte de la última campaña
router.get('/report/last', (req, res) => {
  try {
    const WhatsAppManager = require('../services/whatsappManager');
    const report = WhatsAppManager.getLastCampaignReport();
    
    if (report) {
      res.json({
        success: true,
        report: report
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No hay reporte de campaña disponible'
      });
    }
  } catch (error) {
    console.error('Error obteniendo reporte:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener reporte detallado de la última campaña (nueva ruta)
router.get('/last-report', (req, res) => {
  try {
    const WhatsAppManager = require('../services/whatsappManager');
    const report = WhatsAppManager.getLastCampaignReport();
    
    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'No hay campañas ejecutadas recientemente'
      });
    }
    
    res.json({
      success: true,
      report: report
    });
    
  } catch (error) {
    console.error('Error obteniendo reporte:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Exportar reporte a CSV
router.get('/report/export', async (req, res) => {
  try {
    console.log('📤 Solicitando exportación de reporte...');
    
    const WhatsAppManager = require('../services/whatsappManager');
    const report = WhatsAppManager.getLastCampaignReport();
    
    if (!report) {
      console.log('❌ No hay reporte para exportar');
      return res.status(404).json({
        success: false,
        error: 'No hay reporte de campaña disponible para exportar'
      });
    }

    console.log('📊 Generando CSV con datos del reporte...');

    // Generar CSV con encabezados
    let csv = 'Nombre,Telefono,RUT,Deuda,Estado,Error,Tipo Error,Sesion,Pausas,Timestamp\n';
    
    // Procesar fallos
    if (report.results && report.results.failures && report.results.failures.length > 0) {
      report.results.failures.forEach(failure => {
        const row = [
          `"${(failure.debtor?.nombre || '').replace(/"/g, '""')}"`,
          `"${(failure.debtor?.telefono || '').replace(/"/g, '""')}"`,
          `"${(failure.debtor?.rut || '').replace(/"/g, '""')}"`,
          failure.debtor?.deuda || 0,
          '"FAILED"',
          `"${(failure.error || '').replace(/"/g, '""')}"`,
          `"${(failure.details?.errorType || 'UNKNOWN').replace(/"/g, '""')}"`,
          `"${(failure.session || '').replace(/"/g, '""')}"`,
          failure.details?.pauses || 0,
          `"${(failure.timestamp || '').replace(/"/g, '""')}"`
        ].join(',');
        csv += row + '\n';
      });
    }

    // Procesar éxitos
    if (report.results && report.results.successes && report.results.successes.length > 0) {
      report.results.successes.forEach(success => {
        const row = [
          `"${(success.debtor?.nombre || '').replace(/"/g, '""')}"`,
          `"${(success.debtor?.telefono || '').replace(/"/g, '""')}"`,
          `"${(success.debtor?.rut || '').replace(/"/g, '""')}"`,
          success.debtor?.deuda || 0,
          '"SUCCESS"',
          '""',
          '""',
          `"${(success.session || '').replace(/"/g, '""')}"`,
          success.details?.pauses || 0,
          `"${(success.timestamp || '').replace(/"/g, '""')}"`
        ].join(',');
        csv += row + '\n';
      });
    }

    console.log(`✅ CSV generado: ${csv.split('\n').length - 1} filas`);

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="campaign-report.csv"');
    res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8'));
    
    // Enviar CSV
    res.send(csv);

  } catch (error) {
    console.error('❌ Error exportando reporte:', error);
    res.status(500).json({
      success: false,
      error: 'Error exportando reporte: ' + error.message
    });
  }
});

// ===== RUTAS DE PRUEBAS =====

// Probar mensajes individuales
router.post('/test', async (req, res) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'Teléfono y mensaje son requeridos'
      });
    }

    console.log(`🧪 Enviando mensaje de prueba REAL a: ${phoneNumber}`);
    
    const WhatsAppManager = require('../services/whatsappManager');
    
    const activeSessions = WhatsAppManager.getActiveSessions();
    if (activeSessions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay sesiones activas disponibles para prueba'
      });
    }
    
    const session = activeSessions[0];
    
    const result = await WhatsAppManager.sendMessage(session.sessionId, phoneNumber, message);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Mensaje REAL enviado a ${phoneNumber}`,
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        data: result
      });
    }
    
  } catch (error) {
    console.error('Error en prueba REAL de mensaje:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== RUTAS DE ESTADÍSTICAS =====

// Obtener estadísticas de campañas
router.get('/stats', (req, res) => {
  try {
    const WhatsAppManager = require('../services/whatsappManager');
    const stats = WhatsAppManager.getStats();
    const lastReport = WhatsAppManager.getLastCampaignReport();
    
    const campaignStats = {
      general: stats,
      lastCampaign: lastReport ? {
        successRate: lastReport.results?.summary?.successRate || 0,
        total: lastReport.results?.summary?.total || 0,
        successful: lastReport.results?.summary?.successful || 0,
        failed: lastReport.results?.summary?.failed || 0,
        skipped: lastReport.results?.summary?.skipped || 0,
        campaignPauses: lastReport.results?.summary?.campaignPauses || 0,
        sessionReplacements: lastReport.results?.summary?.sessionReplacements || 0,
        duration: lastReport.results?.summary?.duration || 0
      } : null,
      timestamp: new Date().toISOString(),
      concurrentProtection: {
        isCampaignRunning: isCampaignRunning,
        currentCampaignId: currentCampaignId,
        lastCampaignStart: new Date(lastCampaignStart).toISOString()
      },
      pauseIntelligent: campaignConfig.pauseIntelligent,
      pauseConfig: campaignConfig.pauseConfig
    };
    
    res.json({
      success: true,
      stats: campaignStats
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas de campaña:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener estadísticas de mensajes con tracking
router.get('/message-stats/:campaignId?', (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const WhatsAppManager = require('../services/whatsappManager');
    
    let stats;
    if (campaignId) {
      // Intentar obtener estadísticas específicas de la campaña
      if (typeof WhatsAppManager.getCampaignMessageStats === 'function') {
        stats = WhatsAppManager.getCampaignMessageStats(campaignId);
      } else {
        stats = {
          error: 'Función getCampaignMessageStats no disponible',
          campaignId
        };
      }
    } else {
      // Obtener estadísticas generales
      const allTracking = WhatsAppManager.messageTracking || new Map();
      stats = {
        totalTracked: allTracking.size,
        byStatus: {
          sent: 0,
          delivered: 0,
          read: 0,
          blocked: 0,
          pending: 0,
          failed: 0
        },
        campaigns: {}
      };
      
      for (const [messageId, tracking] of allTracking.entries()) {
        if (tracking.status && stats.byStatus[tracking.status]) {
          stats.byStatus[tracking.status]++;
        }
        
        // Agrupar por campaña si existe
        if (tracking.campaignId) {
          if (!stats.campaigns[tracking.campaignId]) {
            stats.campaigns[tracking.campaignId] = {
              total: 0,
              byStatus: {},
              pauses: tracking.pauses || 0
            };
          }
          stats.campaigns[tracking.campaignId].total++;
          
          if (tracking.status) {
            if (!stats.campaigns[tracking.campaignId].byStatus[tracking.status]) {
              stats.campaigns[tracking.campaignId].byStatus[tracking.status] = 0;
            }
            stats.campaigns[tracking.campaignId].byStatus[tracking.status]++;
          }
        }
      }
    }
    
    res.json({
      success: true,
      stats: stats
    });
    
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
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
      'POST   /campaign/config',
      'GET    /campaign/config',
      'POST   /campaign/start',
      'POST   /campaign/validate-pools',
      'POST   /campaign/validate-debtors',
      'GET    /campaign/pause-status',
      'POST   /campaign/pause',
      'POST   /campaign/resume',
      'POST   /campaign/replace-session',
      'GET    /campaign/available-replacements',
      'POST   /campaign/stop',
      'POST   /campaign/cancel',
      'POST   /campaign/force-release',
      'GET    /campaign/status',
      'GET    /campaign/report/last',
      'GET    /campaign/last-report',
      'GET    /campaign/report/export',
      'POST   /campaign/test',
      'GET    /campaign/stats',
      'GET    /campaign/message-stats/:campaignId?'
    ]
  });
});

module.exports = router;