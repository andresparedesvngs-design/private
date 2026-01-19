// test-whatsapp.js
console.log('🧪 TESTEANDO WHATSAPP MANAGER...');

try {
  const WhatsAppManager = require('./backend/services/whatsappManager');
  
  console.log('✅ WhatsAppManager cargado correctamente');
  console.log('📋 Métodos disponibles:');
  
  const methods = Object.getOwnPropertyNames(WhatsAppManager.constructor.prototype);
  console.log(methods.filter(m => m !== 'constructor'));
  
  console.log('🔍 Verificando métodos críticos:');
  console.log('   - startCampaign:', typeof WhatsAppManager.startCampaign);
  console.log('   - sendMessage:', typeof WhatsAppManager.sendMessage);
  console.log('   - setIO:', typeof WhatsAppManager.setIO);
  console.log('   - getAllSessions:', typeof WhatsAppManager.getAllSessions);
  
  // Probar obtener sesiones
  const sessions = WhatsAppManager.getAllSessions ? WhatsAppManager.getAllSessions() : [];
  console.log(`📱 Sesiones activas: ${sessions.length}`);
  
} catch (error) {
  console.error('❌ ERROR:', error.message);
  console.error(error.stack);
}