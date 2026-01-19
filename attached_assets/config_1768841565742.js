window.APP_CONFIG = {
    // URLs base
    API_BASE_URL: 'http://localhost:3000',
    WS_URL: 'http://localhost:3000',
    
    // Endpoints que SÍ existen
    ENDPOINTS: {
        // Salud del sistema
        HEALTH: '/api/health',
        
        // WhatsApp
        WHATSAPP_SESSIONS: '/api/whatsapp/sessions',
        WHATSAPP_SESSION: '/api/whatsapp/session',
        WHATSAPP_SEND_TEST: '/api/whatsapp/send-test',
        WHATSAPP_STATS: '/api/whatsapp/stats',
        
        // Deudores
        DEBTORS: '/api/debtors',
        DEBTORS_IMPORT: '/api/debtors/import',
        DEBTORS_STATS: '/api/debtors/stats',
        DEBTORS_EXPORT: '/api/debtors/export',
        DEBTORS_STATUS: '/api/debtors/status',
        DEBTORS_CLEAR_ALL: '/api/debtors/clear-all',
        
        // Campañas
        CAMPAIGN_CONFIG: '/api/campaign/config',
        CAMPAIGN_START: '/api/campaign/start',
        CAMPAIGN_VALIDATE_POOLS: '/api/campaign/validate-pools',
        CAMPAIGN_STOP: '/api/campaign/stop',
        CAMPAIGN_CANCEL: '/api/campaign/cancel',
        CAMPAIGN_STATUS: '/api/campaign/status',
        CAMPAIGN_REPORT_LAST: '/api/campaign/report/last',
        CAMPAIGN_STATS: '/api/campaign/stats',
        CAMPAIGN_TEST: '/api/campaign/test',
        
        // Mensajes/Chat
        MESSAGES_CONVERSATIONS: '/api/messages/conversations',
        MESSAGES_CONVERSATION: '/api/messages/conversations/:phoneNumber',
        MESSAGES_SEND: '/api/messages/conversations/:phoneNumber/send',
        MESSAGES_MARK_READ: '/api/messages/conversations/:phoneNumber/read',
        MESSAGES_STATS: '/api/messages/stats',
        
        // Sistema
        SYSTEM_CLEANUP_STATS: '/api/system/cleanup-stats'
    },
    
    // Configuración de campañas
    CAMPAIGN_CONFIG_DEFAULTS: {
        delay: 1000,
        mode: 'sequential',
        speed: 'medium',
        antiBlock: true
    },
    
    // Configuración de pools
    POOL_DEFAULTS: {
        delayBase: 8000,
        delayVariacion: 2000,
        delayMinimo: 6000,
        delayMaximo: 10000,
        maxSesionesSimultaneas: 2
    }
};