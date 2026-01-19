class CampaignsManager {
    constructor(app) {
        this.app = app;
        this.config = {};
        this.isCampaignRunning = false;
        this.eventListenersSetup = false;
        this.initialized = false;
        this.pools = []; // Pools locales (NO persistidos en backend)
        
        // Debounce para guardar configuración
        this.debouncedSaveConfig = Debounce.debounce(() => {
            this.saveCampaignConfig();
        }, 1000);
    }

    async initialize() {
        if (this.initialized) {
            console.log('⚠️ CampaignsManager ya está inicializado, omitiendo...');
            return;
        }
        
        console.log('🚀 Inicializando CampaignsManager...');
        await this.loadCampaignConfig();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.initializePools();
        this.initialized = true;
        console.log('✅ CampaignsManager inicializado correctamente');
    }

    setupEventListeners() {
        if (this.eventListenersSetup) {
            console.log('⚠️ Event listeners ya configurados (Campaigns), omitiendo...');
            return;
        }

        console.log('🔧 Configurando event listeners de Campaigns...');
        
        // Iniciar campaña
        DOMUtils.addEventDelegate('#sendCampaign', 'click', () => {
            this.startCampaign();
        });

        // Cancelar campaña
        DOMUtils.addEventDelegate('#cancelCampaign', 'click', () => {
            this.cancelCampaign();
        });

        // Actualizar vista previa del mensaje
        DOMUtils.addEventDelegate('#messageText', 'input', Debounce.debounce(() => {
            this.updateMessagePreview();
        }, 300));

        // Insertar variables
        DOMUtils.addEventDelegate('.variable-item', 'click', (e) => {
            const variable = e.target.closest('.variable-item').querySelector('code').textContent;
            this.insertVariable(variable.replace(/[{}]/g, ''));
        });

        // Gestión de pools
        DOMUtils.addEventDelegate('#addPool', 'click', () => {
            this.addPool();
        });

        DOMUtils.addEventDelegate('#refreshPools', 'click', () => {
            this.refreshPools();
        });

        DOMUtils.addEventDelegate('#autoCreatePools', 'click', () => {
            this.autoCreatePools();
        });

        this.eventListenersSetup = true;
        console.log('✅ Event listeners configurados (Campaigns)');
    }

    setupSocketListeners() {
        this.app.socket.on('campaign_updated', (config) => this.handleCampaignUpdated(config));
        this.app.socket.on('campaign_started', (data) => this.handleCampaignStarted(data));
        this.app.socket.on('campaign_progress', (data) => this.handleCampaignProgress(data));
        this.app.socket.on('campaign_error', (data) => this.handleCampaignError(data));
        this.app.socket.on('campaign_completed', (data) => this.handleCampaignCompleted(data));
        
        // NUEVO: Escuchar eventos de seguimiento de mensajes
        this.app.socket.on('message_status_update', (data) => {
            this.app.debugLog(`📨 Estado de mensaje actualizado: ${data.status} para ${data.phoneNumber}`);
            
            // Notificar al MessageTracker
            if (window.messageTracker) {
                window.messageTracker.updateMessageState(data);
            }
        });
    }

    // REEMPLAZADO: Inicializar pools solo desde sesiones conectadas
    initializePools() {
        console.log('🔧 Inicializando pools locales...');
        this.pools = [];
        
        // Crear un pool por defecto si hay sesiones conectadas
        const connectedSessions = this.app.modules.whatsapp?.getConnectedSessions() || [];
        if (connectedSessions.length > 0) {
            this.createDefaultPool(connectedSessions);
        }
        
        this.renderPoolsUI();
        this.updatePoolsStats();
    }

    createDefaultPool(sessions) {
        this.pools = [{
            id: 'pool-default',
            name: 'Pool Principal',
            sessions: sessions,
            mode: 'competitivo',
            maxSesionesSimultaneas: Math.min(3, sessions.length),
            delayBase: 8000,
            delayVariacion: 2000,
            delayMinimo: 6000,
            delayMaximo: 10000,
            isEnabled: true
        }];
    }

    refreshPools() {
        const connectedSessions = this.app.modules.whatsapp?.getConnectedSessions() || [];
        
        console.log(`📱 Sesiones conectadas disponibles: ${connectedSessions.length}`);
        
        // Si no hay pools, crear uno por defecto
        if (this.pools.length === 0 && connectedSessions.length > 0) {
            this.autoCreatePools();
        }
        
        this.renderPoolsUI();
        this.updatePoolsStats();
    }

    autoCreatePools() {
        const connectedSessions = this.app.modules.whatsapp?.getConnectedSessions() || [];
        
        if (connectedSessions.length === 0) {
            this.app.showNotification('❌ No hay sesiones conectadas para crear pools', 'warning');
            return;
        }

        this.pools = [];

        const strategy = DOMUtils.getSafeSelectValue('autoPoolStrategy', 'balanced');
        
        switch(strategy) {
            case 'single':
                // Un solo pool con todas las sesiones en modo competitivo
                this.pools.push({
                    id: 'pool-1',
                    name: 'Pool Principal',
                    sessions: [...connectedSessions],
                    mode: 'competitivo',
                    maxSesionesSimultaneas: Math.min(3, connectedSessions.length),
                    delayBase: 8000,
                    delayVariacion: 2000,
                    delayMinimo: 6000,
                    delayMaximo: 10000,
                    isEnabled: true
                });
                break;
                
            case 'balanced':
                // Múltiples pools balanceados
                const sessionsPerPool = DOMUtils.getSafeNumberValue('sessionsPerPool', 2);
                const poolCount = Math.ceil(connectedSessions.length / sessionsPerPool);
                
                for (let i = 0; i < poolCount; i++) {
                    const startIdx = i * sessionsPerPool;
                    const endIdx = startIdx + sessionsPerPool;
                    const poolSessions = connectedSessions.slice(startIdx, endIdx);
                    
                    this.pools.push({
                        id: `pool-${i + 1}`,
                        name: `Pool ${i + 1}`,
                        sessions: poolSessions,
                        mode: i === 0 ? 'competitivo' : 'turnos_fijos',
                        maxSesionesSimultaneas: Math.min(2, poolSessions.length),
                        delayBase: 8000,
                        delayVariacion: 2000,
                        delayMinimo: 6000,
                        delayMaximo: 10000,
                        isEnabled: true
                    });
                }
                break;
                
            case 'custom':
                // Pools personalizados basados en reglas
                this.createCustomPools(connectedSessions);
                break;
        }

        this.app.showNotification(`✅ Creados ${this.pools.length} pools automáticamente`, 'success');
        this.renderPoolsUI();
        this.updatePoolsStats();
    }

    createCustomPools(sessions) {
        // Agrupar por patrones en los números (últimos dígitos, etc.)
        const groups = {};
        
        sessions.forEach(session => {
            const lastTwoDigits = session.phoneNumber.slice(-2);
            if (!groups[lastTwoDigits]) {
                groups[lastTwoDigits] = [];
            }
            groups[lastTwoDigits].push(session);
        });

        let poolIndex = 1;
        for (const [key, groupSessions] of Object.entries(groups)) {
            this.pools.push({
                id: `pool-${poolIndex}`,
                name: `Pool ${String.fromCharCode(64 + poolIndex)}`,
                sessions: groupSessions,
                mode: poolIndex === 1 ? 'competitivo' : 'turnos_aleatorios',
                maxSesionesSimultaneas: Math.min(2, groupSessions.length),
                delayBase: 8000,
                delayVariacion: 2000,
                delayMinimo: 6000,
                delayMaximo: 10000,
                isEnabled: true
            });
            poolIndex++;
        }
    }

    // REEMPLAZADO: Solo actualizan memoria local
    addPool() {
        const poolName = DOMUtils.getSafeValue('newPoolName') || `Pool ${this.pools.length + 1}`;
        const poolMode = DOMUtils.getSafeSelectValue('newPoolMode', 'turnos_fijos');

        const newPool = {
            id: `pool-${Date.now()}`,
            name: poolName,
            sessions: [],
            mode: poolMode,
            delayBase: 8000,
            delayVariacion: 2000,
            delayMinimo: 6000,
            delayMaximo: 10000,
            maxSesionesSimultaneas: 1, // Por defecto para modo competitivo
            isEnabled: true
        };

        this.pools.push(newPool);
        
        // Limpiar formulario
        DOMUtils.setSafeValue('newPoolName', '');
        
        this.app.showNotification(`✅ Pool "${poolName}" creado`, 'success');
        this.renderPoolsUI();
        this.updatePoolsStats();
    }

    removePool(poolId) {
        this.pools = this.pools.filter(pool => pool.id !== poolId);
        this.app.showNotification('🗑️ Pool eliminado', 'info');
        this.renderPoolsUI();
        this.updatePoolsStats();
    }

    togglePool(poolId) {
        const pool = this.pools.find(p => p.id === poolId);
        if (pool) {
            pool.isEnabled = !pool.isEnabled;
            this.renderPoolsUI();
            this.updatePoolsStats();
        }
    }

    addSessionToPool(poolId, session) {
        const pool = this.pools.find(p => p.id === poolId);
        if (pool && !pool.sessions.find(s => s.sessionId === session.sessionId)) {
            pool.sessions.push(session);
            this.renderPoolsUI();
            this.updatePoolsStats();
        }
    }

    removeSessionFromPool(poolId, sessionId) {
        const pool = this.pools.find(p => p.id === poolId);
        if (pool) {
            pool.sessions = pool.sessions.filter(s => s.sessionId !== sessionId);
            this.renderPoolsUI();
            this.updatePoolsStats();
        }
    }

    updatePoolConfig(poolId, field, value) {
        const pool = this.pools.find(p => p.id === poolId);
        if (pool) {
            pool[field] = value;
            
            // Actualizar automáticamente maxSesionesSimultaneas para modo competitivo
            if (field === 'mode' && value === 'competitivo' && !pool.maxSesionesSimultaneas) {
                pool.maxSesionesSimultaneas = pool.sessions.length;
            }
            
            this.updatePoolsStats();
            this.renderPoolsUI(); // Re-renderizar para mostrar/ocultar controles
        }
    }

    renderPoolsUI() {
        const container = document.getElementById('poolsContainer');
        if (!container) return;

        const connectedSessions = this.app.modules.whatsapp?.getConnectedSessions() || [];
        const availableSessions = [...connectedSessions];
        
        // Remover sesiones ya asignadas a pools
        this.pools.forEach(pool => {
            pool.sessions.forEach(session => {
                const index = availableSessions.findIndex(s => s.sessionId === session.sessionId);
                if (index > -1) {
                    availableSessions.splice(index, 1);
                }
            });
        });

        container.innerHTML = `
            <div class="pools-management">
                <div class="pools-header">
                    <h3>🔢 Gestión de Pools de Envío</h3>
                    <div class="pools-actions">
                        <button id="refreshPools" class="btn btn-outline btn-sm">🔄 Actualizar</button>
                        <button id="autoCreatePools" class="btn btn-info btn-sm">🤖 Crear Automático</button>
                    </div>
                </div>

                <!-- Configuración de creación automática -->
                <div class="auto-pool-config">
                    <h4>Configuración Automática</h4>
                    <div class="config-grid">
                        <div class="config-group">
                            <label for="autoPoolStrategy">Estrategia</label>
                            <select id="autoPoolStrategy">
                                <option value="single">Pool Único</option>
                                <option value="balanced" selected>Balanceado</option>
                                <option value="custom">Personalizado</option>
                            </select>
                        </div>
                        <div class="config-group">
                            <label for="sessionsPerPool">Sesiones por Pool</label>
                            <input type="number" id="sessionsPerPool" value="2" min="1" max="10">
                        </div>
                    </div>
                </div>

                <!-- Crear nuevo pool -->
                <div class="new-pool-form">
                    <h4>➕ Crear Nuevo Pool</h4>
                    <div class="form-grid">
                        <div class="form-group">
                            <input type="text" id="newPoolName" placeholder="Nombre del pool">
                        </div>
                        <div class="form-group">
                            <select id="newPoolMode">
                                <option value="turnos_fijos">🎯 Turnos Fijos</option>
                                <option value="turnos_aleatorios">🎲 Turnos Aleatorios</option>
                                <option value="competitivo">⚡ Competitivo</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <input type="number" id="newPoolMaxConcurrent" value="2" min="1" max="10" placeholder="Máx concurrentes">
                        </div>
                        <div class="form-group">
                            <button id="addPool" class="btn btn-success">Crear Pool</button>
                        </div>
                    </div>
                </div>

                <!-- Lista de pools -->
                <div class="pools-list">
                    ${this.pools.map(pool => this.renderPoolCard(pool, availableSessions)).join('')}
                </div>

                <!-- Sesiones disponibles -->
                ${availableSessions.length > 0 ? `
                <div class="available-sessions">
                    <h4>📱 Sesiones Disponibles</h4>
                    <div class="sessions-grid">
                        ${availableSessions.map(session => `
                            <div class="available-session">
                                <span>${session.phoneNumber}</span>
                                <div class="session-actions">
                                    ${this.pools.map(pool => `
                                        <button class="btn-sm" onclick="app.modules.campaigns.addSessionToPool('${pool.id}', ${JSON.stringify(session).replace(/'/g, "\\'")})">
                                            ➕ ${pool.name}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }

    renderPoolCard(pool, availableSessions) {
        const sessionCount = pool.sessions.length;
        const isActive = pool.isEnabled && sessionCount > 0;
        
        // Configuración por defecto para nuevos pools
        const delayBase = pool.delayBase || 8000;
        const delayVariacion = pool.delayVariacion || 2000;
        const delayMinimo = pool.delayMinimo || 6000;
        const delayMaximo = pool.delayMaximo || 10000;
        const maxSesionesSimultaneas = pool.maxSesionesSimultaneas || pool.sessions.length;
        
        return `
            <div class="pool-card ${isActive ? 'pool-active' : 'pool-inactive'}">
                <div class="pool-header">
                    <div class="pool-info">
                        <h4>${pool.name}</h4>
                        <span class="pool-badge pool-mode-${pool.mode}">${this.getModeDisplayName(pool.mode)}</span>
                    </div>
                    <div class="pool-actions">
                        <label class="toggle-switch">
                            <input type="checkbox" ${pool.isEnabled ? 'checked' : ''} 
                                   onchange="app.modules.campaigns.togglePool('${pool.id}')">
                            <span class="slider"></span>
                        </label>
                        <button class="btn-delete" onclick="app.modules.campaigns.removePool('${pool.id}')">🗑️</button>
                    </div>
                </div>

                <div class="pool-config">
                    <div class="config-row">
                        <div class="config-group">
                            <label>Modo de Operación</label>
                            <select onchange="app.modules.campaigns.updatePoolConfig('${pool.id}', 'mode', this.value)" 
                                    value="${pool.mode}">
                                <option value="turnos_fijos" ${pool.mode === 'turnos_fijos' ? 'selected' : ''}>🎯 Turnos Fijos</option>
                                <option value="turnos_aleatorios" ${pool.mode === 'turnos_aleatorios' ? 'selected' : ''}>🎲 Turnos Aleatorios</option>
                                <option value="competitivo" ${pool.mode === 'competitivo' ? 'selected' : ''}>⚡ Competitivo</option>
                            </select>
                        </div>
                        
                        ${pool.mode === 'competitivo' ? `
                        <div class="config-group">
                            <label>Máx Sesiones Simultáneas</label>
                            <input type="number" value="${maxSesionesSimultaneas}" min="1" max="10"
                                   onchange="app.modules.campaigns.updatePoolConfig('${pool.id}', 'maxSesionesSimultaneas', parseInt(this.value))">
                        </div>
                        ` : ''}
                    </div>

                    <!-- CONFIGURACIÓN DE DELAYS HÍBRIDOS -->
                    <div class="delay-config-section">
                        <h5>⏰ Configuración de Delays Híbridos</h5>
                        <div class="delay-config-grid">
                            <div class="delay-config-group">
                                <label>Delay Base (ms)</label>
                                <input type="number" value="${delayBase}" min="1000" max="30000" step="1000"
                                       onchange="app.modules.campaigns.updatePoolConfig('${pool.id}', 'delayBase', parseInt(this.value))">
                                <small>${delayBase/1000}s base</small>
                            </div>
                            
                            <div class="delay-config-group">
                                <label>Variación (±ms)</label>
                                <input type="number" value="${delayVariacion}" min="0" max="10000" step="500"
                                       onchange="app.modules.campaigns.updatePoolConfig('${pool.id}', 'delayVariacion', parseInt(this.value))">
                                <small>±${delayVariacion/1000}s aleatorio</small>
                            </div>
                            
                            <div class="delay-config-group">
                                <label>Mínimo (ms)</label>
                                <input type="number" value="${delayMinimo}" min="1000" max="30000" step="1000"
                                       onchange="app.modules.campaigns.updatePoolConfig('${pool.id}', 'delayMinimo', parseInt(this.value))">
                                <small>${delayMinimo/1000}s mínimo</small>
                            </div>
                            
                            <div class="delay-config-group">
                                <label>Máximo (ms)</label>
                                <input type="number" value="${delayMaximo}" min="1000" max="30000" step="1000"
                                       onchange="app.modules.campaigns.updatePoolConfig('${pool.id}', 'delayMaximo', parseInt(this.value))">
                                <small>${delayMaximo/1000}s máximo</small>
                            </div>
                        </div>
                        
                        <div class="delay-preview">
                            <small>Delays entre: ${delayMinimo/1000}s - ${delayMaximo/1000}s (${delayBase/1000}s ± ${delayVariacion/1000}s)</small>
                        </div>
                    </div>
                </div>

                <div class="pool-sessions">
                    <h5>Sesiones en este Pool (${sessionCount})</h5>
                    ${sessionCount > 0 ? `
                        <div class="sessions-list">
                            ${pool.sessions.map(session => `
                                <div class="pool-session">
                                    <span>${session.phoneNumber}</span>
                                    <button class="btn-remove" 
                                            onclick="app.modules.campaigns.removeSessionFromPool('${pool.id}', '${session.sessionId}')">
                                        ❌
                                    </button>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="empty-sessions">
                            <p>No hay sesiones en este pool</p>
                            ${availableSessions.length > 0 ? `
                                <div class="add-session-options">
                                    ${availableSessions.slice(0, 3).map(session => `
                                        <button class="btn-sm" 
                                                onclick="app.modules.campaigns.addSessionToPool('${pool.id}', ${JSON.stringify(session).replace(/'/g, "\\'")})">
                                            ➕ ${session.phoneNumber}
                                        </button>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `}
                </div>

                <div class="pool-stats">
                    <div class="stat">
                        <span class="stat-label">Estado:</span>
                        <span class="stat-value ${isActive ? 'stat-active' : 'stat-inactive'}">
                            ${isActive ? '✅ Activo' : '❌ Inactivo'}
                        </span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Modo:</span>
                        <span class="stat-value">${this.getModeDisplayName(pool.mode)}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Delay:</span>
                        <span class="stat-value">${delayBase/1000}s ± ${delayVariacion/1000}s</span>
                    </div>
                </div>
            </div>
        `;
    }

    getModeDisplayName(mode) {
        const modes = {
            'turnos_fijos': '🎯 Turnos Fijos',
            'turnos_aleatorios': '🎲 Turnos Aleatorios', 
            'competitivo': '⚡ Competitivo'
        };
        return modes[mode] || mode;
    }

    updatePoolsStats() {
        const totalSessions = this.pools.reduce((sum, pool) => sum + pool.sessions.length, 0);
        const activePools = this.pools.filter(pool => pool.isEnabled && pool.sessions.length > 0).length;
        const totalCapacity = this.pools.reduce((sum, pool) => sum + (pool.isEnabled ? (pool.maxSesionesSimultaneas || pool.sessions.length) : 0), 0);

        DOMUtils.setSafeTextContent('poolsStats', `
            ${activePools} pools activos | 
            ${totalSessions} sesiones | 
            Capacidad: ${totalCapacity} mensajes simultáneos
        `);

        // Actualizar también el contador en los controles de campaña
        DOMUtils.setSafeTextContent('campaignPoolsCount', `${activePools} pools activos`);
    }

    getActivePools() {
        return this.pools.filter(pool => pool.isEnabled && pool.sessions.length > 0);
    }

    // REEMPLAZADO: Ahora solo carga el mensaje
    async loadCampaignConfig() {
        try {
            const response = await fetch(this.app.buildApiUrl('CAMPAIGN_CONFIG'));
            const data = await response.json();
            
            if (data.success) {
                this.config = data.config;
                // Solo cargar el mensaje si existe
                if (this.config.message) {
                    DOMUtils.setSafeValue('messageText', this.config.message);
                    this.updateMessagePreview();
                }
            }
        } catch (error) {
            console.warn('⚠️ No se pudo cargar configuración de campaña:', error);
            this.config = { message: '' };
        }
    }

    // ACTUALIZADO: Solo actualiza el mensaje
    updateCampaignUI() {
        // Mensaje
        if (this.config.message) {
            DOMUtils.setSafeValue('messageText', this.config.message);
            this.updateMessagePreview();
        }

        // Actualizar contadores
        this.updateDebtorsCount();
        this.updatePoolsStats();
    }

    updateDebtorsCount() {
        const debtorsToUse = this.app.modules.debtors?.getCurrentDebtors() || [];
        DOMUtils.setSafeTextContent('campaignDebtorsCount', `${debtorsToUse.length} deudores seleccionados`);
    }

    // ACTUALIZADO: Guardar solo el mensaje
    async saveCampaignConfig() {
        const config = this.getCampaignConfig();

        try {
            const response = await fetch(this.app.buildApiUrl('CAMPAIGN_CONFIG'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.debugLog('✅ Configuración guardada');
            } else {
                this.app.showNotification('❌ Error guardando configuración: ' + data.error, 'error');
            }
        } catch (error) {
            this.app.handleError(error, 'guardando configuración');
        }
    }

    // ACTUALIZADO: Solo devuelve el mensaje
    getCampaignConfig() {
        return {
            message: DOMUtils.getSafeValue('messageText') || ''
        };
    }

    // NUEVO: Validar pools antes de enviar
    async validatePools() {
        const activePools = this.getActivePools();
        
        if (activePools.length === 0) {
            return { valid: false, error: 'No hay pools activos con sesiones' };
        }

        try {
            const response = await fetch(this.app.buildApiUrl('CAMPAIGN_VALIDATE_POOLS'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pools: activePools.map(pool => ({
                        name: pool.name,
                        sessions: pool.sessions.map(s => s.phoneNumber),
                        mode: pool.mode,
                        maxSesionesSimultaneas: pool.maxSesionesSimultaneas || pool.sessions.length
                    }))
                })
            });
            
            const data = await response.json();
            return data;
        } catch (error) {
            return { valid: false, error: 'Error validando pools: ' + error.message };
        }
    }

    // ============ MÉTODO startCampaign COMPLETAMENTE ACTUALIZADO ============
    async startCampaign() {
        this.app.debugLog('🔄 Iniciando campaña...');
        
        const message = DOMUtils.getSafeValue('messageText').trim();
        const debtorsToUse = this.app.modules.debtors?.getCurrentDebtors() || [];

        // Validación mejorada
        if (!this.validateCampaignStart(message, debtorsToUse)) {
            return;
        }

        try {
            const config = this.getCampaignConfig();
            const activePools = this.getActivePools();
            
            // FORMATO EXACTO QUE ESPERA EL BACKEND
            const requestData = {
                message: message,
                config: config,
                debtors: debtorsToUse.map(debtor => ({
                    nombre: debtor.nombre,
                    telefono: debtor.telefono,
                    deuda: debtor.deuda,
                    capital: debtor.capital,
                    vencimiento: debtor.vencimiento,
                    rut: debtor.rut,
                    nombre_ejecutivo: debtor.nombre_ejecutivo,
                    numero_ejecutivo: debtor.numero_ejecutivo,
                    titulo: debtor.titulo,
                    estado: debtor.estado
                })),
                debtorsCount: debtorsToUse.length,
                pools: activePools.map(pool => ({
                    name: pool.name,
                    sessions: pool.sessions.map(s => s.phoneNumber), // Solo el número como string
                    mode: pool.mode,
                    delayBase: pool.delayBase || 8000,
                    delayVariacion: pool.delayVariacion || 2000,
                    delayMinimo: pool.delayMinimo || 6000,
                    delayMaximo: pool.delayMaximo || 10000,
                    maxSesionesSimultaneas: pool.maxSesionesSimultaneas || pool.sessions.length
                })),
                viewType: this.app.modules.debtors?.currentView || 'all'
            };

            this.app.debugLog('📤 Datos de campaña (formato backend):', JSON.stringify(requestData, null, 2));
            
            this.setCampaignUIState('starting');
            this.app.showNotification(`🔄 Iniciando campaña para ${debtorsToUse.length} deudores...`, 'info');

            // NUEVO: Notificar al MessageTracker que la campaña está comenzando
            if (window.messageTracker) {
                window.messageTracker.resetStats();
                window.messageTracker.showCampaignPanel();
            }

            // URL CORRECTA según tu backend
            const response = await fetch('http://localhost:3000/api/campaign/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.showNotification('🎯 Campaña iniciada correctamente', 'success');
                this.setCampaignUIState('progress', { processed: 0, total: debtorsToUse.length });
            } else {
                this.handleCampaignStartError(data.error || 'Error desconocido');
            }
        } catch (error) {
            this.handleCampaignConnectionError(error);
        }
    }

    // ============ VALIDACIÓN MEJORADA ============
    validateCampaignStart(message, debtorsToUse) {
        if (!message || message.trim().length === 0) {
            this.app.showNotification('❌ Escribe un mensaje antes de iniciar la campaña', 'warning');
            return false;
        }

        if (debtorsToUse.length === 0) {
            this.app.showNotification('❌ No hay deudores para enviar mensajes', 'warning');
            return false;
        }

        const activePools = this.getActivePools();
        if (activePools.length === 0) {
            this.app.showNotification('❌ Necesitas al menos un pool activo con sesiones', 'warning');
            return false;
        }

        // Verificar que cada pool tenga sesiones con números válidos
        for (const pool of activePools) {
            if (!pool.sessions || pool.sessions.length === 0) {
                this.app.showNotification(`❌ El pool "${pool.name}" no tiene sesiones asignadas`, 'error');
                return false;
            }
            
            // Verificar que las sesiones tengan números de teléfono
            const invalidSessions = pool.sessions.filter(s => !s.phoneNumber);
            if (invalidSessions.length > 0) {
                this.app.showNotification(`❌ El pool "${pool.name}" tiene sesiones sin número de teléfono`, 'error');
                return false;
            }
        }

        return true;
    }

    async cancelCampaign() {
        if (!confirm('¿Estás seguro de que quieres cancelar la campaña en curso?')) {
            return;
        }

        try {
            const response = await fetch(this.app.buildApiUrl('CAMPAIGN_CANCEL'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.showNotification('⏹️ Campaña cancelada', 'info');
                this.setCampaignUIState('completed');
            } else {
                this.app.showNotification('❌ Error cancelando campaña: ' + data.error, 'error');
            }
        } catch (error) {
            this.app.handleError(error, 'cancelando campaña');
        }
    }

    setCampaignUIState(state, data = {}) {
        const sendButton = document.getElementById('sendCampaign');
        const cancelButton = document.getElementById('cancelCampaign');
        
        if (!sendButton) return;

        switch (state) {
            case 'starting':
                sendButton.textContent = '⏳ Iniciando...';
                sendButton.disabled = true;
                if (cancelButton) cancelButton.style.display = 'inline-block';
                this.isCampaignRunning = true;
                break;
                
            case 'progress':
                sendButton.textContent = `📤 Enviando... ${data.processed || 0}/${data.total || 0}`;
                sendButton.disabled = true;
                if (cancelButton) cancelButton.style.display = 'inline-block';
                this.isCampaignRunning = true;
                break;
                
            case 'completed':
                sendButton.textContent = '🚀 Iniciar Campaña con Pools';
                sendButton.disabled = false;
                if (cancelButton) cancelButton.style.display = 'none';
                this.isCampaignRunning = false;
                this.hideCampaignProgress();
                break;
                
            case 'error':
                sendButton.textContent = '🚀 Iniciar Campaña con Pools';
                sendButton.disabled = false;
                if (cancelButton) cancelButton.style.display = 'none';
                this.isCampaignRunning = false;
                this.hideCampaignProgress();
                break;
        }
    }

    updateMessagePreview() {
        const text = DOMUtils.getSafeValue('messageText');
        const preview = document.getElementById('messagePreview');
        
        if (!preview) return;

        const sampleData = {
            nombre: 'Juan Pérez',
            telefono: '+1234567890',
            deuda: '$1,250.00',
            capital: '$1,000.00',
            estado: 'Pendiente',
            vencimiento: '15/12/2024',
            rut: '12.345.678-9',
            ejecutivo: 'Ana López',
            titulo: 'PREST-001-2024'
        };
        
        let previewText = text;
        for (const [key, value] of Object.entries(sampleData)) {
            previewText = previewText.replace(new RegExp(`{{${key}}}`, 'gi'), value);
        }
        
        preview.innerHTML = previewText || '<em>El mensaje aparecerá aquí...</em>';
    }

    insertVariable(variableName) {
        const textarea = document.getElementById('messageText');
        if (!textarea) return;

        const variable = `{{${variableName}}}`;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        
        textarea.value = textarea.value.substring(0, start) + variable + textarea.value.substring(end);
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
        
        // Disparar evento input para actualizar la vista previa
        textarea.dispatchEvent(new Event('input'));
    }

    // ============ MÉTODO DE DIAGNÓSTICO ============
    async testBackendConnection() {
        console.log('🔍 Probando conexión con endpoints de campaña...');
        
        try {
            // 1. Probar /api/campaign/config
            const configResponse = await fetch('http://localhost:3000/api/campaign/config');
            const configData = await configResponse.json();
            console.log('✅ /api/campaign/config:', configData);
            
            // 2. Probar con datos mínimos
            const testData = {
                message: "Mensaje de prueba del frontend",
                config: {},
                debtors: [{
                    nombre: "Test Frontend",
                    telefono: "56912345678",
                    deuda: 100000,
                    capital: 80000,
                    vencimiento: "2024-12-31",
                    rut: "12.345.678-9",
                    nombre_ejecutivo: "Ejecutivo Test",
                    numero_ejecutivo: "56987654321",
                    titulo: "TEST-001",
                    estado: "pendiente"
                }],
                debtorsCount: 1,
                pools: [{
                    name: "Pool Test",
                    sessions: ["56997881650"], // Usa un número real de tus sesiones
                    mode: "turnos_fijos",
                    delayBase: 8000,
                    delayVariacion: 2000,
                    delayMinimo: 6000,
                    delayMaximo: 10000,
                    maxSesionesSimultaneas: 1
                }],
                viewType: "all"
            };
            
            console.log('📤 Enviando datos de prueba:', testData);
            
            const startResponse = await fetch('http://localhost:3000/api/campaign/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testData)
            });
            
            const startData = await startResponse.json();
            console.log('✅ /api/campaign/start response:', startData);
            
            if (startData.success) {
                this.app.showNotification('✅ Backend responde correctamente', 'success');
            } else {
                this.app.showNotification(`❌ Error backend: ${startData.error}`, 'error');
            }
            
        } catch (error) {
            console.error('❌ Error de conexión:', error);
            this.app.showNotification(`❌ Error de conexión: ${error.message}`, 'error');
        }
    }

    // ============ MANEJO DE SOCKETS ============

    handleCampaignUpdated(config) {
        this.config = config;
        this.updateCampaignUI();
    }

    handleCampaignStarted(data) {
        this.app.showNotification('🎯 Campaña iniciada correctamente', 'success');
        this.app.debugLog('✅ Campaña iniciada via socket');
        
        // NUEVO: Notificar al MessageTracker
        if (window.messageTracker) {
            window.messageTracker.resetStats();
            window.messageTracker.showCampaignPanel();
        }
    }

    handleCampaignProgress(data) {
        this.app.debugLog(`📊 Progreso de campaña: ${data.processed}/${data.total} mensajes`);
        this.setCampaignUIState('progress', data);
        this.updateCampaignProgress(data);
        
        // NUEVO: Actualizar barra de progreso en MessageTracker
        if (window.messageTracker) {
            window.messageTracker.updateProgressBar({
                progress: data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0,
                sent: data.processed,
                successful: data.successful || 0,
                failed: data.failed || 0,
                skipped: data.skipped || 0
            });
        }
    }

    handleCampaignError(data) {
        this.app.debugLog(`❌ Error en campaña: ${data.error}`);
        this.app.showNotification(`❌ Error en campaña: ${data.error}`, 'error');
        this.setCampaignUIState('error');
    }

    handleCampaignCompleted(data) {
        this.app.debugLog(`✅ Campaña completada: ${data.sent} mensajes enviados de ${data.total}`);
        this.app.showNotification(`✅ Campaña completada: ${data.sent} mensajes enviados de ${data.total}`, 'success');
        
        // NUEVO: Mostrar reporte final en MessageTracker
        if (window.messageTracker) {
            window.messageTracker.showFinalReport({
                ...data,
                campaignStats: window.messageTracker.campaignStats
            });
        }
        
        if (data.failed > 0 && data.detailedReport) {
            setTimeout(() => {
                this.showCampaignReport(data.detailedReport);
            }, 1000);
        }
        
        this.setCampaignUIState('completed');
        
        // Recargar sesiones para actualizar estadísticas
        if (this.app.modules.whatsapp) {
            this.app.modules.whatsapp.loadSessions();
        }
    }

    updateCampaignProgress(data) {
        let progressElement = document.getElementById('campaignProgress');
        
        if (!progressElement) {
            progressElement = document.createElement('div');
            progressElement.id = 'campaignProgress';
            progressElement.className = 'campaign-progress-overlay';
            document.body.appendChild(progressElement);
        }
        
        const progress = data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;
        
        progressElement.innerHTML = `
            <div class="campaign-progress-overlay">
                <div class="progress-header">📊 Progreso de Campaña</div>
                <div class="progress-stats">Procesados: ${data.processed}/${data.total}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${progress}%"></div>
                </div>
                <div class="progress-footer">${progress}% completado${data.activeSessions ? ` • ${data.activeSessions} sesiones activas` : ''}</div>
                <button class="progress-close" onclick="app.modules.campaigns.hideCampaignProgress()">×</button>
            </div>
        `;
        
        if (data.processed >= data.total) {
            setTimeout(() => this.hideCampaignProgress(), 5000);
        }
    }

    hideCampaignProgress() {
        const progressElement = document.getElementById('campaignProgress');
        if (progressElement && progressElement.parentNode) {
            progressElement.parentNode.removeChild(progressElement);
        }
    }

    showCampaignReport(report) {
        console.log('📋 Reporte de campaña:', report);
    }

    // ============ MÉTODOS DE UI ============

    renderUI() {
        const section = document.getElementById('campaignsSection');
        if (!section) return;

        section.innerHTML = `
            <section class="campaigns-section card">
                <div class="section-header">
                    <h2>⚙️ Configuración de Campañas</h2>
                    <span class="section-badge">Sistema de envío masivo con Pools</span>
                </div>

                <div class="campaigns-content">
                    <!-- Editor de Mensaje - MOVIDO ARRIBA -->
                    <div class="message-section">
                        <h3>✍️ Composición de Mensaje</h3>
                        
                        <div class="variables-panel">
                            <h4>📋 Variables Disponibles</h4>
                            <div class="variables-grid">
                                <div class="variable-group">
                                    <h5>👤 Información Personal</h5>
                                    <div class="variable-item">
                                        <code>{{nombre}}</code>
                                        <span>Nombre del deudor</span>
                                    </div>
                                    <div class="variable-item">
                                        <code>{{telefono}}</code>
                                        <span>Teléfono</span>
                                    </div>
                                    <div class="variable-item">
                                        <code>{{rut}}</code>
                                        <span>RUT del deudor</span>
                                    </div>
                                </div>
                                
                                <div class="variable-group">
                                    <h5>💰 Información de Deuda</h5>
                                    <div class="variable-item">
                                        <code>{{deuda}}</code>
                                        <span>Monto total de la deuda</span>
                                    </div>
                                    <div class="variable-item">
                                        <code>{{capital}}</code>
                                        <span>Capital adeudado</span>
                                    </div>
                                    <div class="variable-item">
                                        <code>{{vencimiento}}</code>
                                        <span>Fecha de vencimiento</span>
                                    </div>
                                    <div class="variable-item">
                                        <code>{{estado}}</code>
                                        <span>Estado del pago</span>
                                    </div>
                                </div>
                                
                                <div class="variable-group">
                                    <h5>👨‍💼 Información del Ejecutivo</h5>
                                    <div class="variable-item">
                                        <code>{{ejecutivo}}</code>
                                        <span>Nombre del ejecutivo</span>
                                    </div>
                                    <div class="variable-item">
                                        <code>{{numero_ejecutivo}}</code>
                                        <span>Teléfono del ejecutivo</span>
                                    </div>
                                    <div class="variable-item">
                                        <code>{{titulo}}</code>
                                        <span>Título/ID del préstamo</span>
                                    </div>
                                </div>
                            </div>
                            <div class="variables-note">
                                <strong>💡 Nota:</strong> Haz clic en cualquier variable para insertarla en el mensaje
                            </div>
                        </div>

                        <div class="message-editor">
                            <label for="messageText" class="editor-label">Tu mensaje:</label>
                            <textarea 
                                id="messageText" 
                                placeholder="Escribe tu mensaje aquí... Puedes usar las variables mostradas arriba rodeadas por dobles llaves {{}}"
                                rows="6"
                            ></textarea>
                            <small>Usa las variables haciendo clic en ellas arriba</small>
                            
                            <div class="message-preview">
                                <h4>👁️ Vista Previa:</h4>
                                <div id="messagePreview" class="preview-content">
                                    <em>El mensaje aparecerá aquí...</em>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Controles de Campaña -->
                        <div class="campaign-controls">
                            <button id="sendCampaign" class="btn btn-primary btn-large">
                                🚀 Iniciar Campaña con Pools
                            </button>
                            <button onclick="app.modules.campaigns.testBackendConnection()" class="btn btn-info">
                                🔧 Probar Conexión Backend
                            </button>
                            <!-- NUEVO: Botón de validación -->
                            <button onclick="validateAndStartCampaign()" class="btn btn-warning">
                                🔍 Validar y Iniciar
                            </button>
                            <button id="cancelCampaign" class="btn btn-warning" style="display: none;">
                                ⏹️ Cancelar Campaña
                            </button>
                            <div class="campaign-info">
                                <span id="campaignDebtorsCount">0 deudores seleccionados</span>
                                <span id="campaignPoolsCount">0 pools activos</span>
                            </div>
                        </div>
                    </div>

                    <!-- Sección de Pools - MOVIDA ABAJO -->
                    <div class="pools-section">
                        <div id="poolsContainer"></div>
                        <div class="pools-summary">
                            <div id="poolsStats" class="pools-stats">Cargando pools...</div>
                        </div>
                    </div>
                </div>
            </section>
        `;

        this.updateCampaignUI();
        this.renderPoolsUI();
        this.updatePoolsStats();
    }

    handleCampaignStartError(error) {
        this.app.showNotification('❌ ' + (error || 'Error desconocido'), 'error');
        this.setCampaignUIState('error');
    }

    handleCampaignConnectionError(error) {
        this.app.debugLog(`💥 Error de conexión: ${error.message}`);
        this.app.showNotification('❌ Error de conexión: ' + error.message, 'error');
        this.setCampaignUIState('error');
    }

    // Método refresh para llamar desde la app
    refresh() {
        this.loadCampaignConfig();
        this.refreshPools();
        this.renderUI();
    }
}