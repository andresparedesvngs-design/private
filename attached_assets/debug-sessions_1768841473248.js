const fs = require('fs');
const path = require('path');

console.log('🔍 DIAGNÓSTICO DE RUTAS DE SESIONES');
console.log('====================================');

// Verificar diferentes rutas posibles
const possiblePaths = [
    path.join(process.cwd(), 'storage', 'sessions'),
    path.join(__dirname, 'storage', 'sessions'),
    path.join(process.cwd(), 'backend', 'storage', 'sessions'),
    path.join(__dirname, 'backend', 'storage', 'sessions')
];

console.log('\n📁 BUSCANDO CARPETAS DE SESIONES:');
possiblePaths.forEach((sessionPath, index) => {
    const exists = fs.existsSync(sessionPath);
    console.log(`${index + 1}. ${sessionPath} -> ${exists ? '✅ EXISTE' : '❌ NO EXISTE'}`);
    
    if (exists) {
        const sessions = fs.readdirSync(sessionPath);
        console.log(`   📂 Contenido: ${sessions.length > 0 ? sessions.join(', ') : 'Vacía'}`);
        
        sessions.forEach(sessionId => {
            const sessionDir = path.join(sessionPath, sessionId);
            const files = fs.readdirSync(sessionDir);
            console.log(`   🗂️  Sesión ${sessionId}: ${files.length} archivos -> ${files.join(', ')}`);
        });
    }
});

// Verificar la sesión específica que debería existir
const targetSession = '96398a1a-3c91-480f-b089-cdb05154d6d8';
console.log(`\n🎯 BUSCANDO SESIÓN ESPECÍFICA: ${targetSession}`);

possiblePaths.forEach((basePath, index) => {
    const sessionPath = path.join(basePath, targetSession);
    const exists = fs.existsSync(sessionPath);
    console.log(`${index + 1}. ${sessionPath} -> ${exists ? '✅ ENCONTRADA' : '❌ NO ENCONTRADA'}`);
    
    if (exists) {
        const files = fs.readdirSync(sessionPath);
        console.log(`   📄 Archivos: ${files.join(', ')}`);
    }
});

console.log('\n📊 DIRECTORIO DE TRABAJO ACTUAL:');
console.log('   process.cwd():', process.cwd());
console.log('   __dirname:', __dirname);

console.log('\n🎯 DIAGNÓSTICO COMPLETADO');