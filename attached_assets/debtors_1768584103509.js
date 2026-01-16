const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const iconv = require('iconv-lite');
const router = express.Router();

// ===== CONFIGURACIÓN =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'storage/uploads/';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ];
    
    const isCSV = file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
    const isExcel = file.mimetype.includes('spreadsheet') || 
                   file.originalname.endsWith('.xlsx') || 
                   file.originalname.endsWith('.xls');
    
    if (isCSV || isExcel) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos CSV o Excel (.csv, .xlsx, .xls)'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// ===== ALMACENAMIENTO EN MEMORIA =====
let debtors = [];
let importStats = {
  total: 0,
  imported: 0,
  errors: 0,
  errorDetails: []
};

// ===== FUNCIONES AUXILIARES =====

// Procesar archivos Excel
function processExcelFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const data = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: ''
      });
      
      console.log('📊 Encabezados detectados en Excel:', Object.keys(data[0] || {}));
      console.log('📊 Primera fila de datos:', data[0]);
      
      resolve(data);
    } catch (error) {
      reject(error);
    }
  });
}

// Método alternativo para archivos CSV problemáticos
const tryAlternativeMethod = (filePath) => {
  return new Promise((resolve, reject) => {
    try {
      const fileContent = fs.readFileSync(filePath);
      
      let content;
      try {
        content = iconv.decode(fileContent, 'utf8');
      } catch (e) {
        content = iconv.decode(fileContent, 'latin1');
      }
      
      content = content.replace(/^\uFEFF/, '');
      
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        reject(new Error('Archivo vacío o con formato incorrecto'));
        return;
      }
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row);
      }
      
      resolve(rows);
    } catch (error) {
      reject(error);
    }
  });
};

// Función para mapeo dinámico de campos
const getField = (row, possibleNames) => {
  for (let name of possibleNames) {
    if (row[name] !== undefined && row[name] !== '') {
      return row[name];
    }
  }
  return '';
};

// Limpiar y formatear números
const cleanNumber = (numStr) => {
  if (!numStr) return 0;
  const cleaned = String(numStr).replace(/[$\s.,]/g, '');
  return parseFloat(cleaned) || 0;
};

// Limpiar números de teléfono
const cleanPhone = (phone) => {
  return String(phone).replace(/\D/g, '');
};

// Normalizar estados de deudores
const normalizeState = (estado) => {
  const estadoNormalizado = estado.toLowerCase();
  if (estadoNormalizado.includes('paga') || estadoNormalizado.includes('pagado') || estadoNormalizado.includes('cancelado')) {
    return 'pagado';
  } else if (estadoNormalizado.includes('pendiente') || estadoNormalizado.includes('pend')) {
    return 'pendiente';
  } else if (estadoNormalizado.includes('vencido') || estadoNormalizado.includes('atrasado')) {
    return 'vencido';
  } else if (estadoNormalizado.includes('judicial') || estadoNormalizado.includes('proceso')) {
    return 'judicial';
  } else if (estadoNormalizado.includes('contactado')) {
    return 'contactado';
  }
  return estadoNormalizado;
};

// Procesar una fila de datos
const processRow = (row, index) => {
  try {
    console.log(`Procesando fila ${index + 1}:`, row);

    // Mapeo dinámico de campos
    const nombre = getField(row, ['nombre', 'name', 'cliente', 'deudor', 'nombre cliente']);
    const telefono = getField(row, ['telefono', 'teléfono', 'phone', 'celular', 'contacto', 'fono']);
    const deuda = getField(row, ['deuda', 'monto', 'deuda total', 'total deuda', 'monto deuda']);
    const capital = getField(row, ['capital', 'capital deuda', 'deuda capital']);
    const estado = getField(row, ['estado', 'status', 'situación', 'situacion']);
    const vencimiento = getField(row, ['vencimiento', 'fecha vencimiento', 'vencimiento deuda', 'fecha']);
    const rut = getField(row, ['rut', 'documento', 'dni', 'identificación', 'identificacion']);
    const nombre_ejecutivo = getField(row, ['nombre_ejecutivo', 'ejecutivo', 'gestor', 'asignado a', 'responsable']);
    const numero_ejecutivo = getField(row, ['numero_ejecutivo', 'teléfono ejecutivo', 'telefono ejecutivo', 'contacto ejecutivo']);
    const titulo = getField(row, ['titulo', 'título', 'asunto', 'descripción', 'descripcion']);

    // Validar campos requeridos
    if (!nombre || !telefono) {
      throw new Error('Faltan campos requeridos: nombre o telefono');
    }

    const debtor = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      nombre: String(nombre).trim(),
      telefono: cleanPhone(telefono),
      deuda: cleanNumber(deuda),
      capital: cleanNumber(capital),
      estado: estado ? normalizeState(estado) : 'pendiente',
      vencimiento: vencimiento || null,
      rut: rut ? String(rut).trim() : '',
      nombre_ejecutivo: nombre_ejecutivo ? String(nombre_ejecutivo).trim() : '',
      numero_ejecutivo: numero_ejecutivo ? cleanPhone(numero_ejecutivo) : '',
      titulo: titulo ? String(titulo).trim() : '',
      importedAt: new Date().toISOString()
    };

    // Validaciones adicionales
    if (debtor.telefono.length < 8) {
      throw new Error(`Número de teléfono inválido: ${debtor.telefono}`);
    }

    return { success: true, debtor };
  } catch (error) {
    return { success: false, error: error.message, row };
  }
};

