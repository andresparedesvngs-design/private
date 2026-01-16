const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

class AppServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = this.setupSocketIO();
    this.port = process.env.PORT || 3000;
    
    this.initializeServer();
  }

  setupSocketIO() {
    return socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
  }

  initializeServer() {
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWhatsAppManager();
    this.setupSocketHandlers();

    // 🔥 NUEVO: Integración CleanupService + WhatsAppManager
    this.setupServiceIntegrations();

    this.startServer();
  }

  setupMiddleware() {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      message: 'Demasiadas solicitudes desde esta IP'
    });

    this.app.use(limiter);
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    this.app.use(express.static(path.join(__dirname, '../frontend')));
    this.app.use('/qrcode', express.static(path.join(__dirname, '../node_modules/qrcode/build')));
  }

  setupRoutes() {
    const routesPath = path.join(__dirname, 'routes');
    
    try {
      const debtorsRouter = require(path.join(routesPath, 'debtors'));
      const campaignRouter = require(path.join(routesPath, 'campaign'));
      const whatsappRouter = require(path.join(routesPath, 'whatsapp'));
      const messagesRouter = require(path.join(routesPath, 'messages'));

      this.app.use('/api/debtors', debtorsRouter);
      this.app.use('/api/campaign', campaignRouter);
      this.app.use('/api/whatsapp', whatsappRouter);
      this.app.use('/api/messages', messagesRouter);

      console.log('✅ Rutas cargadas correctamente');
    } catch (error) {
      console.error('❌ Error cargando rutas:', error.message);
    }

    this.app.get('/api/health', this.healthCheck.bind(this));
    this.app.get('/', this.serveFrontend.bind(this));
    this.app.get('*', this.serveFrontend.bind(this));

    this.app.set('io', this.io);
  }

  setupWhatsAppManager() {
    console.log('🔧 Inicializando WhatsAppManager...');
    
    try {
      const WhatsAppManager = require('./services/whatsappManager');
      
      if (WhatsAppManager.setIO) {
        WhatsAppManager.setIO(this.io);
        console.log('✅ WhatsAppManager configurado con Socket.io');
      }
    } catch (error) {
      console.error('❌ Error inicializando WhatsAppManager:', error.message);
    }
  }

  // 🔥🔥🔥 NUEVO MÉTODO COMPLETO
  setupServiceIntegrations() {
    console.log('🔧 Integrando CleanupService con WhatsAppManager...');

    const WhatsAppManager = require('./services/whatsappManager');
    const CleanupService = require('./services/CleanupService');

    // 📌 Estadísticas del servicio de limpieza
    this.app.get('/api/system/cleanup-stats', (req, res) => {
      try {
        const stats = WhatsAppManager.getStats();
        res.json({
          success: true,
          stats: stats.cleanupService,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // 📌 Forzar limpieza general o por sesión
    this.app.post('/api/system/force-cleanup', async (req, res) => {
      try {
        const { sessionId } = req.body;
        
        if (sessionId) {
          const result = await WhatsAppManager.adminCleanupEBUSY(sessionId);
          res.json(result);
        } else {
          const result = await WhatsAppManager.forceCleanupAllZombies();
          res.json(result);
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    console.log('✅ CleanupService integrado exitosamente');
  }

  healthCheck(req, res) {
    let whatsappStatus = '❌ No disponible';
    let sessions = 0;
    
    try {
      const WhatsAppManager = require('./services/whatsappManager');
      whatsappStatus = WhatsAppManager ? '✅ Disponible' : '❌ No disponible';
      
      if (WhatsAppManager) {
        const allSessions = WhatsAppManager.getAllSessions();
        sessions = allSessions ? allSessions.length : 0;
      }
    } catch (error) {
      whatsappStatus = `❌ Error: ${error.message}`;
    }
    
    res.json({ 
      status: 'OK', 
      message: 'Servidor funcionando',
      whatsappManager: whatsappStatus,
      sessionsCount: sessions,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  }

  serveFrontend(req, res) {
    try {
      const frontendPath = path.join(__dirname, '../frontend/index.html');
      if (require('fs').existsSync(frontendPath)) {
        res.sendFile(frontendPath);
      } else {
        res.status(404).json({
          error: 'Frontend no encontrado'
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('👤 Cliente conectado:', socket.id);
      
      socket.emit('connected', { 
        id: socket.id,
        message: 'Conectado al servidor',
        timestamp: new Date().toISOString()
      });

      try {
        const WhatsAppManager = require('./services/whatsappManager');
        const sessions = WhatsAppManager.getAllSessions();
        socket.emit('sessions_update', {
          sessions: sessions,
          count: sessions.length,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error enviando estado inicial:', error);
      }

      socket.on('disconnect', () => {
        console.log('👤 Cliente desconectado:', socket.id);
      });
    });
  }

  startServer() {
    this.server.listen(this.port, () => {
      this.printBanner();
    });
  }

  printBanner() {
    console.log('🚀 ========================================');
    console.log('🚀 WhatsApp Massive Sender');
    console.log('🚀 ========================================');
    console.log(`🌐 Servidor: http://localhost:${this.port}`);
    console.log(`📁 Directorio: ${__dirname}`);
    console.log(`⚙️  Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log('🚀 ========================================');
  }
}

const appServer = new AppServer();

module.exports = { 
  app: appServer.app, 
  server: appServer.server, 
  io: appServer.io 
};
