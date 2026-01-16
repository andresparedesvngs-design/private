// backend/services/CleanupService.js
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

/**
 * Servicio de limpieza unificado
 * Combina las mejores estrategias de CustomLocalAuth.js y whatsappManager.js
 * Especializado en manejar errores EBUSY y archivos bloqueados
 */
class CleanupService {
  constructor() {
    this.ebusyRetries = new Map();
    this.cleanupQueue = new Map();
    this.activeCleanups = new Set();
    this.stats = {
      successful: 0,
      failed: 0,
      ebusyHandled: 0,
      forceKillExecuted: 0
    };
    
    console.log('🧹 CleanupService inicializado (fusión anti-EBUSY)');
  }

  /**
   * Limpieza principal que prueba múltiples estrategias
   * Basado en CustomLocalAuth.js + whatsappManager.js
   */
  async cleanupSession(sessionId, sessionPath, phoneNumber, options = {}) {
    const logPrefix = `[${phoneNumber}]`;
    
    console.log(`${logPrefix} 🧹 Iniciando limpieza unificada...`);
    console.log(`${logPrefix} 📁 Ruta: ${sessionPath}`);
    
    try {
      // 1. Verificar si existe
      try {
        await fs.access(sessionPath);
        console.log(`${logPrefix} 📂 Directorio existe`);
      } catch {
        console.log(`${logPrefix} 📂 Directorio ya fue eliminado`);
        this.stats.successful++;
        return { success: true, reason: 'already_deleted' };
      }

      // 2. Si EBUSY es solicitado explícitamente
      if (options.isEBUSY || options.force) {
        return await this.handleEBUSY(sessionPath, sessionId, phoneNumber);
      }

      // ESTRATEGIAS ORDENADAS
      const strategies = [
        this.strategyFsRmForceWithRetry,
        this.strategyKillChromeAndRetry,
        this.strategyDeleteFilesOneByOne,
        this.strategySystemCommand,
        this.strategyRenameAndSchedule
      ];

      let lastError = null;
      let successfulStrategy = null;

      for (let i = 0; i < strategies.length; i++) {
        const strategy = strategies[i];
        console.log(`${logPrefix} 🔄 Estrategia ${i + 1}/${strategies.length}: ${strategy.name}`);
        
        try {
          const result = await strategy.call(this, sessionPath, sessionId, phoneNumber);
          
          if (result.success) {
            successfulStrategy = strategy.name;
            console.log(`${logPrefix} ✅ Éxito con ${strategy.name}`);
            break;
          }
          
          lastError = result.error;
        } catch (error) {
          lastError = error;
          console.log(`${logPrefix} ❌ Error en ${strategy.name}:`, error.message);
        }
      }

      if (successfulStrategy) {
        this.stats.successful++;
        return { 
          success: true, 
          strategy: successfulStrategy,
          sessionId,
          phoneNumber 
        };
      }

      // TODAS FALLARON → limpieza diferida
      console.log(`${logPrefix} ⏰ Todas las estrategias fallaron, programando limpieza diferida`);
      this.scheduleDelayedCleanup(sessionId, sessionPath, phoneNumber);
      
      this.stats.failed++;
      return { 
        success: false, 
        error: lastError?.message || 'Todas las estrategias fallaron',
        scheduled: true 
      };

    } catch (error) {
      console.error(`${logPrefix} 💥 Error crítico en cleanupSession:`, error);
      this.stats.failed++;
      return { success: false, error: error.message };
    }
  }

