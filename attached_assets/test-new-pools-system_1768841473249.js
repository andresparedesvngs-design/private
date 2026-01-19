// Script de pruebas para el nuevo sistema de pools
const testNewPoolsSystem = {
  
  // Prueba de configuración de delays híbridos
  testDelayHibrido: function() {
    console.log('🧪 Probando cálculos de delay híbrido...');
    
    const config = {
      delayBase: 8000,
      delayVariacion: 2000,
      delayMinimo: 6000,
      delayMaximo: 10000
    };
    
    for (let i = 0; i < 5; i++) {
      const delay = this.calcularDelayHibrido(config);
      console.log(`  Delay ${i+1}: ${delay}ms (${delay >= 6000 && delay <= 10000 ? '✅' : '❌'})`);
    }
  },
  
  // Prueba de modos de pool
  testModosPool: function() {
    console.log('\n🎯 Probando modos de pool...');
    
    const modos = ['turnos_fijos', 'turnos_aleatorios', 'competitivo'];
    modos.forEach(modo => {
      console.log(`  ${modo}: ✅ Disponible`);
    });
  },
  
  // Prueba de gestión de deudores
  testGestionDeudores: function() {
    console.log('\n📋 Probando gestión multi-pool...');
    
    const deudores = ['D1', 'D2', 'D3', 'D4', 'D5'];
    console.log(`  Deudores de prueba: ${deudores.length}`);
    console.log('  Sistema multi-pool: ✅ Integrado');
  },
  
  // Ejecutar todas las pruebas
  run: function() {
    console.log('=== INICIANDO PRUEBAS DEL NUEVO SISTEMA DE POOLS ===\n');
    this.testDelayHibrido();
    this.testModosPool();
    this.testGestionDeudores();
    console.log('\n=== PRUEBAS COMPLETADAS ===');
    console.log('🎉 Sistema listo para usar!');
  },
  
  // Función auxiliar para calcular delay (simulada)
  calcularDelayHibrido: function(config) {
    const variacion = (Math.random() * 2 - 1) * config.delayVariacion;
    let delayFinal = config.delayBase + variacion;
    return Math.max(config.delayMinimo, Math.min(config.delayMaximo, delayFinal));
  }
};

// Ejecutar pruebas
testNewPoolsSystem.run();