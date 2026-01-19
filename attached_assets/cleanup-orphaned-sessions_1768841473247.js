// cleanup-orphaned-sessions.js
const fs = require('fs');
const path = require('path');

console.log('🧹 Buscando sesiones huérfanas...');

const sessionsDataPath = path.join(__dirname, 'backend', 'data', 'whatsapp-sessions.json');
const sessionsStoragePath = path.join(__dirname, 'storage', 'sessions');

try {
  // Cargar sesiones del archivo JSON
  if (fs.existsSync(sessionsDataPath)) {
    const sessionsData = JSON.parse(fs.readFileSync(sessionsDataPath, 'utf8'));
    const sessionIds = Object.keys(sessionsData);
    
    console.log(`📊 Sesiones en archivo: ${sessionIds.length}`);
    
    // Verificar cada sesión en el almacenamiento
    if (fs.existsSync(sessionsStoragePath)) {
      const storageFolders = fs.readdirSync(sessionsStoragePath);
      
      storageFolders.forEach(folder => {
        const sessionId = folder.replace('session-', '');
        
        // Si la sesión no existe en el archivo JSON, eliminar la carpeta
        if (!sessionsData[sessionId]) {
          console.log(`🗑️ Eliminando sesión huérfana: ${folder}`);
          fs.rmSync(path.join(sessionsStoragePath, folder), { recursive: true, force: true });
        }
      });
    }
    
    console.log('✅ Limpieza completada');
  }
} catch (error) {
  console.error('❌ Error en limpieza:', error);
}