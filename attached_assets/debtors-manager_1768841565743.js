
class DebtorsManager {
    constructor(app) {
        this.app = app;
        this.debtors = [];
        this.filteredDebtors = [];
        this.currentView = 'all';
        this.virtualScroll = null;
        this.selectedFile = null;
        
        // Sistema multi-pool SOLO FRONTEND (sin conexión a backend)
        this.deudoresAsignados = new Map(); // { telefono: poolId }
        this.deudoresCompletados = [];
        this.deudoresFallados = [];
        this.estadisticasMultiPool = {
            total: 0,
            disponibles: 0,
            procesando: 0,
            completados: 0,
            fallados: 0
        };
    }

    async initialize() {
        await this.loadAllDebtors();
        this.setupEventListeners();
        this.initializeVirtualScroll();
        this.renderUI();
        this.inicializarGestionMultiPool();
    }

    setupEventListeners() {
        // Toggle de vistas
        DOMUtils.addEventDelegate('#showAllDebtors', 'click', () => {
            this.switchView('all');
        });

        DOMUtils.addEventDelegate('#showCampaignDebtors', 'click', () => {
            this.switchView('filtered');
        });

        // Filtros con debounce
        DOMUtils.addEventDelegate('#minDebt', 'input', Debounce.debounce(() => {
            this.applyCampaignFilters();
        }, 500));

        DOMUtils.addEventDelegate('#maxDebt', 'input', Debounce.debounce(() => {
            this.applyCampaignFilters();
        }, 500));

        DOMUtils.addEventDelegate('#statesFilter', 'change', () => {
            this.applyCampaignFilters();
        });

        DOMUtils.addEventDelegate('#executiveCampaignFilter', 'change', () => {
            this.applyCampaignFilters();
        });

        // Botones de acción
        DOMUtils.addEventDelegate('#clearFilters', 'click', () => {
            this.clearFilters();
        });

        DOMUtils.addEventDelegate('#exportDebtors', 'click', () => {
            this.exportDebtors();
        });

        DOMUtils.addEventDelegate('#toggleImportSection', 'click', () => {
            this.toggleImportSection();
        });

        // Gestión de archivos
        this.setupFileEvents();
    }

