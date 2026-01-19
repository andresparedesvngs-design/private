class ModalSystem {
    constructor() {
        this.modals = new Map();
        this.initialize();
    }

    initialize() {
        this.ensureStyles();
        this.setupGlobalListeners();
    }

    ensureStyles() {
        if (!document.querySelector('#modal-styles')) {
            const styles = document.createElement('style');
            styles.id = 'modal-styles';
            styles.textContent = `
                .modal {
                    display: none;
                    position: fixed;
                    z-index: 10000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    animation: fadeIn 0.3s ease;
                }
                .modal-content {
                    background-color: var(--bg-primary);
                    margin: 5% auto;
                    padding: 0;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 500px;
                    position: relative;
                    animation: slideInDown 0.3s ease;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    border: 1px solid var(--border-color);
                }
                .modal-header {
                    padding: 20px 24px 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .modal-header h3 {
                    margin: 0;
                    color: var(--text-primary);
                    font-size: 20px;
                }
                .modal-close {
                    background: none;
                    border: none;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                    color: var(--text-muted);
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .modal-close:hover {
                    color: var(--text-primary);
                }
                .modal-body {
                    padding: 20px 24px;
                    max-height: 70vh;
                    overflow-y: auto;
                    color: var(--text-primary);
                }
                .modal-footer {
                    padding: 0 24px 20px;
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideInDown {
                    from {
                        transform: translateY(-50px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                .qr-container {
                    text-align: center;
                    margin: 20px 0;
                }
                .qr-instructions {
                    background: var(--bg-secondary);
                    padding: 16px;
                    border-radius: 8px;
                    margin-top: 20px;
                    text-align: left;
                }
                .qr-instructions h4 {
                    margin-top: 0;
                    color: var(--text-primary);
                }
                .qr-instructions ol {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                .qr-instructions li {
                    margin-bottom: 8px;
                    color: var(--text-secondary);
                }
                .status-info {
                    padding: 12px;
                    border-radius: 6px;
                    text-align: center;
                    font-weight: 600;
                    margin-top: 15px;
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                }
                .qr-info {
                    margin-top: 15px;
                    text-align: left;
                }
                .qr-info p {
                    margin: 5px 0;
                    color: var(--text-secondary);
                }
            `;
            document.head.appendChild(styles);
        }
    }

    setupGlobalListeners() {
        // Cerrar modal al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.close(e.target.id);
            }
        });

        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAll();
            }
        });
    }

    create(id, title, content, footer = '') {
        // Eliminar modal existente si hay uno
        if (this.modals.has(id)) {
            this.remove(id);
        }

        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="modals.close('${id}')">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
            </div>
        `;

        document.body.appendChild(modal);
        this.modals.set(id, modal);
        
        return modal;
    }

    show(id) {
        const modal = this.modals.get(id) || document.getElementById(id);
        if (modal) {
            modal.style.display = 'block';
            // Enfocar el modal
            setTimeout(() => {
                const closeBtn = modal.querySelector('.modal-close');
                if (closeBtn) closeBtn.focus();
            }, 100);
        }
    }

    close(id) {
        const modal = this.modals.get(id) || document.getElementById(id);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    closeAll() {
        this.modals.forEach(modal => {
            modal.style.display = 'none';
        });
        // También cerrar modales no gestionados por esta clase
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }

    remove(id) {
        const modal = this.modals.get(id);
        if (modal && modal.parentNode) {
            modal.parentNode.removeChild(modal);
            this.modals.delete(id);
        }
    }

    // Método específico para QR
 showQR(sessionId, phoneNumber, qrCode) {
    const modalId = 'qrModal';
    const content = `
        <div class="qr-container" id="qrCodeContainer">
            <div class="qr-loading">🔄 Generando código QR...</div>
        </div>
        <div class="qr-instructions">
            <h4>📋 Instrucciones:</h4>
            <ol>
                <li>Abre WhatsApp en tu teléfono</li>
                <li>Ve a <strong>Menú → Dispositivos vinculados</strong></li>
                <li>Selecciona <strong>"Vincular un dispositivo"</strong></li>
                <li>Escanea el código QR que aparece arriba</li>
            </ol>
        </div>
        <p id="sessionStatus" class="status-info">⏳ Preparando código QR...</p>
    `;

    this.create(modalId, '📱 Escanear Código QR', content);
    this.show(modalId);

    // Generar QR
    this.generateQRCode('qrCodeContainer', sessionId, phoneNumber, qrCode);
}

    generateQRCode(containerId, sessionId, phoneNumber, qr) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (typeof QRCode !== 'undefined') {
            this.generateQRWithLibrary(container, sessionId, phoneNumber, qr);
        } else {
            this.generateQRFallback(container, sessionId, phoneNumber, qr);
        }
    }

    generateQRWithLibrary(container, sessionId, phoneNumber, qr) {
        try {
            container.innerHTML = '';
            const canvas = document.createElement('canvas');
            container.appendChild(canvas);
            
            QRCode.toCanvas(canvas, qr, {
                width: 256,
                height: 256,
                margin: 2,
                color: { dark: '#000000', light: '#FFFFFF' },
                errorCorrectionLevel: 'H'
            }, (err) => {
                if (err) {
                    console.error('❌ Error generando QR:', err);
                    this.generateQRFallback(container, sessionId, phoneNumber, qr);
                    return;
                }
                
                this.showQRSuccess(container, phoneNumber);
            });
        } catch (error) {
            console.error('❌ Error en generación QR:', error);
            this.generateQRFallback(container, sessionId, phoneNumber, qr);
        }
    }

    generateQRFallback(container, sessionId, phoneNumber, qr) {
        const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&format=png&data=${encodeURIComponent(qr)}&margin=10`;
        
        container.innerHTML = `
            <div style="text-align: center;">
                <img src="${qrImageUrl}" 
                     alt="Código QR WhatsApp" 
                     style="max-width: 100%; border: 1px solid var(--border-color); border-radius: 8px;"
                     onload="console.log('✅ QR cargado exitosamente')"
                     onerror="this.parentElement.innerHTML='<p style=\"color: var(--text-primary)\">❌ Error cargando QR</p><p style=\"color: var(--text-secondary)\">Recarga la página o usa el método alternativo</p>'">
                <div style="margin-top: 15px; text-align: left; color: var(--text-primary);">
                    <p><strong>Número:</strong> ${Helpers.escapeHtml(phoneNumber)}</p>
                    <p><strong>Instrucciones:</strong></p>
                    <ul style="font-size: 12px; margin: 0; padding-left: 20px; color: var(--text-secondary);">
                        <li>Abre WhatsApp en tu teléfono</li>
                        <li>Menú → Dispositivos vinculados</li>
                        <li>"Vincular un dispositivo"</li>
                        <li>Escanea este código QR</li>
                    </ul>
                </div>
            </div>
        `;
        
        const statusInfo = document.getElementById('sessionStatus');
        if (statusInfo) {
            statusInfo.textContent = '⏳ Cargando código QR...';
        }
    }

    showQRSuccess(container, phoneNumber) {
        const infoDiv = document.createElement('div');
        infoDiv.className = 'qr-info';
        infoDiv.innerHTML = `
            <p><strong>Número:</strong> ${Helpers.escapeHtml(phoneNumber)}</p>
            <p><strong>Estado:</strong> <span style="color: var(--success-color);">● Esperando escaneo</span></p>
            <p style="font-size: 12px; color: var(--text-muted);">
                Escanea este código con WhatsApp Web
            </p>
        `;
        container.appendChild(infoDiv);
        
        const statusInfo = document.getElementById('sessionStatus');
        if (statusInfo) {
            statusInfo.textContent = '✅ Código QR listo - Escanea con WhatsApp';
            statusInfo.style.background = 'var(--success-bg)';
            statusInfo.style.color = 'var(--success-color)';
        }
    }
}

// Inicializar sistema de modales global
window.modals = new ModalSystem();