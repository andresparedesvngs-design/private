
class ChatManager {
    constructor(app) {
        this.app = app;
        this.chats = [];
        this.currentChat = null;
        this.messages = new Map(); // Almacena mensajes por conversación
        
        // Quitamos la llamada automática a initialize desde el constructor
    }

    async initialize() {
        await this.loadChats();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.renderUI(); // Asegurar que se renderice la UI al inicializar
    }

    setupEventListeners() {
        // Botones de chat
        DOMUtils.addEventDelegate('#refreshChats', 'click', () => {
            this.refreshChats();
        });

        DOMUtils.addEventDelegate('#exportChatsBtn', 'click', () => {
            this.exportChats();
        });

        // Filtros de chat
        DOMUtils.addEventDelegate('#chatFilter', 'change', () => {
            this.filterChats();
        });

        DOMUtils.addEventDelegate('#chatSearch', 'input', Debounce.debounce(() => {
            this.searchChats();
        }, 500));

        // Acciones de chat
        DOMUtils.addEventDelegate('#markReadBtn', 'click', () => {
            this.markAsRead();
        });

        DOMUtils.addEventDelegate('#deleteChatBtn', 'click', () => {
            this.deleteConversation();
        });

        DOMUtils.addEventDelegate('#sendReplyBtn', 'click', () => {
            this.sendReply();
        });

        // Enter para enviar mensaje
        const replyMessage = document.getElementById('replyMessage');
        if (replyMessage) {
            replyMessage.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendReply();
                }
            });
        }

        // Auto-expand textarea
        DOMUtils.addEventDelegate('#replyMessage', 'input', (e) => {
            this.autoExpandTextarea(e.target);
        });
    }

    setupSocketListeners() {
        this.app.socket.on('new_message', (data) => this.handleNewMessage(data));
        this.app.socket.on('message_sent', (data) => this.handleMessageSent(data));
    }

    autoExpandTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    async loadChats() {
        try {
            const filter = DOMUtils.getSafeSelectValue('chatFilter', 'all');
            const search = DOMUtils.getSafeValue('chatSearch', '');
            
            const params = new URLSearchParams();
            if (filter !== 'all') params.append('filter', filter);
            if (search) params.append('search', search);

            // USAR ENDPOINT REAL
            const response = await fetch(`${this.app.buildApiUrl('MESSAGES_CONVERSATIONS')}?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.chats = data.conversations;
                this.renderChats();
                this.updateChatStats(data.total, data.unreadCount);
            }
        } catch (error) {
            this.app.handleError(error, 'cargando chats');
        }
    }

    renderChats() {
        const container = document.getElementById('conversationsContainer');
        if (!container) return;
        
        if (this.chats.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <p>No hay conversaciones</p>
                    <small>Los mensajes recibidos aparecerán aquí</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.chats.map(chat => `
            <div class="conversation-item ${chat.unread ? 'unread' : ''} ${this.currentChat === chat.phoneNumber ? 'active' : ''}" 
                 onclick="app.modules.chat.selectChat('${chat.phoneNumber}')">
                <div class="conversation-avatar">${Helpers.getInitial(chat.phoneNumber)}</div>
                <div class="conversation-meta">
                    <div class="conversation-header">
                        <span class="contact-number">${Helpers.escapeHtml(Helpers.formatPhoneNumber(chat.phoneNumber))}</span>
                        <span class="conversation-time">${Helpers.formatTime(chat.lastUpdate)}</span>
                    </div>
                    <div class="conversation-preview">
                        ${Helpers.escapeHtml(chat.lastMessage?.body || 'Sin mensajes')}
                    </div>
                </div>
                ${chat.unread ? '<div class="unread-badge">NUEVO</div>' : ''}
            </div>
        `).join('');
    }

    updateChatStats(total, unread) {
        DOMUtils.setSafeTextContent('totalChats', `${total} chats`);
        DOMUtils.setSafeTextContent('unreadChats', `${unread} no leídos`);
        DOMUtils.setSafeTextContent('conversationsCount', total);
    }

    async selectChat(phoneNumber) {
        try {
            this.currentChat = phoneNumber;
            
            // USAR ENDPOINT REAL
            const response = await fetch(this.app.buildApiUrl('MESSAGES_CONVERSATION', { phoneNumber }));
            const data = await response.json();
            
            if (data.success) {
                this.renderChat(data.conversation);
                this.enableChatActions(true);
                this.updateSessionsDropdown();
            }
        } catch (error) {
            this.app.handleError(error, 'seleccionando chat');
        }
    }

    renderChat(conversation) {
        const container = document.getElementById('messagesContainer');
        const composer = document.getElementById('messageComposer');
        const avatar = document.getElementById('currentContactAvatar');
        
        if (!container || !composer || !avatar) return;
        
        // Actualizar información del contacto
        DOMUtils.setSafeTextContent('currentContact', Helpers.formatPhoneNumber(conversation.phoneNumber));
        DOMUtils.setSafeTextContent('contactInfo', `${conversation.messages.length} mensajes • Última actividad: ${Helpers.formatTime(conversation.lastUpdate)}`);
        DOMUtils.setSafeTextContent('replyToContact', Helpers.formatPhoneNumber(conversation.phoneNumber));
        
        // Actualizar avatar
        avatar.textContent = Helpers.getInitial(conversation.phoneNumber);
        
        // Renderizar mensajes
        if (conversation.messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">💬</div>
                    <h4>No hay mensajes</h4>
                    <p>Envía un mensaje para iniciar la conversación</p>
                </div>
            `;
        } else {
            container.innerHTML = conversation.messages.map(msg => `
                <div class="message ${msg.type === 'incoming' ? 'incoming' : 'outgoing'}">
                    <div class="message-header">
                        <span class="message-sender">${msg.type === 'incoming' ? Helpers.formatPhoneNumber(conversation.phoneNumber) : 'Tú'}</span>
                        <span class="message-time">${Helpers.formatTime(msg.timestamp)}</span>
                    </div>
                    <div class="message-body">${Helpers.escapeHtml(msg.body)}</div>
                    <div class="message-status">${msg.status || 'enviado'}</div>
                </div>
            `).join('');
            
            // Scroll al final
            container.scrollTop = container.scrollHeight;
        }
        
        // Mostrar composer
        composer.style.display = 'block';
        const emptyChatState = document.getElementById('emptyChatState');
        if (emptyChatState) emptyChatState.style.display = 'none';
    }

    enableChatActions(enabled) {
        const markReadBtn = document.getElementById('markReadBtn');
        const deleteChatBtn = document.getElementById('deleteChatBtn');
        const sendReplyBtn = document.getElementById('sendReplyBtn');
        
        if (markReadBtn) markReadBtn.disabled = !enabled;
        if (deleteChatBtn) deleteChatBtn.disabled = !enabled;
        if (sendReplyBtn) sendReplyBtn.disabled = !enabled;
    }

    updateSessionsDropdown() {
        const dropdown = document.getElementById('replySession');
        if (!dropdown) return;
        
        const activeSessions = this.app.modules.whatsapp?.getConnectedSessions() || [];
        
        dropdown.innerHTML = '<option value="">Sesión automática</option>' +
            activeSessions.map(session => 
                `<option value="${session.sessionId}">${session.phoneNumber}</option>`
            ).join('');
    }

    async sendReply() {
        const messageInput = document.getElementById('replyMessage');
        const sessionSelect = document.getElementById('replySession');
        
        if (!messageInput || !sessionSelect) return;
        
        const message = messageInput.value.trim();
        const sessionId = sessionSelect.value;
        
        if (!message) {
            this.app.showNotification('❌ Escribe un mensaje', 'warning');
            return;
        }
        
        if (!this.currentChat) {
            this.app.showNotification('❌ Selecciona una conversación', 'warning');
            return;
        }
        
        try {
            // USAR ENDPOINT REAL
            const response = await fetch(this.app.buildApiUrl('MESSAGES_SEND', { phoneNumber: this.currentChat }), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, sessionId })
            });
            
            const data = await response.json();
            
            if (data.success) {
                messageInput.value = '';
                messageInput.style.height = 'auto';
                this.app.showNotification('✅ Mensaje enviado', 'success');
                await this.selectChat(this.currentChat); // Recargar la conversación
                await this.loadChats(); // Actualizar la lista
            } else {
                this.app.showNotification('❌ Error enviando mensaje: ' + data.error, 'error');
            }
        } catch (error) {
            this.app.handleError(error, 'enviando mensaje');
        }
    }

    async markAsRead() {
        if (!this.currentChat) return;
        
        try {
            const response = await fetch(`/api/messages/conversations/${this.currentChat}/read`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ read: true })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.showNotification('✅ Conversación marcada como leída', 'success');
                await this.loadChats();
            }
        } catch (error) {
            this.app.handleError(error, 'marcando como leído');
        }
    }

    async deleteConversation() {
        if (!this.currentChat) return;
        
        if (!confirm(`¿Estás seguro de que quieres eliminar la conversación con ${this.currentChat}?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/messages/conversations/${this.currentChat}`, {
                method: 'DELETE'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.app.showNotification('✅ Conversación eliminada', 'success');
                this.currentChat = null;
                this.enableChatActions(false);
                const composer = document.getElementById('messageComposer');
                const emptyChatState = document.getElementById('emptyChatState');
                if (composer) composer.style.display = 'none';
                if (emptyChatState) emptyChatState.style.display = 'block';
                await this.loadChats();
            }
        } catch (error) {
            this.app.handleError(error, 'eliminando conversación');
        }
    }

    async refreshChats() {
        await this.loadChats();
        this.app.showNotification('🔄 Chats actualizados', 'info');
    }

    async filterChats() {
        await this.loadChats();
    }

    async searchChats() {
        await this.loadChats();
    }

    async exportChats() {
        try {
            const response = await fetch('/api/messages/conversations?filter=all');
            const data = await response.json();
            
            if (!data.success || data.conversations.length === 0) {
                this.app.showNotification('❌ No hay conversaciones para exportar', 'warning');
                return;
            }
            
            let csv = 'Teléfono,Último Mensaje,Estado,Mensajes,Última Actualización\n';
            
            data.conversations.forEach(chat => {
                const row = [
                    `"${chat.phoneNumber}"`,
                    `"${(chat.lastMessage?.body || '').replace(/"/g, '""')}"`,
                    `"${chat.unread ? 'No leído' : 'Leído'}"`,
                    chat.messageCount,
                    `"${new Date(chat.lastUpdate).toLocaleString()}"`
                ].join(',');
                csv += row + '\n';
            });
            
            const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `chats-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.app.showNotification(`✅ Exportadas ${data.conversations.length} conversaciones`, 'success');
            
        } catch (error) {
            this.app.handleError(error, 'exportando chats');
        }
    }

    // ============ MANEJO DE SOCKETS ============
    handleNewMessage(data) {
        this.app.debugLog('💬 Nuevo mensaje recibido:', data);
        
        // Actualizar la lista de chats
        this.loadChats();
        
        // Si el mensaje es para la conversación actual, actualizarla
        if (this.currentChat === data.phoneNumber) {
            this.selectChat(this.currentChat);
        }
        
        // Mostrar notificación para mensajes no leídos
        if (data.conversation && data.conversation.unread) {
            this.app.showNotification(`📩 Nuevo mensaje de ${data.phoneNumber}`, 'info');
        }
    }

    handleMessageSent(data) {
        this.app.debugLog('✅ Mensaje enviado:', data);
        if (this.currentChat === data.to) {
            this.selectChat(this.currentChat); // Recargar la conversación
        }
    }

    // ============ RENDERIZADO DE UI ============
    renderUI() {
        const section = document.getElementById('chatSection');
        if (!section) return;

        section.innerHTML = `
            <section class="chat-global-section card">
                <div class="section-header">
                    <h2>💬 Chat Global - Mensajes Recibidos</h2>
                    <div class="section-actions">
                        <button class="btn btn-info" id="refreshChats">
                            🔄 Actualizar
                        </button>
                        <button class="btn btn-success" id="exportChatsBtn">
                            📤 Exportar Chats
                        </button>
                    </div>
                </div>

                <!-- Filtros y Búsqueda -->
                <div class="chat-filters">
                    <div class="filter-group">
                        <label for="chatFilter">Filtrar:</label>
                        <select id="chatFilter">
                            <option value="all">Todos los chats</option>
                            <option value="unread">No leídos</option>
                            <option value="read">Leídos</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="chatSearch">Buscar:</label>
                        <input type="text" 
                               id="chatSearch" 
                               placeholder="Buscar por número o mensaje...">
                    </div>

                    <div class="chat-stats">
                        <span class="stat-badge total" id="totalChats">0 chats</span>
                        <span class="stat-badge unread" id="unreadChats">0 no leídos</span>
                    </div>
                </div>

                <div class="chat-container">
                    <!-- Lista de Conversaciones -->
                    <div class="conversations-list">
                        <div class="list-header">
                            <h3>Conversaciones</h3>
                            <span id="conversationsCount">0</span>
                        </div>
                        <div id="conversationsContainer" class="conversations-container">
                            <!-- Las conversaciones se cargarán aquí -->
                        </div>
                    </div>

                    <!-- Área de Chat -->
                    <div class="chat-area">
                        <div class="chat-header" id="chatHeader">
                            <div class="conversation-avatar" id="currentContactAvatar">?</div>
                            <div class="selected-contact">
                                <h4 id="currentContact">Selecciona una conversación</h4>
                                <span id="contactInfo" class="contact-info">En línea</span>
                            </div>
                            <div class="chat-actions">
                                <button class="btn btn-sm btn-outline" id="markReadBtn" disabled>
                                    📌
                                </button>
                                <button class="btn btn-sm btn-danger" id="deleteChatBtn" disabled>
                                    🗑️
                                </button>
                            </div>
                        </div>

                        <div class="messages-container" id="messagesContainer">
                            <div class="empty-state" id="emptyChatState">
                                <div class="empty-icon">💬</div>
                                <h4>No hay conversación seleccionada</h4>
                                <p>Selecciona una conversación de la lista para ver los mensajes</p>
                            </div>
                            <!-- Los mensajes se cargarán aquí -->
                        </div>

                        <div class="message-composer" id="messageComposer" style="display: none;">
                            <div class="composer-header">
                                <span>Responder a: <strong id="replyToContact"></strong></span>
                            </div>
                            <div class="composer-input">
                                <textarea id="replyMessage" 
                                          placeholder="Escribe tu respuesta..." 
                                          rows="1"></textarea>
                                <button class="btn btn-primary" id="sendReplyBtn">
                                    📤
                                </button>
                            </div>
                            <div class="composer-options">
                                <select id="replySession" class="session-selector">
                                    <option value="">Sesión automática</option>
                                </select>
                                <small>Selecciona la sesión WhatsApp para enviar</small>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        `;

        // Configurar event listeners después de crear la UI
        this.setupEventListeners();
        // Renderizar chats después de crear la UI
        this.renderChats();
    }

    refresh() {
        this.loadChats();
        this.renderUI();
    }
}