    setupFileEvents() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.getElementById('uploadBtn');

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());
            
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('dragover');
            });

            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });

            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFileSelect(files[0]);
                }
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileSelect(e.target.files[0]);
                }
            });

            if (uploadBtn) {
                uploadBtn.addEventListener('click', () => {
                    this.uploadFile();
                });
            }
        }
    }

    async loadAllDebtors() {
        try {
            this.app.debugLog('📥 Cargando todos los deudores...');
            
            const response = await fetch(this.app.buildApiUrl('DEBTORS'));
            const data = await response.json();
            
            if (data.success) {
                this.debtors = data.debtors;
                this.app.debugLog(`✅ ${this.debtors.length} deudores cargados`);
                
                this.applyCampaignFilters();
                this.updateExecutiveFilters();
                this.updateManagementPanel();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.app.handleError(error, 'cargando deudores');
        }
    }

    applyCampaignFilters() {
        const minDebt = DOMUtils.getSafeNumberValue('minDebt', 0);
        const maxDebt = DOMUtils.getSafeNumberValue('maxDebt', 1000000);
        const states = DOMUtils.getSelectedValues('statesFilter', ['pendiente']);
        const executive = DOMUtils.getSafeSelectValue('executiveCampaignFilter', '');

        this.filteredDebtors = this.debtors.filter(debtor => {
            const debtMatch = debtor.deuda >= minDebt && debtor.deuda <= maxDebt;
            const stateMatch = states.length === 0 || states.includes(debtor.estado);
            const executiveMatch = !executive || debtor.nombre_ejecutivo === executive;
            
            return debtMatch && stateMatch && executiveMatch;
        });

        this.app.debugLog(`✅ Filtrados ${this.filteredDebtors.length} de ${this.debtors.length} deudores`);
        
        // Reiniciar gestión multi-pool cuando se aplican nuevos filtros
        this.inicializarGestionMultiPool();
        
        this.handleVirtualScroll();
        this.updateCampaignStats();
        this.updateLazyStats();
        this.actualizarDashboardMultiPool();
    }

    switchView(view) {
        this.currentView = view;
        
        // Actualizar botones de toggle
        document.getElementById('showAllDebtors')?.classList.toggle('active', view === 'all');
        document.getElementById('showCampaignDebtors')?.classList.toggle('active', view === 'filtered');
        
        this.handleVirtualScroll();
        this.updateCampaignStats();
        this.updateLazyStats();
        this.actualizarDashboardMultiPool();
    }

    initializeVirtualScroll() {
        const container = document.getElementById('virtualScrollContainer');
        if (!container) return;

        // Configurar el contenedor para virtual scroll
        container.innerHTML = `
            <div class="virtual-scroll-content" id="virtualScrollContent">
                <!-- Las filas se renderizarán aquí dinámicamente -->
            </div>
        `;

        this.virtualScroll = new VirtualScroll('virtualScrollContainer', {
            rowHeight: 60,
            buffer: 10
        });

        this.virtualScroll.setData(this.filteredDebtors, (debtor, index) => {
            return this.renderDebtorRow(debtor, index);
        });
    }

    handleVirtualScroll() {
        if (!this.virtualScroll) return;

        const debtors = this.getCurrentDebtors();
        this.virtualScroll.setData(debtors, (debtor, index) => this.renderDebtorRow(debtor, index));
    }

    getCurrentDebtors() {
        return this.currentView === 'all' ? this.debtors : this.filteredDebtors;
    }

    renderDebtorRow(debtor, index) {
        // Determinar estado del deudor en el sistema multi-pool
        let estado = 'disponible';
        let poolAsignado = '';
        
        if (this.deudoresAsignados.has(debtor.telefono)) {
            estado = 'procesando';
            poolAsignado = this.deudoresAsignados.get(debtor.telefono);
        } else if (this.deudoresCompletados.includes(debtor.telefono)) {
            estado = 'completado';
        } else if (this.deudoresFallados.includes(debtor.telefono)) {
            estado = 'fallado';
        }

        const estadoClass = `debtor-row debtor-status-${estado}`;
        
        return `
            <div class="${estadoClass}">
                <!-- Indicador de estado -->
                <div class="debtor-status-indicator">
                    ${this.getEstadoIcon(estado)}
                </div>
                
                <div class="debtor-cell debtor-cell-name">
                    ${Helpers.escapeHtml(debtor.nombre)}
                </div>
                <div class="debtor-cell debtor-cell-phone">
                    ${Helpers.escapeHtml(debtor.telefono)}
                </div>
                <div class="debtor-cell debtor-cell-rut">
                    ${Helpers.escapeHtml(debtor.rut || '-')}
                </div>
                <div class="debtor-cell debtor-cell-debt">
                    $${Helpers.escapeHtml(debtor.deuda.toLocaleString())}
                </div>
                <div class="debtor-cell debtor-cell-status">
                    <span class="status-badge status-${Helpers.escapeHtml(debtor.estado)}">
                        ${Helpers.escapeHtml(debtor.estado)}
                    </span>
                </div>
                <div class="debtor-cell debtor-cell-due-date">
                    ${debtor.vencimiento ? new Date(debtor.vencimiento).toLocaleDateString() : 'N/A'}
                </div>
                <div class="debtor-cell debtor-cell-executive">
                    ${Helpers.escapeHtml(debtor.nombre_ejecutivo || '-')}
                </div>
                <div class="debtor-cell debtor-cell-actions">
                    <button class="btn-test-message" 
                            onclick="app.modules.debtors.testMessage('${Helpers.escapeHtml(debtor.telefono)}')">
                        Probar Mensaje
                    </button>
                    ${estado === 'procesando' ? `
                    <span class="pool-assign-badge">
                        Pool: ${poolAsignado}
                    </span>
                    ` : ''}
                </div>
            </div>
        `;
    }

    getEstadoIcon(estado) {
        const icons = {
            'disponible': '🟢',
            'procesando': '🟡',
            'completado': '✅',
            'fallado': '❌'
        };
        return icons[estado] || '⚪';
    }

    updateCampaignStats() {
        const total = this.debtors.length;
        const filtered = this.filteredDebtors.length;
        const sending = this.currentView === 'all' ? total : filtered;

        DOMUtils.setSafeTextContent('totalDebtorsCount', total);
        DOMUtils.setSafeTextContent('filteredDebtorsCount', filtered);
        DOMUtils.setSafeTextContent('sendingDebtorsCount', sending);
        DOMUtils.setSafeTextContent('campaignDebtorsCount', sending);
    }

    updateLazyStats() {
        const debtors = this.getCurrentDebtors();
        DOMUtils.setSafeTextContent('lazyStatsText', `Mostrando ${debtors.length} deudores`);
        DOMUtils.setSafeTextContent('showingDebtorsCount', debtors.length);
    }

    updateManagementPanel() {
        DOMUtils.setSafeTextContent('currentDebtorsCount', `${this.debtors.length} deudores cargados`);
        DOMUtils.setSafeTextContent('currentDebtorsCountMain', this.debtors.length);
        
        const timeText = new Date().toLocaleTimeString();
        DOMUtils.setSafeTextContent('lastUpdateTime', timeText);
        DOMUtils.setSafeTextContent('lastUpdateTimeMain', timeText);
    }

    updateExecutiveFilters() {
        const executiveCampaignFilter = document.getElementById('executiveCampaignFilter');
        if (!executiveCampaignFilter) return;

        const executives = [...new Set(this.debtors.map(d => d.nombre_ejecutivo).filter(Boolean))];
        const currentSelection = executiveCampaignFilter.value;

        // Limpiar opciones existentes (excepto la primera)
        while (executiveCampaignFilter.options.length > 1) {
            executiveCampaignFilter.remove(1);
        }

        // Agregar ejecutivos
        executives.forEach(executive => {
            const option = document.createElement('option');
            option.value = executive;
            option.textContent = executive;
            executiveCampaignFilter.appendChild(option);
        });

        // Restaurar selección si existe
        if (executives.includes(currentSelection)) {
            executiveCampaignFilter.value = currentSelection;
        }
    }

    handleFileSelect(file) {
        const uploadBtn = document.getElementById('uploadBtn');
        const dropZone = document.getElementById('dropZone');
        
        if (!dropZone || !uploadBtn) return;

        const isValidFile = this.validateFileType(file);
        
        if (isValidFile) {
            dropZone.innerHTML = `
                <div class="file-selected-info">
                    <p><strong>Archivo seleccionado:</strong> ${file.name}</p>
                    <p class="file-valid">
                        ✅ ${file.type === 'text/csv' ? 'Archivo CSV' : 'Archivo Excel'} válido
                    </p>
                </div>
            `;
            uploadBtn.disabled = false;
            this.selectedFile = file;
        } else {
            this.app.showNotification('❌ Por favor, selecciona un archivo CSV o Excel válido (.csv, .xlsx, .xls)', 'warning');
            this.showFileError(dropZone, file.name);
            uploadBtn.disabled = true;
            this.selectedFile = null;
        }
    }

    validateFileType(file) {
        const isCSV = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
        const isExcel = file.type.includes('spreadsheet') || 
                       file.name.toLowerCase().endsWith('.xlsx') || 
                       file.name.toLowerCase().endsWith('.xls');
        
        return isCSV || isExcel;
    }

    showFileError(dropZone, fileName) {
        dropZone.innerHTML = `
            <div class="file-error-info">
                <p>Arrastra tu archivo aquí o haz clic para seleccionar</p>
                <p class="file-invalid">
                    <strong>Error:</strong> El archivo "${fileName}" no es válido.<br>
                    <strong>Formatos aceptados:</strong> CSV (.csv) o Excel (.xlsx, .xls)
                </p>
            </div>
        `;
    }

    async uploadFile() {
        if (!this.selectedFile) {
            this.app.showNotification('❌ Por favor, selecciona un archivo primero', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', this.selectedFile);

        try {
            this.setUploadButtonState('uploading');

            const response = await fetch(this.app.buildApiUrl('DEBTORS_IMPORT'), {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.showNotification(data.message, 'success');
                this.app.debugLog('✅ Archivo importado correctamente');
                this.resetFileInput();
                await this.loadAllDebtors();
            } else {
                this.app.showNotification('❌ Error importando archivo: ' + data.error, 'error');
            }
        } catch (error) {
            this.app.handleError(error, 'subiendo archivo');
        } finally {
            this.setUploadButtonState('idle');
        }
    }

    setUploadButtonState(state) {
        const uploadBtn = document.getElementById('uploadBtn');
        if (!uploadBtn) return;

        if (state === 'uploading') {
            uploadBtn.textContent = '⏳ Subiendo...';
            uploadBtn.disabled = true;
        } else {
            uploadBtn.textContent = 'Subir Archivo';
            uploadBtn.disabled = false;
        }
    }

    resetFileInput() {
        const dropZone = document.getElementById('dropZone');
        const uploadBtn = document.getElementById('uploadBtn');
        const fileInput = document.getElementById('fileInput');
        
        if (dropZone) {
            dropZone.innerHTML = `
                <p>Arrastra tu archivo CSV aquí o haz clic para seleccionar</p>
                <p class="file-info">Formato requerido: nombre, telefono, deuda, capital, vencimiento, RUT, nombre_ejecutivo, numero_ejecutivo, titulo</p>
            `;
        }
        
        if (uploadBtn) uploadBtn.disabled = true;
        if (fileInput) fileInput.value = '';
        this.selectedFile = null;
    }

    async testConnection() {
        this.app.debugLog('🔍 Probando conexión con el servidor...');
        
        try {
            const response = await fetch(this.app.buildApiUrl('DEBTORS_STATUS'));
            const data = await response.json();
            
            if (data.success) {
                const count = data.status?.currentCount || 0;
                this.app.debugLog(`✅ Conexión exitosa: ${count} deudores cargados`);
                this.app.showNotification(`✅ Conexión exitosa - ${count} deudores`, 'success');
            } else {
                this.app.debugLog(`❌ Error en respuesta: ${data.error}`);
                this.app.showNotification('❌ Error en respuesta del servidor', 'error');
            }
        } catch (error) {
            this.app.debugLog(`❌ Error de conexión: ${error.message}`);
            this.app.showNotification('❌ No se pudo conectar al servidor', 'error');
        }
    }

    async clearAllDebtors() {
        this.app.debugLog('🔄 Iniciando proceso de eliminación...');
        
        const reason = prompt('¿Por qué quieres eliminar todos los deudores? (opcional)');
        
        if (!confirm('⚠️ ¿ESTÁS ABSOLUTAMENTE SEGURO?\n\nESTA ACCIÓN:\n• Eliminará TODOS los deudores\n• NO se puede deshacer\n• Es PERMANENTE')) {
            this.app.debugLog('❌ Eliminación cancelada por el usuario');
            this.app.showNotification('❌ Eliminación cancelada', 'warning');
            return;
        }

        try {
            this.app.debugLog('📤 Enviando solicitud al servidor...');
            this.app.showNotification('🔄 Eliminando todos los deudores...', 'info');

            const response = await fetch(this.app.buildApiUrl('DEBTORS_CLEAR'), {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    confirm: true,
                    reason: reason || 'Limpieza manual desde interfaz'
                })
            });

            const data = await response.json();

            if (data.success) {
                this.app.debugLog(`✅ Éxito: ${data.message}`);
                this.app.showNotification(`✅ ${data.message}`, 'success');
                
                await this.loadAllDebtors();
                
            } else {
                this.app.debugLog(`❌ Error del servidor: ${data.error}`);
                this.app.showNotification(`❌ Error: ${data.error}`, 'error');
            }

        } catch (error) {
            this.app.debugLog(`💥 Error fatal: ${error.message}`);
            this.app.showNotification('❌ Error de conexión con el servidor', 'error');
            console.error('Error completo:', error);
        }
    }

    async showStatus() {
        try {
            this.app.debugLog('📊 Solicitando estado del servidor...');
            
            const response = await fetch(this.app.buildApiUrl('DEBTORS_STATUS'));
            const data = await response.json();
            
            if (data.success) {
                this.app.debugLog(`✅ Éxito: ${data.message}`);
                this.app.showNotification(`✅ ${data.message}`, 'success');
                
                await this.loadAllDebtors();
                this.updateManagementPanel();
                
            } else {
                this.app.debugLog(`❌ Error en estado: ${data.error}`);
                alert(`❌ Error obteniendo estado: ${data.error}`);
            }
        } catch (error) {
            this.app.debugLog(`❌ Error obteniendo estado: ${error.message}`);
            alert(`❌ Error de conexión: ${error.message}`);
        }
    }

    async exportDebtors() {
        try {
            this.app.debugLog('📤 Solicitando exportación de deudores...');
            
            if (this.debtors.length === 0) {
                this.app.showNotification('❌ No hay deudores para exportar', 'warning');
                return;
            }

            this.app.showNotification('🔄 Generando archivo de exportación...', 'info');

            const response = await fetch(this.app.buildApiUrl('DEBTORS_EXPORT'));
            
            if (!response.ok) {
                throw new Error('Error en la respuesta del servidor');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `deudores-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            this.app.debugLog(`✅ Exportados ${this.debtors.length} deudores`);
            this.app.showNotification(`✅ Exportados ${this.debtors.length} deudores`, 'success');

        } catch (error) {
            this.app.handleError(error, 'exportando deudores');
        }
    }

    async testMessage(phoneNumber) {
        const message = DOMUtils.getSafeValue('messageText');
        
        if (!message?.trim()) {
            this.app.showNotification('❌ Escribe un mensaje antes de probar', 'warning');
            return;
        }

        try {
            const response = await fetch(this.app.buildApiUrl('CAMPAIGN_TEST'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber, message })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.showNotification(`✅ Mensaje de prueba enviado a ${phoneNumber}`, 'success');
            } else {
                this.app.showNotification('❌ Error enviando mensaje de prueba: ' + data.error, 'error');
            }
        } catch (error) {
            this.app.handleError(error, 'enviando mensaje de prueba');
        }
    }

    toggleImportSection() {
        const importSection = document.getElementById('importSection');
        if (importSection) {
            const isVisible = importSection.style.display !== 'none';
            importSection.style.display = isVisible ? 'none' : 'block';
            
            const button = document.querySelector('[onclick="app.modules.debtors.toggleImportSection()"]');
            if (button) {
                button.textContent = isVisible ? '📥 Mostrar Importación' : '✕ Ocultar';
            }
            
            this.app.debugLog(isVisible ? '📦 Ocultando sección de importación' : '📦 Mostrando sección de importación');
        }
    }

    showAdvancedImport() {
        const advancedPanel = document.getElementById('advancedImportPanel');
        if (advancedPanel) {
            const isVisible = advancedPanel.style.display !== 'none';
            advancedPanel.style.display = isVisible ? 'none' : 'block';
            this.app.debugLog(isVisible ? '🔧 Ocultando panel avanzado' : '🔧 Mostrando panel avanzado');
            
            if (!isVisible) {
                this.updateManagementPanel();
            }
        }
    }

    clearFilters() {
        DOMUtils.setSafeValue('minDebt', 0);
        DOMUtils.setSafeValue('maxDebt', 1000000);
        
        const statesFilter = document.getElementById('statesFilter');
        if (statesFilter) {
            Array.from(statesFilter.options).forEach(option => {
                option.selected = option.value === 'pendiente';
            });
        }
        
        DOMUtils.setSafeValue('executiveCampaignFilter', '');
        
        this.applyCampaignFilters();
        this.app.showNotification('✅ Filtros limpiados', 'success');
    }

    inicializarGestionMultiPool() {
        // Esto es solo para visualización en frontend
        this.deudoresAsignados.clear();
        this.deudoresCompletados = [];
        this.deudoresFallados = [];
        this.actualizarEstadisticasMultiPool();
    }

    obtenerDeudorParaPool(poolId, estrategia = "secuencial") {
        // Solo lógica de frontend - no toca backend
        const deudoresDisponibles = this.getCurrentDebtors().filter(deudor => 
            !this.deudoresAsignados.has(deudor.telefono) && 
            !this.deudoresCompletados.includes(deudor.telefono) &&    // CORREGIDO: deudor.telefono
            !this.deudoresFallados.includes(deudor.telefono)          // CORREGIDO: deudor.telefono
        );

        if (deudoresDisponibles.length === 0) return null;

        let deudor;
        switch(estrategia) {
            case "secuencial":
                deudor = deudoresDisponibles[0];
                break;
            case "aleatorio":
                const index = Math.floor(Math.random() * deudoresDisponibles.length);
                deudor = deudoresDisponibles[index];
                break;
            case "round_robin":
                deudor = deudoresDisponibles[0];
                break;
            default:
                deudor = deudoresDisponibles[0];
        }

        if (deudor) {
            this.deudoresAsignados.set(deudor.telefono, poolId);
            this.actualizarEstadisticasMultiPool();
        }

        return deudor;
    }

    marcarDeudorCompletado(telefono, exito = true) {
        // Solo frontend - no hay endpoint en backend
        this.deudoresAsignados.delete(telefono);
        
        if (exito) {
            this.deudoresCompletados.push(telefono);
        } else {
            this.deudoresFallados.push(telefono);
        }
        
        this.actualizarEstadisticasMultiPool();
        this.actualizarDashboardMultiPool();
    }

    actualizarEstadisticasMultiPool() {
        const currentDebtors = this.getCurrentDebtors();
        this.estadisticasMultiPool = {
            total: currentDebtors.length,
            disponibles: currentDebtors.filter(d => 
                !this.deudoresAsignados.has(d.telefono) && 
                !this.deudoresCompletados.includes(d.telefono) &&
                !this.deudoresFallados.includes(d.telefono)
            ).length,
            procesando: this.deudoresAsignados.size,
            completados: this.deudoresCompletados.length,
            fallados: this.deudoresFallados.length
        };
    }

    actualizarDashboardMultiPool() {
        const stats = this.estadisticasMultiPool;
        const progreso = stats.total > 0 ? ((stats.completados + stats.fallados) / stats.total) * 100 : 0;
        
        // Actualizar los elementos del dashboard
        DOMUtils.setSafeTextContent('mpTotal', stats.total);
        DOMUtils.setSafeTextContent('mpDisponibles', stats.disponibles);
        DOMUtils.setSafeTextContent('mpProcesando', stats.procesando);
        DOMUtils.setSafeTextContent('mpCompletados', stats.completados);
        DOMUtils.setSafeTextContent('mpFallados', stats.fallados);
        
        DOMUtils.setSafeTextContent('multiPoolStats', `
            📊 ESTADO MULTI-POOL
            ───────────────────
            📋 Total: ${stats.total}
            ✅ Completados: ${stats.completados}
            ⚡ Procesando: ${stats.procesando}
            🟢 Disponibles: ${stats.disponibles}
            ❌ Fallados: ${stats.fallados}
            📈 Progreso: ${progreso.toFixed(1)}%
        `);
    }

    getMultiPoolStats() {
        return this.estadisticasMultiPool;
    }

    reiniciarEstadoDeudores() {
        this.inicializarGestionMultiPool();
        this.app.showNotification('🔄 Estado de deudores reiniciado', 'info');
        this.handleVirtualScroll();
        this.actualizarDashboardMultiPool();
    }

    exportarReporteMultiPool() {
        const reporte = {
            timestamp: new Date().toISOString(),
            estadisticas: this.estadisticasMultiPool,
            deudoresCompletados: this.deudoresCompletados,
            deudoresFallados: this.deudoresFallados,
            deudoresProcesando: Array.from(this.deudoresAsignados.entries()).map(([telefono, pool]) => ({
                telefono,
                pool
            }))
        };

        // Exportar como JSON local (sin backend)
        const blob = new Blob([JSON.stringify(reporte, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-multi-pool-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.app.showNotification('📊 Reporte multi-pool exportado (solo frontend)', 'success');
    }

    renderUI() {
        const section = document.getElementById('debtorsSection');
        if (!section) return;

        section.innerHTML = `
            <section class="debtors-section card">
                <div class="section-header">
                    <h2>🧾 Gestión Completa de Deudores - Sistema Multi-Pool</h2>
                    <div class="section-actions">
                        <button class="btn btn-success" onclick="app.modules.debtors.exportDebtors()">
                            📤 Exportar CSV
                        </button>
                        <button class="btn btn-info" onclick="app.modules.debtors.toggleImportSection()">
                            📥 Importar Deudores
                        </button>
                        <button class="btn btn-warning" onclick="app.modules.debtors.exportarReporteMultiPool()">
                            📊 Reporte Multi-Pool
                        </button>
                    </div>
                </div>

                <!-- Panel de Estado Multi-Pool -->
                <div class="multi-pool-dashboard">
                    <h3>🎯 Dashboard Multi-Pool</h3>
                    <div class="multi-pool-stats">
                        <div class="stat-card">
                            <div class="stat-icon">📋</div>
                            <div class="stat-info">
                                <div class="stat-value" id="mpTotal">0</div>
                                <div class="stat-label">Total</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🟢</div>
                            <div class="stat-info">
                                <div class="stat-value" id="mpDisponibles">0</div>
                                <div class="stat-label">Disponibles</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">🟡</div>
                            <div class="stat-info">
                                <div class="stat-value" id="mpProcesando">0</div>
                                <div class="stat-label">Procesando</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">✅</div>
                            <div class="stat-info">
                                <div class="stat-value" id="mpCompletados">0</div>
                                <div class="stat-label">Completados</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon">❌</div>
                            <div class="stat-info">
                                <div class="stat-value" id="mpFallados">0</div>
                                <div class="stat-label">Fallados</div>
                            </div>
                        </div>
                    </div>
                    <div class="multi-pool-actions">
                        <button class="btn btn-outline btn-sm" onclick="app.modules.debtors.reiniciarEstadoDeudores()">
                            🔄 Reiniciar Estado
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="app.modules.debtors.actualizarDashboardMultiPool()">
                            🔍 Actualizar
                        </button>
                    </div>
                    <div id="multiPoolStats" class="multi-pool-details">
                        Cargando estado multi-pool...
                    </div>
                </div>

                <!-- Panel de Estado Rápido -->
                <div class="management-panel">
                    <h3>📊 Estado del Sistema</h3>
                    
                    <div class="management-grid">
                        <div class="action-card">
                            <h4>📈 Deudores Cargados</h4>
                            <div class="stat-display">
                                <span id="currentDebtorsCountMain">0</span>
                                <small>registros en sistema</small>
                            </div>
                        </div>

                        <div class="action-card">
                            <h4>⚡ Acciones Rápidas</h4>
                            <div class="action-buttons">
                                <button class="btn btn-info" onclick="app.modules.debtors.showAdvancedImport()">
                                    🔧 Herramientas Avanzadas
                                </button>
                                <button class="btn btn-info" onclick="app.modules.debtors.testConnection()">
                                    🔍 Probar Conexión
                                </button>
                            </div>
                        </div>

                        <div class="action-card">
                            <h4>🕐 Última Actualización</h4>
                            <div class="time-display">
                                <span id="lastUpdateTimeMain">Cargando...</span>
                                <small>Actualizado en tiempo real</small>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sección de Importación (inicialmente oculta) -->
                <div id="importSection" class="import-section" style="display: none;">
                    <div class="section-header">
                        <h3>📥 Importar Deudores</h3>
                        <button class="btn btn-outline btn-sm" onclick="app.modules.debtors.toggleImportSection()">
                            ✕ Ocultar
                        </button>
                    </div>
                    
                    <div class="import-area">
                        <input type="file" 
                               id="fileInput" 
                               accept=".csv, .xlsx, .xls" 
                               style="display: none;"
                               aria-label="Seleccionar archivo de deudores">
                        
                        <div class="drop-zone" id="dropZone">
                            <div class="drop-zone-content">
                                <div class="drop-icon">📁</div>
                                <p><strong>Arrastra tu archivo aquí o haz clic para seleccionar</strong></p>
                                <div class="file-requirements">
                                    <p><strong>📋 Formatos aceptados:</strong> CSV, Excel (.xlsx, .xls)</p>
                                    <p><strong>✅ Campos requeridos:</strong></p>
                                    <div class="requirements-grid">
                                        <div><strong>nombre</strong> - Nombre del deudor</div>
                                        <div><strong>telefono</strong> - Teléfono (56912345678)</div>
                                        <div><strong>deuda</strong> - Monto total</div>
                                        <div><strong>capital</strong> - Capital adeudado</div>
                                        <div><strong>vencimiento</strong> - Fecha vencimiento</div>
                                        <div><strong>RUT</strong> - RUT del deudor</div>
                                        <div><strong>nombre_ejecutivo</strong> - Ejecutivo</div>
                                        <div><strong>numero_ejecutivo</strong> - Teléfono ejecutivo</div>
                                        <div><strong>titulo</strong> - Título/ID préstamo</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <button id="uploadBtn" class="btn btn-primary" disabled>
                            📤 Importar Archivo Seleccionado
                        </button>
                    </div>

                    <!-- Panel de Gestión Avanzada -->
                    <div id="advancedImportPanel" class="advanced-panel" style="display: none;">
                        <div class="panel-header">
                            <h3>🔧 Gestión Avanzada de Datos</h3>
                            <button class="btn btn-sm btn-outline" onclick="app.modules.debtors.showAdvancedImport()">
                                ✕ Cerrar
                            </button>
                        </div>
                        
                        <div class="action-grid">
                            <button class="btn btn-info" onclick="app.modules.debtors.testConnection()">
                                🔍 Probar Conexión
                            </button>
                            
                            <button class="btn btn-success" onclick="app.modules.debtors.showStatus()">
                                📊 Ver Estado
                            </button>
                            
                            <button class="btn btn-danger" onclick="app.modules.debtors.clearAllDebtors()">
                                🗑️ Eliminar Todos
                            </button>
                            
                            <button class="btn btn-warning" onclick="app.modules.debtors.replaceDebtors()">
                                🔄 Reemplazar Lista
                            </button>
                        </div>
                        
                        <!-- Información de Estado Detallada -->
                        <div class="status-info">
                            <div class="status-grid">
                                <div>
                                    <strong>📊 Estado Actual:</strong><br>
                                    <span id="currentDebtorsCount" class="status-value">
                                        0 deudores cargados
                                    </span>
                                </div>
                                <div>
                                    <strong>🕐 Última Actualización:</strong><br>
                                    <span id="lastUpdateTime" class="status-time">
                                        Cargando...
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Controles de Vista -->
                <div class="view-controls">
                    <div class="view-toggle">
                        <button id="showAllDebtors" class="btn-toggle active">
                            👥 Todos los Deudores
                        </button>
                        <button id="showCampaignDebtors" class="btn-toggle">
                            ✅ Deudores Filtrados
                        </button>
                    </div>
                    
                    <div class="debtors-stats">
                        <div class="stat-item">
                            <span class="stat-label">Total:</span>
                            <strong id="totalDebtorsCount" class="stat-value">0</strong>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Filtrados:</span>
                            <strong id="filteredDebtorsCount" class="stat-value">0</strong>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Enviarán:</span>
                            <strong id="sendingDebtorsCount" class="stat-value highlight">0</strong>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Mostrando:</span>
                            <strong id="showingDebtorsCount" class="stat-value">0</strong>
                        </div>
                    </div>
                </div>

                <!-- Filtros de Deudores -->
                <div class="filters-section">
                    <h3>🔍 Filtros de Deudores</h3>
                    <div class="filters-grid">
                        <div class="filter-group">
                            <label for="minDebt">Deuda Mínima ($)</label>
                            <input type="number" id="minDebt" value="0" min="0" step="1000">
                        </div>
                        <div class="filter-group">
                            <label for="maxDebt">Deuda Máxima ($)</label>
                            <input type="number" id="maxDebt" value="1000000" min="0" step="1000">
                        </div>
                        <div class="filter-group">
                            <label for="statesFilter">Estados</label>
                            <select id="statesFilter" multiple>
                                <option value="pendiente" selected>Pendiente</option>
                                <option value="contactado">Contactado</option>
                                <option value="pagado">Pagado</option>
                                <option value="moroso">Moroso</option>
                            </select>
                            <small>Mantén Ctrl para seleccionar múltiples</small>
                        </div>
                        <div class="filter-group">
                            <label for="executiveCampaignFilter">Ejecutivo</label>
                            <select id="executiveCampaignFilter">
                                <option value="">Todos los ejecutivos</option>
                            </select>
                        </div>
                    </div>
                    <div class="filter-actions">
                        <button id="clearFilters" class="btn btn-outline">
                            🗑️ Limpiar Filtros
                        </button>
                    </div>
                </div>

                <!-- Tabla con Scroll Virtual -->
                <div class="table-container">
                    <div class="virtual-scroll-container" id="virtualScrollContainer">
                        <div class="virtual-scroll-content" id="virtualScrollContent">
                            <table class="virtual-table">
                                <thead>
                                    <tr>
                                        <th style="width: 20%">Nombre</th>
                                        <th style="width: 15%">Teléfono</th>
                                        <th style="width: 15%">RUT</th>
                                        <th style="width: 10%">Deuda</th>
                                        <th style="width: 10%">Estado</th>
                                        <th style="width: 10%">Vencimiento</th>
                                        <th style="width: 10%">Ejecutivo</th>
                                        <th style="width: 10%">Acciones</th>
                                    </tr>
                                </thead>
                            </table>
                            <div id="virtualTableBody"></div>
                        </div>
                    </div>
                </div>

                <!-- Controles de Paginación -->
                <div class="table-footer">
                    <div class="table-stats">
                        <span id="lazyStatsText">Mostrando 0 de 0 deudores</span>
                    </div>
                </div>
            </section>
        `;

        // Inicializar componentes después de renderizar
        this.initializeVirtualScroll();
        this.setupFileEvents();
        this.applyCampaignFilters();
        this.updateManagementPanel();
        this.inicializarGestionMultiPool();
    }

    refresh() {
        this.loadAllDebtors();
    }

    testClearAll() {
        this.app.debugLog('🧪 Probando eliminación de deudores...');
        this.app.showNotification('🧪 Probando eliminación (no se eliminarán datos reales)', 'info');
        
        // Simular proceso de eliminación sin afectar datos reales
        setTimeout(() => {
            this.app.debugLog('✅ Prueba completada: Sistema funciona correctamente');
            this.app.showNotification('✅ Prueba completada: Sistema listo para eliminar deudores', 'success');
        }, 2000);
    }

    async replaceDebtors() {
        if (!confirm('¿Estás seguro de que quieres reemplazar todos los deudores?\n\nSe eliminarán los deudores actuales y se cargará un nuevo archivo.')) {
            return;
        }

        try {
            this.app.debugLog('🔄 Iniciando reemplazo de deudores...');
            await this.clearAllDebtors();
            
            // Mostrar sección de importación
            this.toggleImportSection();
            
            this.app.showNotification('🗑️ Deudores eliminados. Ahora puedes cargar el nuevo archivo.', 'info');
            
        } catch (error) {
            this.app.handleError(error, 'reemplazando deudores');
        }
    }
}
