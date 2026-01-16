// backend/services/CustomLocalAuth.js - VERSIÓN CONSOLIDADA OPTIMIZADA
const { LocalAuth } = require('whatsapp-web.js');
const path = require('path');

class CustomLocalAuth extends LocalAuth {
  constructor(options) {
    super(options);
    this.clientId = options.clientId;
    this.dataPath = options.dataPath || './storage/sessions';
    this.cleanupService = null;
    this.preventAutoLogout = options.preventAutoLogout !== false; // 🔥 Configurable
    
    console.log(`🔧 [CustomLocalAuth] Inicializado para: ${this.clientId}, AutoLogout: ${this.preventAutoLogout ? 'PREVENIDO' : 'PERMITIDO'}`);
  }

  // Obtener CleanupService (lazy loading)
  getCleanupService() {
    if (!this.cleanupService) {
      try {
        const CleanupService = require('./CleanupService');
        this.cleanupService = new CleanupService();
      } catch (error) {
        console.error('❌ [CustomLocalAuth] No se pudo cargar CleanupService:', error.message);
        return null;
      }
    }
    return this.cleanupService;
  }

  async logout() {
    try {
      console.log(`🔐 [CustomLocalAuth] Solicitud de logout para: ${this.clientId}`);
      
      // 🛑 DETECCIÓN DE LOGOUT AUTOMÁTICO
      if (this.preventAutoLogout) {
        const stack = new Error().stack || '';
        const isAutoLogout = stack.includes('disconnected') || 
                            stack.includes('client.destroy') ||
                            stack.includes('Client.destroy') ||
                            (stack.includes('Timeout') && stack.includes('_onTimeout'));
        
        if (isAutoLogout) {
          console.warn(`⚠️ [CustomLocalAuth] PREVENIDO logout automático para: ${this.clientId}`);
          console.debug(`   Razón detectada en stack:`, this.extractRelevantStackLine(stack));
          return; // 🚫 NO proceder con logout automático
        }
      }
      
      // ✅ LOGOUT MANUAL - Proceder
      console.log(`✅ [CustomLocalAuth] Logout manual iniciado para: ${this.clientId}`);
      await super.logout();
      console.log(`✅ [CustomLocalAuth] Logout manual exitoso para: ${this.clientId}`);
      
    } catch (error) {
      await this.handleLogoutError(error);
    }
  }

  // Manejo centralizado de errores de logout
  async handleLogoutError(error) {
    const isEBUSY = error.message.includes('EBUSY') ||
                   error.message.includes('resource busy') ||
                   error.message.includes('ENOTEMPTY') ||
                   error.message.includes('EPERM');

    if (isEBUSY) {
      console.warn(`⚠️ [CustomLocalAuth] Error EBUSY en logout para ${this.clientId}:`, error.code || error.message);
      
      const cleanupService = this.getCleanupService();
      const sessionPath = this.getSessionPath();

      if (cleanupService) {
        console.log(`🔄 [CustomLocalAuth] Delegando limpieza EBUSY a CleanupService...`);
        
        cleanupService.scheduleDelayedCleanup(
          this.clientId,
          sessionPath,
          this.clientId
        );
        
        console.log(`⏰ [CustomLocalAuth] Limpieza programada en 15s vía CleanupService`);
        return; // Error manejado, continuar sin lanzar excepción
      } else {
        console.warn(`⚠️ [CustomLocalAuth] CleanupService no disponible, usando fallback...`);
        await this.scheduleLegacyCleanup();
        return;
      }
    }

    // Para otros errores que no son críticos
    console.error(`❌ [CustomLocalAuth] Error en logout para ${this.clientId}:`, error.message);
    throw error; // Relanzar errores no manejados
  }

  // Método para forzar logout (ignora prevención automática)
  async forceLogout() {
    console.log(`💥 [CustomLocalAuth] FORZANDO logout para: ${this.clientId}`);
    const originalSetting = this.preventAutoLogout;
    
    try {
      this.preventAutoLogout = false; // Temporalmente permitir logout
      await super.logout();
      console.log(`✅ [CustomLocalAuth] Logout forzado exitoso para: ${this.clientId}`);
    } catch (error) {
      await this.handleLogoutError(error);
    } finally {
      this.preventAutoLogout = originalSetting;
    }
  }

  // Fallback si CleanupService no está disponible (de la versión original)
  async scheduleLegacyCleanup() {
    try {
      const fs = require('fs').promises;
      const sessionPath = this.getSessionPath();
      
      // Verificar que existe antes de intentar renombrar
      try {
        await fs.access(sessionPath);
      } catch {
        console.log(`📁 [CustomLocalAuth] La ruta ${sessionPath} no existe, omitiendo limpieza`);
        return;
      }
      
      const trashPath = sessionPath + '_DELETED_' + Date.now();
      
      await fs.rename(sessionPath, trashPath);
      console.log(`🔄 [CustomLocalAuth] Renombrado a: ${path.basename(trashPath)}`);

      // Eliminar después de 60s
      setTimeout(async () => {
        try {
          await fs.rm(trashPath, { recursive: true, force: true });
          console.log(`✅ [CustomLocalAuth] Directorio renombrado eliminado: ${path.basename(trashPath)}`);
        } catch (cleanupError) {
          console.warn(`⚠️ [CustomLocalAuth] Error limpiando directorio temporal:`, cleanupError.message);
        }
      }, 60000);

    } catch (error) {
      console.error(`💥 [CustomLocalAuth] Error en fallback cleanup:`, error.message);
    }
  }

  // Método para limpiar sin logout (de la versión optimizada)
  async cleanupWithoutLogout() {
    console.log(`🧹 [CustomLocalAuth] Limpieza sin logout para: ${this.clientId}`);
    
    const cleanupService = this.getCleanupService();
    const sessionPath = this.getSessionPath();
    
    if (cleanupService) {
      return await cleanupService.cleanupSession(
        this.clientId,
        sessionPath,
        this.clientId,
        { force: false }
      );
    }
    
    return { success: false, error: 'CleanupService no disponible' };
  }

  // Obtener ruta del directorio de sesión
  getSessionPath() {
    return path.join(this.dataPath, this.clientId);
  }

  // Helper para extraer línea relevante del stack trace
  extractRelevantStackLine(stack) {
    const lines = stack.split('\n');
    // Buscar la primera línea que no sea de CustomLocalAuth.js
    for (let i = 3; i < Math.min(lines.length, 6); i++) {
      if (lines[i] && !lines[i].includes('CustomLocalAuth.js')) {
        return lines[i].trim();
      }
    }
    return lines[2]?.trim() || 'Stack no disponible';
  }

  // Permite inyección manual desde WhatsAppManager
  setCleanupService(service) {
    this.cleanupService = service;
    console.log(`🔧 [CustomLocalAuth] CleanupService inyectado para: ${this.clientId}`);
  }

  destroy() {
    console.log(`🛑 [CustomLocalAuth] Destruyendo instancia para: ${this.clientId}`);
    // No establecer preventAutoLogout aquí para mantener el estado configurado
  }
}

module.exports = CustomLocalAuth;