class UIManager {
    constructor(app) {
        this.app = app;
        this.isInitialized = false;
    }

    initialize() {
        if (this.isInitialized) return;
        
        this.renderBaseLayout();
        this.renderAllSections();
        this.setupGlobalEventListeners();
        this.isInitialized = true;
    }
    showSection(sectionName) {
        console.log(`📱 Mostrando sección: ${sectionName}`);
        // Esta función ahora se maneja principalmente en app.js
        // Aquí puedes añadir lógica específica de UI si es necesario
    }
    renderAllSections() {
        console.log('🔄 Renderizando todas las secciones...');
        
        // Renderizar cada sección
        if (this.app.modules.whatsapp && typeof this.app.modules.whatsapp.renderUI === 'function') {
            console.log('📱 Renderizando WhatsApp...');
            this.app.modules.whatsapp.renderUI();
        }
        
        if (this.app.modules.debtors && typeof this.app.modules.debtors.renderUI === 'function') {
            console.log('🧾 Renderizando Debtors...');
            this.app.modules.debtors.renderUI();
        }
        
        if (this.app.modules.campaigns && typeof this.app.modules.campaigns.renderUI === 'function') {
            console.log('⚙️ Renderizando Campaigns...');
            this.app.modules.campaigns.renderUI();
        }
        
        if (this.app.modules.chat && typeof this.app.modules.chat.renderUI === 'function') {
            console.log('💬 Renderizando Chat...');
            this.app.modules.chat.renderUI();
        }
    }

    renderBaseLayout() {
        const appContainer = document.getElementById('appContainer');
        if (!appContainer) return;

        appContainer.innerHTML = this.getBaseLayoutHTML();
    }

    getBaseLayoutHTML() {
        return `
            <header class="app-header">
                <div class="header-content">
                    <h1>🚀 Panel de Gestión de Campañas WhatsApp</h1>
                    <p class="header-subtitle">Sistema automatizado para gestión de cobranzas</p>
                </div>
                <div class="header-actions">
                    <button id="refreshBtn" class="btn btn-secondary" title="Actualizar datos">
                        🔄 Actualizar
                    </button>
                </div>
            </header>

            <div class="main-content">
                <div id="statsSection"></div>
                <div id="whatsappSection"></div>
                <div id="campaignsSection"></div>
                <div id="debtorsSection"></div>
                <div id="chatSection"></div>
            </div>

            <section class="debug-section" id="debugSection">
                <h2>🧪 PANEL DE CONTROL - GESTIÓN DE DEUDORES</h2>
                <div class="debug-controls">
                    <button onclick="app.modules.debtors.testConnection()" class="btn btn-info">
                        🔍 Probar Conexión
                    </button>
                    <button onclick="app.modules.debtors.testClearAll()" class="btn btn-warning">
                        🧪 Probar Eliminación
                    </button>
                    <button onclick="app.modules.debtors.clearAllDebtors()" class="btn btn-danger">
                        🗑️ ELIMINAR TODOS
                    </button>
                    <button onclick="app.modules.debtors.showStatus()" class="btn btn-success">
                        📊 Ver Estado
                    </button>
                </div>
                <div id="debugOutput" class="debug-output">
                    <strong>🔧 Consola de Debug:</strong><br>
                    <span class="debug-initial-message">Sistema inicializado. Esperando acciones...</span>
                </div>
            </section>
        `;
    }

