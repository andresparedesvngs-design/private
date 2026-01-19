
class WhatsAppManager {
    constructor(app) {
        this.app = app;
        this.sessions = [];
        this.eventListenersSetup = false;
        this.initialized = false;
        // No llamar initialize desde el constructor
    }

    async initialize() {
        if (this.initialized) {
            console.log('⚠️ WhatsAppManager ya está inicializado, omitiendo...');
            return;
        }
        
        console.log('🚀 Inicializando WhatsAppManager...');
        await this.loadSessions();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.initialized = true;
        console.log('✅ WhatsAppManager inicializado correctamente');
    }

    setupEventListeners() {
        if (this.eventListenersSetup) {
            console.log('⚠️ Event listeners ya configurados (WhatsApp), omitiendo...');
            return;
        }

        console.log('🔧 Configurando event listeners de WhatsApp...');
        
        // Agregar sesión de WhatsApp
        document.addEventListener('click', (e) => {
            if (e.target.id === 'addWhatsApp') {
                this.addWhatsAppSession();
            }
        });

        // Input para número de teléfono
        const phoneInput = document.getElementById('phoneNumberInput');
        if (phoneInput) {
            phoneInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addWhatsAppSession();
                }
            });
        }

        this.eventListenersSetup = true;
        console.log('✅ Event listeners configurados (WhatsApp)');
    }

    setupSocketListeners() {
        this.app.socket.on('qr_update', (data) => this.handleQRUpdate(data));
        this.app.socket.on('session_ready', (data) => this.handleSessionReady(data));
        this.app.socket.on('session_disconnected', (data) => this.handleSessionDisconnected(data));
        this.app.socket.on('session_health', (data) => this.handleSessionHealth(data));
        
    }

    async loadSessions() {
        try {
            // USAR ENDPOINT REAL
            const response = await fetch(this.app.buildApiUrl('WHATSAPP_SESSIONS'));
            const data = await response.json();
            
            if (data.success) {
                this.sessions = data.sessions;
                this.renderSessions();
                this.updateStats();
            }
        } catch (error) {
            this.app.handleError(error, 'cargando sesiones WhatsApp');
        }
    }

    renderSessions() {
        const container = document.getElementById('whatsappSessions');
        if (!container) return;

        if (this.sessions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📱</div>
                    <p>No hay sesiones de WhatsApp</p>
                    <small>Agrega un número para comenzar</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.sessions.map(session => `
            <div class="session-card session-${session.status} ${session.isBlocked ? 'session-blocked' : ''}">
                <div class="session-header">
                    <div class="session-status ${session.status} ${session.isBlocked ? 'blocked' : ''}">
                        ${this.getStatusText(session.status, session.isBlocked)}
                    </div>
                    <button class="btn-delete ${session.status === 'connected' ? 'btn-delete-connected' : ''}" 
                            onclick="app.modules.whatsapp.deleteSession('${session.sessionId}', '${session.phoneNumber}')" 
                            title="Eliminar sesión">
                        🗑️
                    </button>
                </div>
                <h4>${session.phoneNumber}</h4>
                <p><strong>Conectado como:</strong> ${session.connectedNumber || 'No conectado'}</p>
                <p><strong>Mensajes enviados:</strong> ${session.messagesSent || 0}</p>
                <p><strong>Última conexión:</strong> ${session.lastConnection ? new Date(session.lastConnection).toLocaleString() : 'Nunca'}</p>
                <p><strong>Creado:</strong> ${new Date(session.createdAt).toLocaleString()}</p>
                ${session.status === 'qr_ready' ? '<p class="qr-pending">🔄 Esperando escaneo de QR</p>' : ''}
            </div>
        `).join('');
    }

    getStatusText(status, isBlocked) {
        if (isBlocked) return 'Bloqueado';
        
        const statusMap = {
            'connected': 'Conectado',
            'qr_ready': 'QR Listo',
            'disconnected': 'Desconectado',
            'initializing': 'Inicializando',
            'auth_failed': 'Error de Auth'
        };
        return statusMap[status] || status;
    }

    async addWhatsAppSession() {
        const phoneNumberInput = document.getElementById('phoneNumberInput');
        const phoneNumber = phoneNumberInput?.value.trim();

        if (!phoneNumber) {
            this.app.showNotification('📱 Por favor, ingresa un número de teléfono', 'warning');
            return;
        }

        const existingSession = this.sessions.find(session => 
            session.phoneNumber === phoneNumber && 
            ['connected', 'qr_ready', 'authenticated', 'initializing'].includes(session.status)
        );

        if (existingSession) {
            this.app.showNotification(`⚠️ Ya existe una sesión ${existingSession.status} para ${phoneNumber}. Elimina la sesión existente primero.`, 'warning');
            return;
        }

        try {
            // USAR ENDPOINT REAL
            const response = await fetch(this.app.buildApiUrl('WHATSAPP_SESSION'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.showNotification('🔗 Sesión creada - Escanea el QR cuando aparezca', 'info');
                if (phoneNumberInput) phoneNumberInput.value = '';
                await this.loadSessions();
            } else {
                this.handleSessionCreationError(data.error);
            }
        } catch (error) {
            this.app.handleError(error, 'añadiendo sesión WhatsApp');
        }
    }

    async deleteSession(sessionId, phoneNumber) {
        if (!confirm(`¿Estás seguro de que quieres eliminar la sesión de ${phoneNumber}?`)) {
            return;
        }

        try {
            // USAR ENDPOINT REAL
            const response = await fetch(this.app.buildApiUrl('WHATSAPP_SESSION', { sessionId }), {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.showNotification(`✅ Sesión de ${phoneNumber} eliminada correctamente`, 'success');
                await this.loadSessions();
            } else {
                this.app.showNotification(`❌ Error eliminando sesión: ${data.error}`, 'error');
            }
        } catch (error) {
            this.app.handleError(error, 'eliminando sesión WhatsApp');
        }
    }

    handleQRUpdate(data) {
        if (window.modals) {
            window.modals.showQR(data.sessionId, data.phoneNumber, data.qr);
        }
    }

    handleSessionReady(data) {
        this.app.showNotification(`✅ WhatsApp conectado: ${data.phoneNumber}`, 'success');
        if (window.modals) {
            window.modals.close('qrModal');
        }
        this.loadSessions();
    }

    handleSessionDisconnected(data) {
        const message = data.isBlocked ? 
            `🚫 WhatsApp bloqueado: ${data.phoneNumber}` : 
            `⚠️ WhatsApp desconectado: ${data.phoneNumber}`;
        
        this.app.showNotification(message, data.isBlocked ? 'error' : 'warning');
        this.loadSessions();
    }

    handleSessionHealth(data) {
        console.log(`❤️ Estado de sesión ${data.phoneNumber}: ${data.status}`);
    }

    handleSessionCreationError(error) {
        if (error && error.includes('Ya existe una sesión activa')) {
            this.app.showNotification(error, 'warning');
        } else {
            this.app.showNotification('❌ Error creando sesión: ' + error, 'error');
        }
    }

    updateStats() {
        const activeSessions = this.sessions.filter(s => s.status === 'connected').length;
        const blockedSessions = this.sessions.filter(s => s.isBlocked).length;
        const totalMessages = this.sessions.reduce((sum, session) => sum + (session.messagesSent || 0), 0);

        if (this.app.modules.ui) {
            this.app.modules.ui.updateStats({
                activeWhatsApps: activeSessions,
                blockedWhatsApps: blockedSessions,
                sentMessages: totalMessages,
                errorCount: blockedSessions
            });
        }
    }

    getConnectedSessions() {
        return this.sessions.filter(s => s.status === 'connected' && !s.isBlocked);
    }

    renderUI() {
        const section = document.getElementById('whatsappSection');
        if (!section) return;

        section.innerHTML = `
            <section class="whatsapp-section card">
                <div class="section-header">
                    <h2>📱 Gestión de Números WhatsApp</h2>
                    <span class="section-badge">${this.sessions.length} sesiones</span>
                </div>
                
                <div class="add-whatsapp-form">
                    <div class="input-group">
                        <input type="text" 
                               id="phoneNumberInput" 
                               placeholder="Ingresa el número de WhatsApp (ej: 56912345678)"
                               aria-label="Número de WhatsApp">
                        <button id="addWhatsApp" class="btn btn-success">
                            ➕ Agregar Número
                        </button>
                    </div>
                    <p class="input-hint">Formato: número sin +, ej: 56912345678</p>
                </div>
                
                <div id="whatsappSessions" class="sessions-grid"></div>
            </section>
        `;

        this.renderSessions();
    }

    refresh() {
        this.loadSessions();
        this.renderUI();
    }
}