  /**
   * ESTRATEGIA 1: fs.rm con force y reintentos
   */
  async strategyFsRmForceWithRetry(sessionPath) {
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   🔄 Intento ${attempt}/${maxRetries}: fs.rm con force`);
        
        await fs.rm(sessionPath, { 
          recursive: true, 
          force: true, 
          maxRetries: 3,
          retryDelay: 1000 
        });
        
        console.log(`   ✅ fs.rm exitoso en intento ${attempt}`);
        return { success: true };
      } catch (error) {
        console.log(`   ❌ Intento ${attempt} fallido:`, error.message);
        
        if (error.code === 'EBUSY') {
          const waitTime = 2000 * attempt;
          console.log(`   ⏳ Esperando ${waitTime}ms (EBUSY)...`);
          await this.delay(waitTime);
        }
        
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
  }

  /**
   * ESTRATEGIA 2: Matar Chrome y reintentar
   */
  async strategyKillChromeAndRetry(sessionPath) {
    console.log('   🦠 Estrategia: Matar Chrome y reintentar');
    
    await this.forceKillChromeProcesses();
    await this.delay(2000);
    
    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
      console.log('   ✅ Éxito después de matar Chrome');
      return { success: true };
    } catch (error) {
      console.log('   ❌ Fallo después de matar Chrome:', error.message);
      throw error;
    }
  }

  /**
   * ESTRATEGIA 3: Eliminar archivos uno por uno
   */
  async strategyDeleteFilesOneByOne(sessionPath) {
    console.log('   📄 Estrategia: Eliminar archivos individualmente');
    
    try {
      const files = await fs.readdir(sessionPath);
      console.log(`   📊 ${files.length} archivos encontrados`);
      
      let deleted = 0, failed = 0;
      
      for (const file of files) {
        const filePath = path.join(sessionPath, file);
        try {
          const stat = await fs.lstat(filePath);
          
          if (stat.isDirectory()) {
            await fs.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.unlink(filePath);
          }
          deleted++;
        } catch {
          failed++;
        }
      }
      
      await fs.rmdir(sessionPath);
      
      console.log(`   ✅ Eliminados ${deleted}, fallaron ${failed}`);
      return { success: true };
      
    } catch (error) {
      console.log('   ❌ Error eliminando archivos:', error.message);
      throw error;
    }
  }

  /**
   * ESTRATEGIA 4: Comando del sistema
   */
  async strategySystemCommand(sessionPath) {
    console.log('   💻 Estrategia: Comando del sistema');
    
    try {
      let cmd = (process.platform === 'win32')
        ? `rmdir /s /q "${sessionPath}"`
        : `rm -rf "${sessionPath}"`;
      
      await execPromise(cmd);
      console.log('   ✅ Comando ejecutado');
      return { success: true };
    } catch (error) {
      console.log('   ❌ Comando falló:', error.message);
      throw error;
    }
  }

  /**
   * ESTRATEGIA 5: Renombrar y programar limpieza diferida
   */
  async strategyRenameAndSchedule(sessionPath) {
    console.log('   🔄 Estrategia: Renombrar y limpiar después');

    try {
      const trashPath = sessionPath + '_DELETED_' + Date.now();
      await fs.rename(sessionPath, trashPath);

      console.log(`   📛 Renombrado a: ${trashPath}`);

      setTimeout(async () => {
        try {
          await fs.rm(trashPath, { recursive: true, force: true });
          console.log(`   ✅ Directorio renombrado eliminado`);
        } catch (error) {
          console.log(`   ⚠️ Error en limpieza diferida:`, error.message);
        }
      }, 60000);

      return { success: true };

    } catch (error) {
      console.log('   ❌ Error renombrando:', error.message);
      throw error;
    }
  }

  /**
   * Manejo especializado de EBUSY
   */
  async handleEBUSY(sessionPath, sessionId, phoneNumber) {
    console.log(`🔄 Manejo especializado EBUSY para ${phoneNumber}`);
    this.stats.ebusyHandled++;
    
    // Estrategias ultra agresivas
    const strategies = [
      async () => {
        await this.forceKillChromeProcesses();
        await this.delay(3000);
        return await this.strategyFsRmForceWithRetry(sessionPath);
      },
      async () => {
        if (process.platform === 'win32')
          await execPromise(`taskkill /F /IM chrome.exe /T 2>nul`);
        else
          await execPromise('pkill -9 -f chrome 2>/dev/null');

        await this.delay(2000);
        return await this.strategySystemCommand(sessionPath);
      },
      async () => {
        return await this.strategyRenameAndSchedule(sessionPath);
      }
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        const r = await strategies[i]();
        if (r.success) return r;
      } catch {}
    }

    throw new Error('No se pudo resolver EBUSY');
  }

  /**
   * Cerrar procesos Chrome
   */
  async forceKillChromeProcesses() {
    console.log('🦠 Forzando cierre de Chrome...');
    this.stats.forceKillExecuted++;

    try {
      if (process.platform === 'win32') {
        const cmds = [
          'taskkill /F /IM chrome.exe /T 2>nul',
          'taskkill /F /IM chromedriver.exe /T 2>nul'
        ];
        for (const c of cmds) await execPromise(c).catch(() => {});
      } else {
        const cmds =
          ['pkill -f chrome', 'pkill -f chromedriver'].map(c => c + ' 2>/dev/null');
        for (const c of cmds) await execPromise(c).catch(() => {});
      }

      console.log('✅ Chrome finalizado');
      return true;

    } catch {
      return false;
    }
  }

  /**
   * Programar limpieza diferida
   */
  scheduleDelayedCleanup(sessionId, sessionPath, phoneNumber) {
    const jobId = `${sessionId}-${Date.now()}`;
    
    this.cleanupQueue.set(jobId, {
      sessionId,
      sessionPath,
      phoneNumber,
      scheduledAt: new Date(),
      cleanupAt: new Date(Date.now() + 15000),
      attempts: 0
    });
    
    console.log(`⏰ Limpieza diferida programada en 15s para ${phoneNumber}`);
    
    if (!this.cleanupWorker) {
      this.startCleanupWorker();
    }
  }

  /**
   * Worker de limpiezas diferidas
   */
  startCleanupWorker() {
    this.cleanupWorker = setInterval(() => this.processCleanupQueue(), 10000);
    console.log('🧹 Worker de limpieza diferida iniciado');
  }

  async processCleanupQueue() {
    const now = Date.now();
    
    for (const [jobId, job] of this.cleanupQueue.entries()) {
      if (now >= job.cleanupAt.getTime()) {
        console.log(`🧹 Ejecutando limpieza diferida: ${job.phoneNumber}`);
        
        try {
          const result = await this.cleanupSession(
            job.sessionId,
            job.sessionPath,
            job.phoneNumber,
            { isEBUSY: true }
          );

          if (result.success) {
            this.cleanupQueue.delete(jobId);
            console.log(`✅ Limpieza diferida exitosa`);
          } else {
            job.attempts++;
            if (job.attempts < 3) {
              job.cleanupAt = new Date(Date.now() + 30000);
            } else {
              console.error(`💥 Falló después de 3 intentos`);
              this.cleanupQueue.delete(jobId);
            }
          }
        } catch (error) {
          job.attempts++;
          if (job.attempts < 3) {
            job.cleanupAt = new Date(Date.now() + 30000);
          } else {
            console.error(`💥 Error crítico, cancelando limpieza`);
            this.cleanupQueue.delete(jobId);
          }
        }
      }
    }

    if (this.cleanupQueue.size === 0 && this.cleanupWorker) {
      clearInterval(this.cleanupWorker);
      this.cleanupWorker = null;
      console.log('🛑 Worker detenido');
    }
  }

  delay(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  getStats() {
    return {
      ...this.stats,
      pendingCleanups: this.cleanupQueue.size,
      activeCleanups: this.activeCleanups.size,
      workerRunning: !!this.cleanupWorker
    };
  }

  cleanup() {
    if (this.cleanupWorker) {
      clearInterval(this.cleanupWorker);
      this.cleanupWorker = null;
    }
  }

  /* ===========================================================
     🔥 MÉTODOS NUEVOS QUE PEDISTE
     =========================================================== */

  /**
   * CustomLocalAuth → programar limpieza especial
   */
  scheduleCleanupForAuth(clientId, sessionPath, phoneNumber) {
    console.log(`[CleanupService] Programando limpieza para auth: ${clientId}`);

    this.scheduleDelayedCleanup(
      clientId,
      sessionPath,
      phoneNumber || clientId
    );

    return {
      scheduled: true,
      cleanupId: `${clientId}-${Date.now()}`,
      cleanupAt: new Date(Date.now() + 15000)
    };
  }

  /**
   * Limpieza agresiva para sesiones de autenticación
   */
  async cleanupAuthSession(sessionPath, clientId) {
    console.log(`[CleanupService] Limpieza especial para auth: ${clientId}`);

    return await this.cleanupSession(
      clientId,
      sessionPath,
      `auth-${clientId}`,
      {
        isEBUSY: true,
        force: true
      }
    );
  }
}

// Singleton
module.exports = CleanupService;
