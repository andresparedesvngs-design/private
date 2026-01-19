const fs = require('fs');
const path = require('path');

console.log('🔧 Aplicando correcciones a los archivos...');

// Verificar que los archivos existan
const filesToCheck = [
    './frontend/js/app.js',
    './backend/routes/campaign.js', 
    './backend/services/whatsappManager.js'
];

filesToCheck.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file} - EXISTE`);
    } else {
        console.log(`❌ ${file} - NO EXISTE`);
    }
});

console.log('\n📋 INSTRUCCIONES PARA APLICAR CORRECCIONES:');
console.log('1. Abre cada archivo mencionado arriba');
console.log('2. Busca las funciones/rutas específicas');
console.log('3. Reemplaza con el código corregido proporcionado');
console.log('4. Guarda los archivos');
console.log('5. Reinicia el servidor: npm start');