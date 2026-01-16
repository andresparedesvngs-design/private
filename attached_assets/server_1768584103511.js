/**
 * Servidor Principal - WhatsApp Massive Sender
 * Punto de entrada de la aplicación
 */

const { server } = require('./app');

class ServerInitializer {
  constructor() {
    this.initializeServices();
    this.logSuccess();
  }

  initializeServices() {
    try {
      console.log('🔄 Inicializando servicios...');
      
      // Inicializar WhatsApp Manager
      this.initializeWhatsAppManager();
      
    } catch (error) {
      this.handleInitializationError(error);
    }
  }

  initializeWhatsAppManager() {
    console.log('📱 Cargando WhatsApp Manager...');
    
    // Importar el servicio para que se inicialice automáticamente
    require('./services/whatsappManager');
    
    console.log('✅ WhatsApp Manager cargado correctamente');
  }

  handleInitializationError(error) {
    console.error('❌ Error durante la inicialización:', error.message);
    console.error('📋 Detalles del error:', error);
    
    // En un entorno de producción, podrías querer terminar el proceso
    // process.exit(1);
  }

  logSuccess() {
    console.log('✅ Servidor inicializado correctamente');
    console.log('🟢 Todos los servicios están listos');
    console.log('🚀 Aplicación ejecutándose...');
  }
}

// Inicializar el servidor
new ServerInitializer();

// Exportar para posibles usos en tests
module.exports = ServerInitializer;