const fs = require('fs');
const path = require('path');

console.log('🧹 INICIANDO LIMPIEZA COMPLETA DE SESIONES...');
console.log('=============================================');

// 1. Limpiar archivo de sesiones de nuestra app
const sessionsFile = path.join(__dirname, 'backend/data/whatsapp-sessions.json');
if (fs.existsSync(sessionsFile)) {
    fs.unlinkSync(sessionsFile);
    console.log('✅ ELIMINADO: backend/data/whatsapp-sessions.json');
} else {
    console.log('ℹ️  No se encontró: backend/data/whatsapp-sessions.json');
}

// 2. Limpiar sesiones de WhatsApp Web
const whatsappSessionsDir = path.join(__dirname, 'storage/sessions');
if (fs.existsSync(whatsappSessionsDir)) {
    console.log('📁 Eliminando sesiones de WhatsApp Web...');
    fs.rmSync(whatsappSessionsDir, { recursive: true, force: true });
    console.log('✅ ELIMINADO: storage/sessions/ (todas las sesiones de WhatsApp)');
} else {
    console.log('ℹ️  No se encontró: storage/sessions/');
}

// 3. Crear directorios necesarios
console.log('📂 Creando directorios...');
const dataDir = path.join(__dirname, 'backend/data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✅ CREADO: backend/data/');
}

const storageDir = path.join(__dirname, 'storage');
if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
    console.log('✅ CREADO: storage/');
}

const sessionsDir = path.join(__dirname, 'storage/sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
    console.log('✅ CREADO: storage/sessions/');
}

console.log('=============================================');
console.log('🎯 ¡LIMPIEZA COMPLETADA!');
console.log('🎯 Ahora ejecuta: npm start');
console.log('🎯 Y crea NUEVAS sesiones desde cero');