const fs = require('fs');
const path = require('path');

class SessionManager {
    constructor() {
        this.sessionsFile = path.join(__dirname, '../data/whatsapp-sessions.json');
        this.sessionData = this.loadSessionData();
        this.sessionBasePaths = this.initializeSessionPaths();
    }

    // ===== CONFIGURACIÓN INICIAL =====
    initializeSessionPaths() {
        return [
            path.join(process.cwd(), 'storage', 'sessions'),
            path.join(__dirname, '..', '..', 'storage', 'sessions'),
            path.join(__dirname, '..', 'storage', 'sessions'),
            './storage/sessions',
            '../storage/sessions'
        ];
    }

    // ===== GESTIÓN DE ARCHIVOS DE SESIONES =====
    loadSessionData() {
        try {
            const dataDir = path.dirname(this.sessionsFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            if (fs.existsSync(this.sessionsFile)) {
                const data = fs.readFileSync(this.sessionsFile, 'utf8');
                const sessionData = JSON.parse(data);
                
                // Migrar de estructura antigua a nueva si es necesario
                const migratedData = this.migrateToNewStructure(sessionData);
                console.log(`📂 Cargadas ${Object.keys(migratedData.sessions || {}).length} sesiones desde archivo`);
                
                this.logSessionStates(migratedData.sessions);
                return migratedData;
            }
        } catch (error) {
            console.error('❌ Error cargando sesiones:', error);
        }
        
        console.log('📂 No se encontraron sesiones previas, iniciando con estructura nueva');
        return this.initializeNewStructure();
    }

    migrateToNewStructure(oldData) {
        // Si ya tiene la nueva estructura, retornar tal cual
        if (oldData.metadata && oldData.sessions && oldData.statistics) {
            return oldData;
        }

        // Migrar de estructura antigua (solo objeto de sesiones) a nueva
        console.log('🔄 Migrando estructura de sesiones a formato nuevo...');
        
        const sessions = {};
        let totalMessagesSent = 0;
        let totalSessionsCreated = 0;
        let totalSessionsBlocked = 0;

        Object.entries(oldData).forEach(([sessionId, session]) => {
            if (typeof session === 'object' && session.sessionId) {
                sessions[sessionId] = {
                    ...session,
                    deviceInfo: session.deviceInfo || {
                        platform: 'unknown',
                        browser: 'whatsapp-web.js',
                        version: 'unknown'
                    },
                    connectionStats: session.connectionStats || {
                        uptime: 0,
                        reconnects: 0,
                        lastError: null
                    },
                    health: session.health || {
                        status: session.status === 'connected' ? 'healthy' : 'unhealthy',
                        lastHealthCheck: session.lastUpdate || new Date().toISOString(),
                        messageRate: 0
                    }
                };

                totalMessagesSent += session.messagesSent || 0;
                totalSessionsCreated++;
                if (session.isBlocked) totalSessionsBlocked++;
            }
        });

        return {
            metadata: {
                version: "1.0",
                lastUpdated: new Date().toISOString(),
                totalSessions: Object.keys(sessions).length,
                activeSessions: Object.values(sessions).filter(s => s.status === 'connected').length,
                blockedSessions: totalSessionsBlocked
            },
            sessions: sessions,
            statistics: {
                totalMessagesSent,
                totalSessionsCreated,
                totalSessionsBlocked,
                averageUptime: 0,
                successRate: 100
            }
        };
    }

    initializeNewStructure() {
        return {
            metadata: {
                version: "1.0",
                lastUpdated: new Date().toISOString(),
                totalSessions: 0,
                activeSessions: 0,
                blockedSessions: 0
            },
            sessions: {},
            statistics: {
                totalMessagesSent: 0,
                totalSessionsCreated: 0,
                totalSessionsBlocked: 0,
                averageUptime: 0,
                successRate: 100
            }
        };
    }

    saveSessionData() {
        try {
            // Actualizar metadata antes de guardar
            this.updateMetadata();
            
            // Actualizar estadísticas antes de guardar
            this.updateStatistics();
            
            fs.writeFileSync(this.sessionsFile, JSON.stringify(this.sessionData, null, 2));
            console.log(`💾 Datos de sesión guardados: ${Object.keys(this.sessionData.sessions).length} sesiones`);
        } catch (error) {
            console.error('❌ Error guardando datos de sesión:', error);
        }
    }

    updateMetadata() {
        const sessions = Object.values(this.sessionData.sessions);
        
        this.sessionData.metadata = {
            ...this.sessionData.metadata,
            lastUpdated: new Date().toISOString(),
            totalSessions: sessions.length,
            activeSessions: sessions.filter(s => s.status === 'connected').length,
            blockedSessions: sessions.filter(s => s.isBlocked).length
        };
    }

    updateStatistics() {
        const sessions = Object.values(this.sessionData.sessions);
        const connectedSessions = sessions.filter(s => s.status === 'connected');
        
        let totalMessagesSent = 0;
        let totalUptime = 0;
        let successRate = 0;

        sessions.forEach(session => {
            totalMessagesSent += session.messagesSent || 0;
            
            if (session.lastConnection && session.connectionStats) {
                const uptime = session.connectionStats.uptime || 0;
                totalUptime += uptime;
            }
        });

        const averageUptime = connectedSessions.length > 0 ? totalUptime / connectedSessions.length : 0;

        // Calcular tasa de éxito basada en mensajes enviados vs errores
        const totalMessages = totalMessagesSent + (this.sessionData.statistics.totalMessagesFailed || 0);
        successRate = totalMessages > 0 ? (totalMessagesSent / totalMessages) * 100 : 100;

        this.sessionData.statistics = {
            totalMessagesSent,
            totalSessionsCreated: this.sessionData.statistics.totalSessionsCreated || sessions.length,
            totalSessionsBlocked: sessions.filter(s => s.isBlocked).length,
            totalMessagesFailed: this.sessionData.statistics.totalMessagesFailed || 0,
            averageUptime,
            successRate
        };
    }

    // ===== OPERACIONES CRUD DE SESIONES =====
    saveSession(sessionId, sessionData) {
        const now = new Date().toISOString();
        
        this.sessionData.sessions[sessionId] = {
            sessionId: sessionId,
            phoneNumber: sessionData.phoneNumber,
            status: sessionData.status || 'initializing',
            connectedNumber: sessionData.connectedNumber,
            messagesSent: sessionData.messagesSent || 0,
            lastConnection: sessionData.lastConnection || now,
            createdAt: sessionData.createdAt || now,
            isBlocked: sessionData.isBlocked || false,
            lastUpdate: now,
            deviceInfo: {
                platform: 'unknown',
                browser: 'whatsapp-web.js',
                version: 'unknown'
            },
            connectionStats: {
                uptime: 0,
                reconnects: 0,
                lastError: null
            },
            health: {
                status: 'initializing',
                lastHealthCheck: now,
                messageRate: 0
            }
        };

        // Incrementar contador de sesiones creadas
        this.sessionData.statistics.totalSessionsCreated++;
        
        this.saveSessionData();
        console.log(`💾 Nueva sesión guardada: ${sessionId} (${sessionData.phoneNumber})`);
        
        return this.sessionData.sessions[sessionId];
    }

    updateSession(sessionId, updates) {
        if (this.sessionData.sessions[sessionId]) {
            const now = new Date().toISOString();
            
            this.sessionData.sessions[sessionId] = {
                ...this.sessionData.sessions[sessionId],
                ...updates,
                lastUpdate: now
            };

            // Actualizar health status basado en el estado
            if (updates.status) {
                this.sessionData.sessions[sessionId].health.status = 
                    updates.status === 'connected' ? 'healthy' : 
                    updates.status === 'error' ? 'unhealthy' : 'unknown';
                
                this.sessionData.sessions[sessionId].health.lastHealthCheck = now;
            }

            // Actualizar connectionStats si hay un error
            if (updates.error) {
                this.sessionData.sessions[sessionId].connectionStats.lastError = updates.error;
                if (updates.error.includes('blocked')) {
                    this.sessionData.sessions[sessionId].isBlocked = true;
                }
            }

            // Actualizar uptime si la sesión está conectada
            if (updates.status === 'connected' && this.sessionData.sessions[sessionId].lastConnection) {
                const connectionTime = new Date(this.sessionData.sessions[sessionId].lastConnection);
                const uptime = Date.now() - connectionTime.getTime();
                this.sessionData.sessions[sessionId].connectionStats.uptime = uptime;
            }

            this.saveSessionData();
            console.log(`📝 Sesión actualizada: ${sessionId} -> ${updates.status || 'updated'}`);
            
            return this.sessionData.sessions[sessionId];
        } else {
            console.warn(`⚠️ Sesión no encontrada para actualizar: ${sessionId}`);
            return null;
        }
    }

    deleteSession(sessionId) {
        if (this.sessionData.sessions[sessionId]) {
            const sessionInfo = this.sessionData.sessions[sessionId];
            delete this.sessionData.sessions[sessionId];
            this.saveSessionData();
            
            console.log(`🗑️ Sesión eliminada: ${sessionId} (${sessionInfo.phoneNumber})`);
            return true;
        }
        
        console.warn(`⚠️ Sesión no encontrada para eliminar: ${sessionId}`);
        return false;
    }

    getSession(sessionId) {
        return this.sessionData.sessions[sessionId] || null;
    }

    getAllSessions() {
        return this.sessionData.sessions;
    }

    getConnectedSessions() {
        const connectedSessions = Object.values(this.sessionData.sessions).filter(session => 
            ['connected', 'qr_ready', 'authenticated', 'ready'].includes(session.status)
        );
        
        console.log(`🔍 Sesiones conectadas/restaurables encontradas: ${connectedSessions.length}`);
        this.logSessionStates(connectedSessions);
        
        return connectedSessions;
    }

    // ===== VERIFICACIÓN DE ARCHIVOS DE WHATSAPP =====
    sessionExistsInWhatsApp(sessionId) {
        try {
            console.log(`\n🔍 BUSCANDO SESIÓN WHATSAPP: ${sessionId}`);
            
            for (const basePath of this.sessionBasePaths) {
                const resolvedBasePath = path.resolve(basePath);
                console.log(`   Probando ruta base: ${resolvedBasePath}`);
                
                if (!fs.existsSync(resolvedBasePath)) {
                    console.log(`   ❌ Ruta base no existe: ${resolvedBasePath}`);
                    continue;
                }

                const sessionFolder = this.findSessionFolder(resolvedBasePath, sessionId);
                if (sessionFolder) {
                    return this.validateSessionFolder(sessionFolder);
                }
            }
            
            console.log(`   ❌ NO SE ENCONTRÓ la sesión en ninguna ruta posible`);
            return false;
            
        } catch (error) {
            console.error(`💥 ERROR buscando sesión ${sessionId}:`, error.message);
            return false;
        }
    }

    findSessionFolder(basePath, sessionId) {
        const folders = fs.readdirSync(basePath);
        console.log(`   📂 Carpetas encontradas:`, folders);
        
        // Buscar carpeta que comience con "session-" y contenga el sessionId
        const matchingFolder = folders.find(folder => 
            folder.startsWith('session-') && folder.includes(sessionId)
        );
        
        if (matchingFolder) {
            const sessionPath = path.join(basePath, matchingFolder);
            console.log(`   ✅ CARPETA DE SESIÓN ENCONTRADA: ${sessionPath}`);
            return sessionPath;
        }
        
        return null;
    }

    validateSessionFolder(sessionPath) {
        try {
            const files = fs.readdirSync(sessionPath);
            console.log(`   📄 Archivos en sesión:`, files);
            
            // Archivos críticos que indican una sesión válida
            const criticalFiles = files.filter(file => 
                file.includes('Default') || 
                file === 'LocalStorage' ||
                file === 'IndexedDB' ||
                file === 'Crashpad' ||
                file === 'DevToolsActivePort'
            );
            
            if (criticalFiles.length > 0) {
                console.log(`   ✅ SESIÓN VÁLIDA con ${criticalFiles.length} archivos críticos:`, criticalFiles);
                return true;
            } else {
                console.log(`   ⚠️ Carpeta vacía o sin archivos críticos`);
                return false;
            }
        } catch (error) {
            console.error(`   ❌ Error accediendo a carpeta de sesión:`, error.message);
            return false;
        }
    }

    // ===== MÉTODOS DE UTILIDAD =====
    logSessionStates(sessions) {
        if (Array.isArray(sessions)) {
            sessions.forEach(session => {
                console.log(`   📊 Sesión: ${session.phoneNumber} -> Estado: ${session.status} | Salud: ${session.health?.status}`);
            });
        } else {
            Object.values(sessions).forEach(session => {
                console.log(`   📊 Sesión: ${session.phoneNumber} -> Estado: ${session.status} | Salud: ${session.health?.status}`);
            });
        }
    }

    getSessionStats() {
        const sessions = Object.values(this.sessionData.sessions);
        const total = sessions.length;
        const connected = sessions.filter(s => s.status === 'connected').length;
        const blocked = sessions.filter(s => s.isBlocked).length;
        const withQr = sessions.filter(s => s.status === 'qr_ready').length;
        const healthy = sessions.filter(s => s.health?.status === 'healthy').length;

        return {
            total,
            connected,
            blocked,
            withQr,
            healthy,
            unhealthy: total - healthy,
            disconnected: total - connected - withQr
        };
    }

    getDetailedStats() {
        return {
            metadata: this.sessionData.metadata,
            statistics: this.sessionData.statistics,
            sessionStats: this.getSessionStats()
        };
    }

    incrementMessageCount(sessionId, success = true) {
        if (this.sessionData.sessions[sessionId]) {
            this.sessionData.sessions[sessionId].messagesSent++;
            
            // Actualizar tasa de mensajes por minuto
            const now = Date.now();
            const lastCheck = new Date(this.sessionData.sessions[sessionId].health.lastHealthCheck).getTime();
            const timeDiff = (now - lastCheck) / 60000; // minutos
            
            if (timeDiff > 1) { // Solo actualizar si ha pasado más de 1 minuto
                this.sessionData.sessions[sessionId].health.messageRate = 
                    this.sessionData.sessions[sessionId].messagesSent / timeDiff;
                this.sessionData.sessions[sessionId].health.lastHealthCheck = new Date().toISOString();
            }

            if (!success) {
                this.sessionData.statistics.totalMessagesFailed = 
                    (this.sessionData.statistics.totalMessagesFailed || 0) + 1;
            }
            
            this.saveSessionData();
        }
    }

    updateConnectionStats(sessionId, stats) {
        if (this.sessionData.sessions[sessionId]) {
            this.sessionData.sessions[sessionId].connectionStats = {
                ...this.sessionData.sessions[sessionId].connectionStats,
                ...stats
            };
            this.saveSessionData();
        }
    }

    cleanupExpiredSessions(maxAgeHours = 24) {
        const now = new Date();
        const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
        let cleanedCount = 0;

        Object.keys(this.sessionData.sessions).forEach(sessionId => {
            const session = this.sessionData.sessions[sessionId];
            const lastUpdate = new Date(session.lastUpdate || session.createdAt);
            const ageMs = now - lastUpdate;

            if (ageMs > maxAgeMs && session.status === 'disconnected') {
                console.log(`🧹 Limpiando sesión expirada: ${sessionId} (${session.phoneNumber})`);
                delete this.sessionData.sessions[sessionId];
                cleanedCount++;
            }
        });

        if (cleanedCount > 0) {
            this.saveSessionData();
            console.log(`✅ Limpiadas ${cleanedCount} sesiones expiradas`);
        }

        return cleanedCount;
    }

    // ===== BACKUP Y RECUPERACIÓN =====
    createBackup(backupPath = null) {
        try {
            const backupDir = backupPath || path.join(__dirname, '../data/backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(backupDir, `sessions-backup-${timestamp}.json`);
            
            fs.writeFileSync(backupFile, JSON.stringify(this.sessionData, null, 2));
            console.log(`💾 Backup creado: ${backupFile}`);
            
            return backupFile;
        } catch (error) {
            console.error('❌ Error creando backup:', error);
            return null;
        }
    }

    restoreFromBackup(backupFile) {
        try {
            if (!fs.existsSync(backupFile)) {
                throw new Error('Archivo de backup no encontrado');
            }

            const backupData = fs.readFileSync(backupFile, 'utf8');
            const sessionData = JSON.parse(backupData);
            
            this.sessionData = sessionData;
            this.saveSessionData();
            
            console.log(`🔄 Backup restaurado: ${Object.keys(sessionData.sessions).length} sesiones`);
            return true;
        } catch (error) {
            console.error('❌ Error restaurando backup:', error);
            return false;
        }
    }
}

module.exports = SessionManager;