// ===== RUTAS DE IMPORTACIÓN =====

// Importar CSV o Excel
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      error: 'No se subió ningún archivo' 
    });
  }

  const newDebtors = [];
  importStats = { total: 0, imported: 0, errors: 0, errorDetails: [] };

  try {
    let rows = [];
    
    const isExcel = req.file.originalname.endsWith('.xlsx') || 
                   req.file.originalname.endsWith('.xls');
    
    if (isExcel) {
      console.log('📊 Procesando archivo Excel...');
      rows = await processExcelFile(req.file.path);
    } else {
      console.log('📊 Procesando archivo CSV...');
      rows = await new Promise((resolve, reject) => {
        const csvRows = [];
        fs.createReadStream(req.file.path)
          .pipe(csv({
            mapHeaders: ({ header, index }) => header.trim().toLowerCase(),
            mapValues: ({ value }) => value.trim()
          }))
          .on('data', (row) => csvRows.push(row))
          .on('end', () => resolve(csvRows))
          .on('error', (error) => {
            console.error('Error con CSV estándar, intentando método alternativo:', error.message);
            tryAlternativeMethod(req.file.path)
              .then(resolve)
              .catch(reject);
          });
      });
    }

    // Procesar cada fila
    rows.forEach((row, index) => {
      importStats.total++;
      
      const result = processRow(row, index);
      
      if (result.success) {
        newDebtors.push(result.debtor);
        importStats.imported++;
      } else {
        importStats.errors++;
        importStats.errorDetails.push({
          row: importStats.total,
          error: result.error,
          data: row
        });
        console.error(`Error en fila ${importStats.total}:`, result.error);
      }
    });

    debtors = [...debtors, ...newDebtors];
    
    // Limpiar archivo temporal
    try {
      fs.unlinkSync(req.file.path);
    } catch (error) {
      console.error('Error eliminando archivo temporal:', error);
    }
    
    console.log(`Importación completada: ${newDebtors.length} exitosos, ${importStats.errors} errores`);
    
    // Emitir actualización en tiempo real
    const io = req.app.get('io');
    if (io) {
      io.emit('debtors_imported', { 
        count: newDebtors.length, 
        stats: importStats 
      });
    }

    res.json({
      success: true,
      message: `Importados ${newDebtors.length} deudores (${importStats.errors} errores)`,
      stats: importStats,
      debtors: newDebtors
    });

  } catch (error) {
    // Limpiar archivo temporal en caso de error
    try {
      fs.unlinkSync(req.file.path);
    } catch (unlinkError) {
      console.error('Error eliminando archivo temporal:', unlinkError);
    }

    res.status(500).json({
      success: false,
      error: 'Error procesando archivo: ' + error.message
    });
  }
});

// ===== RUTAS DE CONSULTA =====

