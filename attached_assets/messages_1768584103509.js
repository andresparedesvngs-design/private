const express = require('express');
const router = express.Router();

// ===== ALMACENAMIENTO EN MEMORIA =====
let conversations = new Map(); // { phoneNumber: { messages: [], unread: boolean, lastUpdate: Date } }

// ===== MIDDLEWARES =====
const validatePhoneNumber = (req, res, next) => {
  const { phoneNumber } = req.params;
  if (!phoneNumber || phoneNumber.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'phoneNumber es requerido'
    });
  }
  next();
};

// ===== RUTAS DE CONVERSACIONES =====

// Obtener todas las conversaciones
router.get('/conversations', (req, res) => {
  try {
    const { filter = 'all', search = '' } = req.query;
    
    let conversationList = Array.from(conversations.entries()).map(([phoneNumber, data]) => ({
      phoneNumber,
      lastMessage: data.messages[data.messages.length - 1],
      unread: data.unread,
      messageCount: data.messages.length,
      lastUpdate: data.lastUpdate
    }));

    // Aplicar filtros
    if (filter === 'unread') {
      conversationList = conversationList.filter(conv => conv.unread);
    } else if (filter === 'read') {
      conversationList = conversationList.filter(conv => !conv.unread);
    }

    // Aplicar búsqueda
    if (search) {
      conversationList = conversationList.filter(conv => 
        conv.phoneNumber.includes(search) ||
        (conv.lastMessage && conv.lastMessage.body.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Ordenar por última actualización
    conversationList.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));

    res.json({
      success: true,
      conversations: conversationList,
      total: conversationList.length,
      unreadCount: conversationList.filter(conv => conv.unread).length
    });
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener mensajes de una conversación específica
router.get('/conversations/:phoneNumber', validatePhoneNumber, (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const conversation = conversations.get(phoneNumber);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró la conversación'
      });
    }

    // Marcar como leído al abrir
    conversation.unread = false;

    res.json({
      success: true,
      conversation: {
        phoneNumber,
        messages: conversation.messages,
        unread: conversation.unread,
        lastUpdate: conversation.lastUpdate
      }
    });
  } catch (error) {
    console.error('Error obteniendo conversación:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Enviar mensaje a una conversación
router.post('/conversations/:phoneNumber/send', validatePhoneNumber, async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { message, sessionId } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'El mensaje no puede estar vacío'
      });
    }

    // Usar WhatsAppManager para enviar el mensaje
    const WhatsAppManager = require('../services/whatsappManager');
    
    let finalSessionId = sessionId;
    if (!finalSessionId) {
      const activeSessions = WhatsAppManager.getActiveSessions();
      if (activeSessions.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No hay sesiones activas disponibles'
        });
      }
      finalSessionId = activeSessions[0].sessionId;
    }

    const result = await WhatsAppManager.sendMessage(finalSessionId, phoneNumber, message);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

    // Guardar en el historial
    const newMessage = {
      id: result.messageId,
      body: message,
      type: 'outgoing',
      timestamp: new Date().toISOString(),
      status: 'sent'
    };

    if (!conversations.has(phoneNumber)) {
      conversations.set(phoneNumber, {
        messages: [],
        unread: false,
        lastUpdate: new Date()
      });
    }

    const conversation = conversations.get(phoneNumber);
    conversation.messages.push(newMessage);
    conversation.lastUpdate = new Date();

    // Emitir evento de nuevo mensaje
    const io = req.app.get('io');
    io.emit('new_message', {
      phoneNumber,
      message: newMessage,
      conversation: {
        lastMessage: newMessage,
        unread: false,
        messageCount: conversation.messages.length,
        lastUpdate: conversation.lastUpdate
      }
    });

    res.json({
      success: true,
      message: 'Mensaje enviado correctamente',
      data: result
    });

  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Marcar conversación como leída/no leída
router.patch('/conversations/:phoneNumber/read', validatePhoneNumber, (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { read } = req.body;

    const conversation = conversations.get(phoneNumber);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró la conversación'
      });
    }

    conversation.unread = !read;

    res.json({
      success: true,
      message: `Conversación marcada como ${read ? 'leída' : 'no leída'}`
    });
  } catch (error) {
    console.error('Error actualizando estado de lectura:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Eliminar conversación
router.delete('/conversations/:phoneNumber', validatePhoneNumber, (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    if (conversations.has(phoneNumber)) {
      conversations.delete(phoneNumber);
      res.json({
        success: true,
        message: 'Conversación eliminada correctamente'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No se encontró la conversación'
      });
    }
  } catch (error) {
    console.error('Error eliminando conversación:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== WEBHOOK PARA MENSAJES ENTRANTES =====

// Endpoint para recibir mensajes entrantes desde WhatsAppManager
router.post('/webhook/incoming', (req, res) => {
  try {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({
        success: false,
        error: 'phoneNumber y message son requeridos'
      });
    }

    // Guardar mensaje entrante
    if (!conversations.has(phoneNumber)) {
      conversations.set(phoneNumber, {
        messages: [],
        unread: true,
        lastUpdate: new Date()
      });
    }

    const conversation = conversations.get(phoneNumber);
    const newMessage = {
      id: message.id || Date.now().toString(),
      body: message.body,
      type: 'incoming',
      timestamp: new Date().toISOString(),
      status: 'received'
    };

    conversation.messages.push(newMessage);
    conversation.unread = true;
    conversation.lastUpdate = new Date();

    // Emitir evento de nuevo mensaje
    const io = req.app.get('io');
    io.emit('new_message', {
      phoneNumber,
      message: newMessage,
      conversation: {
        lastMessage: newMessage,
        unread: true,
        messageCount: conversation.messages.length,
        lastUpdate: conversation.lastUpdate
      }
    });

    res.json({
      success: true,
      message: 'Mensaje recibido correctamente'
    });

  } catch (error) {
    console.error('Error procesando mensaje entrante:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== ESTADÍSTICAS =====
router.get('/stats', (req, res) => {
  try {
    const totalConversations = conversations.size;
    const unreadCount = Array.from(conversations.values()).filter(conv => conv.unread).length;
    const totalMessages = Array.from(conversations.values()).reduce((sum, conv) => sum + conv.messages.length, 0);

    res.json({
      success: true,
      stats: {
        totalConversations,
        unreadCount,
        totalMessages,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;