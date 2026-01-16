// backend/scripts/migrateToCleanupService.js
const fs = require('fs');
const path = require('path');

console.log('🔄 Iniciando migración al CleanupService unificado...');

// 1. Backup de archivos críticos
const backupDir = `./backup_cleanup_migration_${Date.now()}`;
fs.mkdirSync(backupDir, { recursive: true });

const filesToBackup = [
  'backend/services/whatsappManager.js',
  'backend/services/CustomLocalAuth.js',
  'data/whatsapp-sessions.json'
];

filesToBackup.forEach(file => {
  if (fs.existsSync(file)) {
    const backupPath = path.join(backupDir, path.basename(file));
    fs.copyFileSync(file, backupPath);
    console.log(`✅ Backup creado: ${file} -> ${backupPath}`);
  }
});

// 2. Verificar que no haya sesiones activas críticas
console.log('\n🔍 Verificando estado actual del sistema...');
try {
  const WhatsAppManager = require('./services/whatsappManager');
  const stats = WhatsAppManager.getStats();
  
  console.log('📊 Estado actual:');
  console.log(`   Sesiones activas: ${stats.activeSessions}`);
  console.log(`   Sesiones zombie: ${stats.zombieSessions}`);
  console.log(`   Total mensajes: ${stats.totalMessages}`);
  
  if (stats.activeSessions > 0) {
    console.log('⚠️  ADVERTENCIA: Hay sesiones activas. Recomendación:');
    console.log('   1. Detener campañas en curso');
    console.log('   2. Esperar a que terminen los mensajes');
    console.log('   3. Proceder con la migración');
  }
} catch (error) {
  console.log('⚠️  No se pudo verificar estado:', error.message);
}

// 3. Crear archivo de registro de migración
const migrationLog = {
  timestamp: new Date().toISOString(),
  backupDir,
  filesBackedUp: filesToBackup.filter(f => fs.existsSync(f)),
  notes: 'Migración a CleanupService unificado'
};

fs.writeFileSync(
  path.join(backupDir, 'migration_log.json'),
  JSON.stringify(migrationLog, null, 2)
);

console.log('\n✅ Migración preparada. Resumen:');
console.log(`   Backup creado en: ${backupDir}`);
console.log(`   Archivos respaldados: ${filesToBackup.length}`);
console.log('\n📝 Para completar la migración:');
console.log('   1. Reemplazar whatsappManager.js con la versión nueva');
console.log('   2. Reemplazar CustomLocalAuth.js con la versión simplificada');
console.log('   3. Asegurar que CleanupService.js esté en services/');
console.log('   4. Reiniciar el servidor');
console.log('\n🚀 Ejecutar: npm start');