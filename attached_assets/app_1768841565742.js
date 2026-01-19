class WhatsAppMassiveSender {
    constructor() {
        this.config = window.APP_CONFIG || {
            API_BASE_URL: 'http://localhost:3000',
            WS_URL: 'http://localhost:3000',
            ENDPOINTS: {}
        };

        // Conectar socket con fallback
        this.socket = io(this.config.WS_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        this.modules = {};
        this.isInitialized = false;

        // Eventos básicos
        this.setupBasicSocketListeners();

        // NUEVO: Inicializar MessageTracker si existe
        if (window.messageTracker) {
            window.messageTracker.init(this.socket);
        }

        // Verificar backend antes de iniciar todo
        this.checkBackendConnection().then(connected => {
            if (connected) {
                this.initializeApp();
            } else {
                this.showBackendError();
            }
        });

        // Configurar herramientas de debug
        this.setupDebugTools();
    }

    setupBasicSocketListeners() {
        this.socket.on('connect', () => {
            console.log('✅ Socket conectado al backend');
        });

        this.socket.on('connect_error', (error) => {
            console.error('❌ Error de conexión socket:', error);
            this.showNotification('❌ Error de conexión con el servidor', 'error');
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('⚠️ Socket desconectado:', reason);
            this.showNotification('⚠️ Conexión perdida, reconectando...', 'warning');
        });
    }

    setupDebugTools() {
        window.debugApp = {
            // Ver estado del sistema
            showState: () => {
                console.log('=== DEBUG DEL SISTEMA ===');
                console.log('App inicializada:', this.isInitialized);
                console.log('Socket conectado:', this.socket?.connected);
                console.log('Módulos cargados:', Object.keys(this.modules));
                
                // Verificar deudores
                if (this.modules.debtors) {
                    console.log('Deudores cargados:', this.modules.debtors.debtors?.length || 0);
                    console.log('Deudores filtrados:', this.modules.debtors.filteredDebtors?.length || 0);
                }
                
                // Verificar WhatsApp
                if (this.modules.whatsapp) {
                    console.log('Sesiones WhatsApp:', this.modules.whatsapp.sessions?.length || 0);
                    console.log('Sesiones conectadas:', this.modules.whatsapp.getConnectedSessions()?.length || 0);
                }
                
                // Verificar campañas
                if (this.modules.campaigns) {
                    console.log('Pools activos:', this.modules.campaigns.getActivePools()?.length || 0);
                }
                
                // NUEVO: Verificar MessageTracker
                if (window.messageTracker) {
                    console.log('MessageTracker activo:', true);
                    console.log('Estadísticas:', window.messageTracker.campaignStats);
                }
            },
            
            // Probar conexión con endpoints
            testEndpoints: async () => {
                const endpoints = [
                    { key: 'HEALTH', name: 'Salud' },
                    { key: 'DEBTORS', name: 'Deudores' },
                    { key: 'WHATSAPP_SESSIONS', name: 'WhatsApp' },
                    { key: 'CAMPAIGN_STATUS', name: 'Campañas' }
                ];
                
                for (const endpoint of endpoints) {
                    try {
                        const response = await fetch(this.buildApiUrl(endpoint.key));
                        const data = await response.json();
                        console.log(`✅ ${endpoint.name}:`, data.success ? 'OK' : data.error || 'ERROR');
                    } catch (error) {
                        console.log(`❌ ${endpoint.name}:`, error.message);
                    }
                }
            },
            
            // Ver datos de campaña actual
            showCampaignData: () => {
                if (!this.modules.campaigns) {
                    console.log('❌ Módulo de campañas no disponible');
                    return;
                }
                
                const message = DOMUtils.getSafeValue('messageText');
                const debtors = this.modules.debtors?.getCurrentDebtors() || [];
                const pools = this.modules.campaigns?.getActivePools() || [];
                
                console.log('=== DATOS DE CAMPAÑA ACTUAL ===');
                console.log('Mensaje:', message || 'No definido');
                console.log('Deudores:', debtors.length);
                console.log('Pools activos:', pools.length);
                
                pools.forEach((pool, i) => {
                    console.log(`Pool ${i+1}: ${pool.name}`);
                    console.log(`  Sesiones: ${pool.sessions?.length || 0}`);
                    console.log(`  Modo: ${pool.mode}`);
                    console.log(`  Delay: ${pool.delayBase}ms ± ${pool.delayVariacion}ms`);
                });
            },
            
            // NUEVO: Probar MessageTracker
            testMessageTracker: () => {
                if (window.messageTracker) {
                    console.log('✅ MessageTracker disponible');
                    console.log('Estadísticas:', window.messageTracker.campaignStats);
                    
                    // Simular un evento
                    const testData = {
                        messageId: 'test-' + Date.now(),
                        status: 'sent',
                        phoneNumber: '+56912345678',
                        timestamp: new Date().toISOString()
                    };
                    
                    window.messageTracker.updateMessageState(testData);
                    console.log('✅ Evento simulado enviado');
                    return true;
                } else {
                    console.log('❌ MessageTracker no disponible');
                    return false;
                }
            }
        };
    }

    async checkBackendConnection() {
        try {
            const response = await fetch(`${this.config.API_BASE_URL}/api/health`);
            if (response.ok) {
                console.log('✅ Backend conectado correctamente');
                return true;
            }
            return false;
        } catch (error) {
            console.error('❌ No se puede conectar al backend:', error);
            return false;
        }
    }

    showBackendError() {
        const html = `
            <div class="backend-error-overlay">
                <div class="error-content">
                    <h2>❌ No se puede conectar al servidor</h2>
                    <p>Verifica que el backend esté funcionando en:</p>
                    <code>${this.config.API_BASE_URL}</code>
                    <div class="error-actions">
                        <button onclick="location.reload()" class="btn btn-primary">
                            🔄 Reintentar
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    async initializeApp() {
        console.log('🚀 Inicializando WhatsApp Massive Sender...');

        try {
            // Cargar módulos en orden lógico
            this.modules.ui = new UIManager(this);
            this.modules.whatsapp = new WhatsAppManager(this);
            this.modules.debtors = new DebtorsManager(this);
            this.modules.campaigns = new CampaignsManager(this);
            this.modules.chat = new ChatManager(this);

            // UI primero
            this.modules.ui.initialize();

            // Inicialización secuencial
            await this.modules.whatsapp.initialize();
            await this.modules.debtors.initialize();
            await this.modules.campaigns.initialize();
            await this.modules.chat.initialize();

            // NUEVO: Inicializar MessageTracker si existe
            if (window.messageTracker && typeof window.messageTracker.init === 'function') {
                window.messageTracker.init(this.socket);
            }

            this.isInitialized = true;
            console.log('✅ Sistema cargado correctamente');

            this.showNotification('✅ Sistema cargado correctamente', 'success');

        } catch (error) {
            console.error('❌ Error inicializando aplicación:', error);
            this.showNotification('❌ Error inicializando la aplicación', 'error');
        }
    }

    buildApiUrl(endpointKey, params = {}) {
        const endpoint = this.config.ENDPOINTS[endpointKey];
        if (!endpoint) {
            console.warn(`⚠️ Endpoint desconocido: ${endpointKey}`);
            return `${this.config.API_BASE_URL}/api/unknown`;
        }

        let url = endpoint;
        Object.keys(params).forEach(key => {
            url = url.replace(`:${key}`, encodeURIComponent(params[key]));
        });

        return this.config.API_BASE_URL + url;
    }

    showNotification(message, type = 'info') {
        if (this.modules.ui) {
            this.modules.ui.showNotification(message, type);
        } else if (window.notifications) {
            window.notifications.show(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    debugLog(message) {
        if (this.modules.ui) {
            this.modules.ui.debugLog(message);
        } else {
            console.log(`🔧 ${message}`);
        }
    }

    handleError(error, context = '') {
        console.error(`❌ Error en ${context}:`, error);
        const message = error.message || 'Error desconocido';
        this.showNotification(`❌ Error ${context}: ${message}`, 'error');
    }

    // Método para cambiar entre secciones
    showSection(sectionName) {
        console.log(`📱 Cambiando a sección: ${sectionName}`);
        
        // Si el módulo ya está inicializado, renderizar su UI
        if (this.modules[sectionName] && typeof this.modules[sectionName].renderUI === 'function') {
            this.modules[sectionName].renderUI();
        }
    }

    // Métodos de refresh para cada módulo
    refreshSection(sectionName) {
        const module = this.modules[sectionName];
        if (module && typeof module.refresh === 'function') {
            module.refresh();
        }
    }

    // Nuevo método para probar conexión específica
    async testCampaignConnection() {
        if (!this.modules.campaigns) {
            console.error('❌ Módulo de campañas no inicializado');
            return;
        }
        
        await this.modules.campaigns.testBackendConnection();
    }
    
    // NUEVO: Método para alternar tema
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        this.showNotification(`🌙 Tema cambiado a ${newTheme === 'dark' ? 'oscuro' : 'claro'}`, 'info');
    }
    
    // NUEVO: Método para mostrar configuración
    showSettings() {
        this.showNotification('⚙️ Configuración (en desarrollo)', 'info');
    }
}

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    window.app = new WhatsAppMassiveSender();
});