// Obtener deudores con filtros y paginación
router.get('/', (req, res) => {
  const { 
    page = 1, 
    limit = 10000,
    search = '', 
    filter = '', 
    executive = '',
    rut = '',
    minDebt = 0,
    maxDebt = 1000000000,
    state = ''
  } = req.query;
  
  let filteredDebtors = [...debtors];
  
  // Aplicar filtros
  if (search) {
    filteredDebtors = filteredDebtors.filter(debtor => 
      debtor.nombre.toLowerCase().includes(search.toLowerCase()) ||
      debtor.telefono.includes(search) ||
      (debtor.rut && debtor.rut.toLowerCase().includes(search.toLowerCase())) ||
      (debtor.nombre_ejecutivo && debtor.nombre_ejecutivo.toLowerCase().includes(search.toLowerCase()))
    );
  }
  
  if (filter) {
    filteredDebtors = filteredDebtors.filter(debtor => 
      debtor.estado === filter
    );
  }

  if (executive) {
    filteredDebtors = filteredDebtors.filter(debtor => 
      debtor.nombre_ejecutivo && debtor.nombre_ejecutivo.toLowerCase().includes(executive.toLowerCase())
    );
  }

  if (rut) {
    filteredDebtors = filteredDebtors.filter(debtor => 
      debtor.rut && debtor.rut.toLowerCase().includes(rut.toLowerCase())
    );
  }

  if (minDebt || maxDebt) {
    const min = parseFloat(minDebt) || 0;
    const max = parseFloat(maxDebt) || 1000000000;
    filteredDebtors = filteredDebtors.filter(debtor => 
      debtor.deuda >= min && debtor.deuda <= max
    );
  }

  if (state) {
    filteredDebtors = filteredDebtors.filter(debtor => 
      debtor.estado === state
    );
  }
  
  const limitNum = parseInt(limit);
  if (limitNum >= 10000) {
    return res.json({
      success: true,
      debtors: filteredDebtors,
      pagination: {
        page: 1,
        limit: filteredDebtors.length,
        total: filteredDebtors.length,
        pages: 1
      }
    });
  }
  
  const startIndex = (page - 1) * limitNum;
  const endIndex = startIndex + limitNum;
  const paginatedDebtors = filteredDebtors.slice(startIndex, endIndex);
  
  res.json({
    success: true,
    debtors: paginatedDebtors,
    pagination: {
      page: parseInt(page),
      limit: limitNum,
      total: filteredDebtors.length,
      pages: Math.ceil(filteredDebtors.length / limitNum)
    }
  });
});

// ===== RUTAS DE EXPORTACIÓN =====

