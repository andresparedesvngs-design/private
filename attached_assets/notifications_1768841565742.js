class NotificationSystem {
    constructor() {
        this.container = null;
        this.initialize();
    }

    initialize() {
        this.createContainer();
        this.ensureStyles();
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'notifications-container';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
        `;
        document.body.appendChild(this.container);
    }

    ensureStyles() {
        if (!document.querySelector('#notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                .notification {
                    background: var(--bg-primary);
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    animation: slideInRight 0.3s ease;
                    overflow: hidden;
                    border: 1px solid var(--border-color);
                }
                .notification.success { border-left: 4px solid var(--success-color); }
                .notification.error { border-left: 4px solid var(--error-color); }
                .notification.warning { border-left: 4px solid var(--warning-color); }
                .notification.info { border-left: 4px solid var(--info-color); }
                .notification-content {
                    padding: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    min-width: 300px;
                }
                .notification-message {
                    flex: 1;
                    font-size: 14px;
                    line-height: 1.4;
                    color: var(--text-primary);
                }
                .notification-close {
                    background: none;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    margin-left: 16px;
                    color: var(--text-muted);
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .notification-close:hover {
                    color: var(--text-primary);
                }
                @keyframes slideInRight {
                    from { 
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to { 
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOutRight {
                    from { 
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to { 
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(styles);
        }
    }

    show(message, type = 'info', duration = 5000) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
            </div>
        `;

        this.container.appendChild(notification);

        // Auto-remove después de la duración
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideOutRight 0.3s ease';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }
            }, duration);
        }

        return notification;
    }

    success(message, duration = 5000) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 5000) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }

    clearAll() {
        this.container.innerHTML = '';
    }
}

// Inicializar sistema de notificaciones global
window.notifications = new NotificationSystem();