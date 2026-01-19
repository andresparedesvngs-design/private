// Crea un archivo test.js
const WhatsAppManager = require('./services/whatsappManager');

async function test() {
  console.log('🔍 Testeando WhatsApp Manager...');
  
  // 1. Verificar sesiones
  const sessions = WhatsAppManager.getAllSessions();
  console.log(`✅ Sesiones cargadas: ${sessions.length}`);
  
  // 2. Verificar stats
  const stats = WhatsAppManager.getStats();
  console.log('📊 Estadísticas:', stats);
  
  // 3. Verificar que no haya zombies atascados
  console.log(`🧟 Sesiones zombie: ${WhatsAppManager.zombieSessions?.size || 0}`);
}

test().catch(console.error);