    setupGlobalEventListeners() {
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            location.reload();
        });

        document.addEventListener('click', (e) => {
            const target = e.target;
            
            if (target.classList.contains('btn-toggle')) {
                this.handleToggleButton(target);
            }
            
            if (target.classList.contains('btn-action')) {
                this.handleActionButton(target);
            }
        });

        document.addEventListener('input', Debounce.debounce((e) => {
            if (e.target.dataset.debounce) {
                const handler = e.target.dataset.handler;
                if (handler && typeof this.app[handler] === 'function') {
                    this.app[handler]();
                }
            }
        }, 500));
    }

    handleToggleButton(button) {
        const containerId = button.dataset.toggle;
        if (containerId) {
            this.toggleSection(containerId, button);
        }
    }

    handleActionButton(button) {
        const action = button.dataset.action;
        const module = button.dataset.module;
        
        if (module && action) {
            const moduleInstance = this.app.modules[module];
            if (moduleInstance && typeof moduleInstance[action] === 'function') {
                moduleInstance[action]();
            }
        }
    }

    toggleSection(sectionId, button) {
        const section = document.getElementById(sectionId);
        if (section) {
            const isVisible = section.style.display !== 'none';
            section.style.display = isVisible ? 'none' : 'block';
            
            if (button) {
                button.textContent = isVisible ? '📥 Mostrar' : '✕ Ocultar';
            }
        }
    }

    showNotification(message, type = 'info') {
        if (window.notifications) {
            window.notifications.show(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
            alert(message);
        }
    }

    debugLog(message) {
        const debugOutput = document.getElementById('debugOutput');
        if (debugOutput) {
            const timestamp = new Date().toLocaleTimeString();
            const messageElement = document.createElement('div');
            messageElement.className = 'debug-message';
            messageElement.textContent = `${timestamp}: ${message}`;
            debugOutput.appendChild(messageElement);
            debugOutput.scrollTop = debugOutput.scrollHeight;
        }
        console.log(`🔧 ${message}`);
    }

    updateStats(stats) {
        const statsSection = document.getElementById('statsSection');
        if (!statsSection) return;

        statsSection.innerHTML = `
            <section class="stats-section">
                <h2>📊 Resumen de Actividad</h2>
                <div class="stats-grid">
                    <div class="stat-card stat-success">
                        <div class="stat-icon">📱</div>
                        <div class="stat-info">
                            <h3>WhatsApps Activos</h3>
                            <p class="stat-number">${stats.activeWhatsApps || 0}</p>
                        </div>
                    </div>
                    <div class="stat-card stat-warning">
                        <div class="stat-icon">🚫</div>
                        <div class="stat-info">
                            <h3>WhatsApps Bloqueados</h3>
                            <p class="stat-number">${stats.blockedWhatsApps || 0}</p>
                        </div>
                    </div>
                    <div class="stat-card stat-info">
                        <div class="stat-icon">📨</div>
                        <div class="stat-info">
                            <h3>Mensajes Enviados</h3>
                            <p class="stat-number">${stats.sentMessages || 0}</p>
                        </div>
                    </div>
                    <div class="stat-card stat-error">
                        <div class="stat-icon">⚠️</div>
                        <div class="stat-info">
                            <h3>Errores</h3>
                            <p class="stat-number">${stats.errorCount || 0}</p>
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    showLoading(containerId, message = 'Cargando...') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <div class="spinner"></div>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    hideLoading(containerId) {
        const container = document.getElementById(containerId);
        if (container && container.querySelector('.loading-state')) {
            container.querySelector('.loading-state').remove();
        }
    }

    showError(containerId, message, retryCallback = null) {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">❌</div>
                    <h4>Error</h4>
                    <p>${message}</p>
                    ${retryCallback ? `<button class="btn btn-primary" onclick="${retryCallback}">Reintentar</button>` : ''}
                </div>
            `;
        }
    }

    updateCampaignUIState(state, data = {}) {
        const sendButton = document.getElementById('sendCampaign');
        const cancelButton = document.getElementById('cancelCampaign');
        
        if (!sendButton) return;

        switch (state) {
            case 'starting':
                sendButton.textContent = '⏳ Iniciando...';
                sendButton.disabled = true;
                if (cancelButton) cancelButton.style.display = 'inline-block';
                break;
                
            case 'progress':
                sendButton.textContent = `📤 Enviando... ${data.processed || 0}/${data.total || 0}`;
                sendButton.disabled = true;
                break;
                
            case 'completed':
                sendButton.textContent = '🚀 Iniciar Campaña';
                sendButton.disabled = false;
                if (cancelButton) cancelButton.style.display = 'none';
                break;
                
            case 'error':
                sendButton.textContent = '🚀 Iniciar Campaña';
                sendButton.disabled = false;
                if (cancelButton) cancelButton.style.display = 'none';
                break;
        }
    }
}