// Exportar deudores a CSV
router.get('/export', (req, res) => {
  try {
    console.log('📤 Solicitando exportación de deudores...');
    
    if (debtors.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No hay deudores para exportar'
      });
    }

    // Generar CSV
    let csv = 'Nombre,Telefono,RUT,Deuda,Capital,Estado,Vencimiento,Ejecutivo,Telefono Ejecutivo,Titulo\n';
    
    debtors.forEach(debtor => {
      const row = [
        `"${(debtor.nombre || '').replace(/"/g, '""')}"`,
        `"${(debtor.telefono || '').replace(/"/g, '""')}"`,
        `"${(debtor.rut || '').replace(/"/g, '""')}"`,
        debtor.deuda || 0,
        debtor.capital || 0,
        `"${(debtor.estado || '').replace(/"/g, '""')}"`,
        `"${(debtor.vencimiento || '').replace(/"/g, '""')}"`,
        `"${(debtor.nombre_ejecutivo || '').replace(/"/g, '""')}"`,
        `"${(debtor.numero_ejecutivo || '').replace(/"/g, '""')}"`,
        `"${(debtor.titulo || '').replace(/"/g, '""')}"`
      ].join(',');
      
      csv += row + '\n';
    });

    console.log(`✅ CSV generado: ${debtors.length} deudores`);

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="deudores-${new Date().toISOString().split('T')[0]}.csv"`);
    res.setHeader('Content-Length', Buffer.byteLength(csv, 'utf8'));
    
    // Enviar CSV
    res.send(csv);

  } catch (error) {
    console.error('❌ Error exportando deudores:', error);
    res.status(500).json({
      success: false,
      error: 'Error exportando deudores: ' + error.message
    });
  }
});

// ===== RUTAS DE ESTADÍSTICAS =====

// Obtener estadísticas de deudores
router.get('/stats', (req, res) => {
  const total = debtors.length;
  const byStatus = debtors.reduce((acc, debtor) => {
    acc[debtor.estado] = (acc[debtor.estado] || 0) + 1;
    return acc;
  }, {});
  
  const totalDebt = debtors.reduce((sum, debtor) => sum + debtor.deuda, 0);
  const totalCapital = debtors.reduce((sum, debtor) => sum + debtor.capital, 0);

  const byExecutive = debtors.reduce((acc, debtor) => {
    const exec = debtor.nombre_ejecutivo || 'Sin ejecutivo';
    acc[exec] = (acc[exec] || 0) + 1;
    return acc;
  }, {});

  // Estadísticas adicionales
  const debtRanges = {
    '0-10000': debtors.filter(d => d.deuda <= 10000).length,
    '10001-50000': debtors.filter(d => d.deuda > 10000 && d.deuda <= 50000).length,
    '50001-100000': debtors.filter(d => d.deuda > 50000 && d.deuda <= 100000).length,
    '100001+': debtors.filter(d => d.deuda > 100000).length
  };

  const averageDebt = total > 0 ? totalDebt / total : 0;
  
  res.json({
    success: true,
    stats: {
      total,
      byStatus,
      byExecutive,
      totalDebt,
      totalCapital,
      averageDebt,
      debtRanges,
      importStats: importStats
    }
  });
});

// ===== RUTAS DE GESTIÓN =====

// 🔥 NUEVA RUTA: Eliminar todos los deudores con confirmación
router.delete('/clear-all', (req, res) => {
  try {
    const { confirm, reason } = req.body;
    
    if (!confirm) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere confirmación'
      });
    }

    const deletedCount = debtors.length;
    
    // Limpiar el array en memoria
    debtors = [];
    
    // Emitir evento
    const io = req.app.get('io');
    if (io) {
      io.emit('debtors_cleared', { 
        count: deletedCount,
        reason: reason || 'Limpieza manual',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`✅ Eliminados ${deletedCount} deudores de memoria`);
    
    res.json({
      success: true,
      message: `Eliminados ${deletedCount} deudores correctamente`,
      deleted: deletedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error eliminando deudores:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Eliminar todos los deudores (ruta original mantenida para compatibilidad)
router.delete('/all', (req, res) => {
  const count = debtors.length;
  debtors = [];
  
  // Emitir evento de limpieza
  const io = req.app.get('io');
  if (io) {
    io.emit('debtors_cleared', { 
      count,
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({
    success: true,
    message: `Eliminados ${count} deudores`
  });
});

// Eliminar deudor específico
router.delete('/:debtorId', (req, res) => {
  const { debtorId } = req.params;
  const initialCount = debtors.length;
  
  debtors = debtors.filter(debtor => debtor.id !== debtorId);
  const deleted = initialCount - debtors.length;
  
  if (deleted > 0) {
    res.json({
      success: true,
      message: 'Deudor eliminado correctamente'
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'Deudor no encontrado'
    });
  }
});

// Actualizar estado de deudor
router.patch('/:debtorId/status', (req, res) => {
  const { debtorId } = req.params;
  const { status } = req.body;
  
  const validStatuses = ['pendiente', 'contactado', 'pagado', 'vencido', 'judicial'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'Estado no válido'
    });
  }
  
  const debtorIndex = debtors.findIndex(debtor => debtor.id === debtorId);
  
  if (debtorIndex === -1) {
    return res.status(404).json({
      success: false,
      error: 'Deudor no encontrado'
    });
  }
  
  debtors[debtorIndex].estado = status;
  debtors[debtorIndex].updatedAt = new Date().toISOString();
  
  res.json({
    success: true,
    message: 'Estado actualizado correctamente',
    debtor: debtors[debtorIndex]
  });
});

// ===== RUTAS DE UTILIDAD =====

// Obtener opciones únicas para filtros
router.get('/filters/options', (req, res) => {
  const executives = [...new Set(debtors.map(d => d.nombre_ejecutivo).filter(Boolean))];
  const states = [...new Set(debtors.map(d => d.estado))];
  const titles = [...new Set(debtors.map(d => d.titulo).filter(Boolean))];
  
  res.json({
    success: true,
    options: {
      executives,
      states,
      titles
    }
  });
});

// 🔥 NUEVA RUTA: Obtener estado actual de deudores
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: {
      currentCount: debtors.length,
      hasData: debtors.length > 0,
      lastUpdate: new Date().toISOString()
    }
  });
});

// ===== MANEJO DE RUTAS NO ENCONTRADAS =====
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: ${req.originalUrl}`,
    availableEndpoints: [
      'POST   /debtors/import',
      'GET    /debtors/',
      'GET    /debtors/export',
      'GET    /debtors/stats',
      'GET    /debtors/filters/options',
      'GET    /debtors/status',
      'DELETE /debtors/all',
      'DELETE /debtors/clear-all',
      'DELETE /debtors/:debtorId',
      'PATCH  /debtors/:debtorId/status'
    ]
  });
});

module.exports = router;