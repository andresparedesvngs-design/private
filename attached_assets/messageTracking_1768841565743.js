class MessageTracker {
    constructor() {
        this.messageStates = new Map();
        this.campaignStats = {
            sent: 0,
            delivered: 0,
            read: 0,
            blocked: 0,
            failed: 0,
            pending: 0
        };
    }
    
    init(socket) {
        this.socket = socket;
        
        // Escuchar actualizaciones de estado
        socket.on('message_status_update', (data) => {
            this.updateMessageState(data);
            this.updateUI(data);
        });
        
        // Escuchar inicio de campaña
        socket.on('campaign_started', (data) => {
            this.resetStats();
            this.showCampaignPanel();
        });
        
        // Escuchar progreso de campaña
        socket.on('campaign_progress', (data) => {
            this.updateProgressBar(data);
        });
        
        // Escuchar finalización de campaña
        socket.on('campaign_completed', (data) => {
            this.showFinalReport(data);
        });
    }
    
    updateMessageState(data) {
        this.messageStates.set(data.messageId, data);
        
        // Actualizar estadísticas
        switch(data.status) {
            case 'sent':
                this.campaignStats.sent++;
                break;
            case 'delivered':
                this.campaignStats.delivered++;
                break;
            case 'read':
                this.campaignStats.read++;
                break;
            case 'blocked':
                this.campaignStats.blocked++;
                break;
            case 'failed':
                this.campaignStats.failed++;
                break;
            case 'pending':
                this.campaignStats.pending++;
                break;
        }
        
        this.updateStatsDisplay();
    }
    
    updateUI(data) {
        // Buscar la fila en la tabla de mensajes
        const row = document.querySelector(`[data-message-id="${data.messageId}"]`);
        
        if (row) {
            const statusCell = row.querySelector('.message-status');
            const statusIcon = row.querySelector('.status-icon');
            
            // Actualizar texto y color según estado
            statusCell.textContent = this.getStatusText(data.status);
            statusCell.className = `message-status status-${data.status}`;
            
            // Actualizar icono
            statusIcon.innerHTML = this.getStatusIcon(data.status);
        }
    }
    
    getStatusText(status) {
        const statusMap = {
            'sent': 'Enviado',
            'delivered': 'Entregado',
            'read': 'Leído',
            'blocked': 'Bloqueado',
            'failed': 'Falló',
            'pending': 'Pendiente'
        };
        return statusMap[status] || status;
    }
    
    getStatusIcon(status) {
        const icons = {
            'sent': '✓',
            'delivered': '✓✓',
            'read': '✓✓🔵',
            'blocked': '🚫',
            'failed': '❌',
            'pending': '⏳'
        };
        return icons[status] || '❓';
    }
    
    updateStatsDisplay() {
        const statsElement = document.getElementById('campaign-stats');
        if (statsElement) {
            statsElement.innerHTML = `
                <div class="stats-container">
                    <div class="stat sent">
                        <span class="stat-label">Enviados:</span>
                        <span class="stat-value">${this.campaignStats.sent}</span>
                    </div>
                    <div class="stat delivered">
                        <span class="stat-label">Entregados:</span>
                        <span class="stat-value">${this.campaignStats.delivered}</span>
                    </div>
                    <div class="stat read">
                        <span class="stat-label">Leídos:</span>
                        <span class="stat-value">${this.campaignStats.read}</span>
                    </div>
                    <div class="stat blocked">
                        <span class="stat-label">Bloqueados:</span>
                        <span class="stat-value">${this.campaignStats.blocked}</span>
                    </div>
                    <div class="stat failed">
                        <span class="stat-label">Fallidos:</span>
                        <span class="stat-value">${this.campaignStats.failed}</span>
                    </div>
                    <div class="stat success-rate">
                        <span class="stat-label">Tasa de éxito:</span>
                        <span class="stat-value">${this.calculateSuccessRate()}%</span>
                    </div>
                </div>
            `;
        }
    }
    
    calculateSuccessRate() {
        const total = this.campaignStats.sent;
        const successful = this.campaignStats.delivered + this.campaignStats.read;
        
        if (total === 0) return 0;
        return Math.round((successful / total) * 100);
    }
    
    resetStats() {
        this.messageStates.clear();
        this.campaignStats = {
            sent: 0,
            delivered: 0,
            read: 0,
            blocked: 0,
            failed: 0,
            pending: 0
        };
    }
    
    updateProgressBar(data) {
        const progressBar = document.getElementById('campaign-progress-bar');
        const progressText = document.getElementById('campaign-progress-text');
        
        if (progressBar && progressText) {
            progressBar.style.width = `${data.progress}%`;
            progressBar.setAttribute('aria-valuenow', data.progress);
            
            progressText.innerHTML = `
                <strong>Progreso:</strong> ${data.progress}%<br>
                <small>
                    Enviados: ${data.sent} | 
                    Exitosos: ${data.successful} | 
                    Fallidos: ${data.failed} | 
                    Saltados: ${data.skipped}
                </small>
            `;
        }
    }
    
    showFinalReport(data) {
        // Crear modal con reporte detallado
        const modalHTML = `
            <div class="modal fade" id="campaignReportModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">📊 Reporte de Campaña Finalizado</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-6">
                                    <h6>Estadísticas Generales</h6>
                                    <ul class="list-group">
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span>Total mensajes:</span>
                                            <strong>${data.totalSent}</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span>Exitosos:</span>
                                            <strong class="text-success">${data.successful}</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span>Fallidos:</span>
                                            <strong class="text-danger">${data.failed}</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span>Saltados:</span>
                                            <strong class="text-warning">${data.skipped}</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span>Tasa de éxito:</span>
                                            <strong>${data.successRate.toFixed(1)}%</strong>
                                        </li>
                                    </ul>
                                </div>
                                <div class="col-md-6">
                                    <h6>Estado de Mensajes</h6>
                                    <ul class="list-group">
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span><span class="badge bg-primary">✓</span> Enviados:</span>
                                            <strong>${this.campaignStats.sent}</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span><span class="badge bg-success">✓✓</span> Entregados:</span>
                                            <strong>${this.campaignStats.delivered}</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span><span class="badge bg-info">✓✓🔵</span> Leídos:</span>
                                            <strong>${this.campaignStats.read}</strong>
                                        </li>
                                        <li class="list-group-item d-flex justify-content-between">
                                            <span><span class="badge bg-danger">🚫</span> Bloqueados:</span>
                                            <strong>${this.campaignStats.blocked}</strong>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            
                            ${data.detailedReport ? `
                            <div class="mt-4">
                                <h6>Análisis Detallado</h6>
                                <div class="card">
                                    <div class="card-body">
                                        <pre style="max-height: 300px; overflow-y: auto;">${JSON.stringify(data.detailedReport, null, 2)}</pre>
                                    </div>
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                            <button type="button" class="btn btn-primary" onclick="exportCampaignReport()">
                                📥 Exportar Reporte
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Agregar modal al DOM y mostrarlo
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Usar nuestro sistema de modales existente
        setTimeout(() => {
            const modal = document.getElementById('campaignReportModal');
            if (modal && window.modals) {
                window.modals.show('campaignReportModal');
            }
        }, 100);
    }
    
    showCampaignPanel() {
        // Crear o mostrar panel de campaña
        const panelHTML = `
            <div class="card campaign-panel">
                <div class="campaign-panel-header">
                    <h5>📱 Campaña en Progreso</h5>
                    <button class="campaign-panel-close" onclick="this.parentElement.parentElement.remove()">×</button>
                </div>
                <div class="campaign-panel-body">
                    <div class="mb-3">
                        <div class="progress">
                            <div id="campaign-progress-bar" class="progress-bar progress-bar-striped progress-bar-animated" 
                                 role="progressbar" style="width: 0%" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                            </div>
                        </div>
                        <div id="campaign-progress-text" class="text-center mt-2 small"></div>
                    </div>
                    
                    <div id="campaign-stats"></div>
                    
                    <div class="mt-3">
                        <button class="btn btn-warning btn-sm" onclick="stopCampaign()">
                            ⏸️ Pausar Campaña
                        </button>
                        <button class="btn btn-danger btn-sm ms-2" onclick="cancelCampaign()">
                            ❌ Cancelar Campaña
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Remover panel existente si hay uno
        const existingPanel = document.getElementById('campaign-container');
        if (existingPanel) {
            existingPanel.innerHTML = panelHTML;
            this.updateStatsDisplay();
        } else {
            const container = document.createElement('div');
            container.id = 'campaign-container';
            container.innerHTML = panelHTML;
            document.body.appendChild(container);
            this.updateStatsDisplay();
        }
    }
}

// Inicializar tracker globalmente
window.messageTracker = new MessageTracker();

// Función para exportar reporte (ya está en el script global del index.html)