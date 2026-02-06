# RUNBOOK

## Requisitos previos

- **Node.js** (recomendado 20.x según `.replit`).
- **MongoDB** accesible vía `MONGODB_URI` (por defecto `mongodb://localhost:27017/whatsapp_campaigns`). Ver `server/db.ts`.
- **Chrome/Chromium** instalado para `whatsapp-web.js` (ver `server/whatsappManager.ts`).
- Acceso a SMS Gate / Infobip si se usan SMS (ver `server/smsManager.ts`).

## Instalación

1) `npm install`
2) Configurar variables de entorno (ver sección “Variables de entorno”).

## Desarrollo (modo recomendado)

- `npm run dev`
  - Ejecuta `server/index.ts` con `tsx` y Vite middleware. 
  - El servidor escucha en `http://localhost:5000` por defecto. Ver `server/index.ts`.

### Nota sobre `npm run dev:client`

- `dev:client` lanza Vite en el puerto 5000 (`vite dev --port 5000`), el mismo puerto del backend.
- Si se ejecuta junto con `npm run dev`, hay **conflicto de puerto**.
- Solución: usar **solo** `npm run dev`, o cambiar `PORT` / `dev:client`.

## Producción

1) `npm run build` → genera `dist/public` (frontend) y `dist/index.cjs` (backend). Ver `script/build.ts`.
2) `npm start` → `node dist/index.cjs`.
3) El servidor sirve estáticos desde `dist/public` (`server/static.ts`).

## Scripts útiles

- `npm run dev` — backend + frontend en un solo proceso (Vite middleware).
- `npm run dev:client` — solo frontend (Vite).
- `npm run check` — TypeScript (`tsc`).
- `npm test` — Vitest.
- `npm test -- --run` — Vitest en modo CI (sin watch).
- `npm run build` — build full (client + server).
- `npm start` — sirve build de producción.

## Variables de entorno (confirmadas en código)

### Core / Server
- `MONGODB_URI` — URI MongoDB. Default: `mongodb://localhost:27017/whatsapp_campaigns` (`server/db.ts`).
- `PORT` — puerto del servidor. Default: `5000` (`server/index.ts`).
- `NODE_ENV` — afecta cookie `secure` y modo prod/dev (`server/index.ts`, `server/auth.ts`).
- `CORS_ORIGIN` — origen permitido para Socket.IO. Default: `http://localhost:5000` (`server/routes.ts`).

### Auth
- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — credenciales admin (defaults `admin/admin123`). (`server/auth.ts`)
- `SESSION_SECRET` — secreto de sesiones (default `dev-session-secret-change-me`). (`server/auth.ts`)

### Logging HTTP (request/response)
- `LOG_HTTP`, `LOG_HTTP_BODY`, `LOG_HTTP_HEADERS`, `LOG_HTTP_ALL` (`server/index.ts`).

### Logging a archivos
- `LOG_FILE_MODE` (`off`, `daily`, `startup`), `LOG_DIR`, `LOG_LEVEL`, `LOG_FORMAT` (`server/logging.ts`).

### WhatsApp / Puppeteer
- `WHATSAPP_AUTO_RESTORE` — restaura sesiones al iniciar (`server/routes.ts`).
- `WHATSAPP_QR_MANUAL`, `WHATSAPP_QR_WINDOW_MS` — control de QR manual (`server/whatsappManager.ts`).
- `WHATSAPP_POLL_ENABLED`, `WHATSAPP_POLL_INTERVAL_MS` — polling de mensajes entrantes (`server/whatsappManager.ts`).
- `WHATSAPP_VERIFY_WINDOW_MS` — ventana máxima (ms) para considerar una sesión como verificada (default 30000).
- `WHATSAPP_USER_AGENT` / `PUPPETEER_USER_AGENT` — user agent opcional (`server/whatsappManager.ts`).
- `PUPPETEER_EXECUTABLE_PATH` / `CHROME_PATH` — ruta explícita a Chrome/Chromium (`server/whatsappManager.ts`).

### Campañas / motor
- `CAMPAIGN_SEND_WINDOW_ENABLED`, `CAMPAIGN_SEND_WINDOW_START`, `CAMPAIGN_SEND_WINDOW_END` (`server/campaignEngine.ts`).
- `CAMPAIGN_PAUSES_ENABLED`, `CAMPAIGN_PAUSES_STRATEGY`, `CAMPAIGN_PAUSES_TARGET_PAUSES`,
  `CAMPAIGN_PAUSES_EVERY_MESSAGES`, `CAMPAIGN_PAUSES_MIN_MESSAGES`,
  `CAMPAIGN_PAUSES_DURATIONS_MINUTES`, `CAMPAIGN_PAUSES_DURATIONS_MODE`,
  `CAMPAIGN_PAUSES_APPLY_WHATSAPP`, `CAMPAIGN_PAUSES_APPLY_SMS` (`server/campaignEngine.ts`).
- `WHATSAPP_SESSION_COOLDOWN_MS`, `WHATSAPP_SESSION_COOLDOWN_ATTEMPTS` (`server/campaignEngine.ts`).
- `CAMPAIGN_IMMEDIATE_PAUSE_NO_SESSIONS`, `CAMPAIGN_POOL_AUTO_ADJUST`,
  `CAMPAIGN_POOL_FALLBACK_ANY_SESSION`, `CAMPAIGN_MIN_POOL_SESSIONS`,
  `CAMPAIGN_WAIT_FOR_SESSIONS_MS` (`server/campaignEngine.ts`).
- `WHATSAPP_AUTO_THROTTLE_ENABLED`, `WHATSAPP_AUTO_THROTTLE_TARGET_SESSIONS`,
  `WHATSAPP_AUTO_THROTTLE_MAX_MULTIPLIER` (`server/campaignEngine.ts`).

### SMS (normalización y proveedores)
- `SMS_DEFAULT_COUNTRY_CODE`, `SMS_ENFORCE_CHILE_MOBILE` (`server/smsManager.ts`, `server/whatsappManager.ts`).
- Infobip: `INFOBIP_*` o `SMS_INFOBIP_*` (auth, base URL, sender, tokens). Ver `server/smsManager.ts`.
- SMS Gate: `SMS_GATE_TOKEN` o `SMS_GATE_USERNAME`/`SMS_GATE_PASSWORD`, `SMS_GATE_BASE_URL`, `SMS_GATE_ENDPOINT`. Ver `server/smsManager.ts`.
- Local token genérico: `SMS_GATE_LOCAL_TOKEN` o `SMS_LOCAL_BEARER_TOKEN`. Ver `server/smsManager.ts`.

### Scripts (tests manuales)
- `TEST_BASE_URL`, `TEST_WA_POOL_NAME`, `TEST_SMS_POOL_NAME`, `TEST_SMS_LINE_NAME` (`script/runCampaignTests.ts`).

### Replit (solo si aplica)
- `REPL_ID`, `REPLIT_INTERNAL_APP_DOMAIN`, `REPLIT_DEV_DOMAIN` (`vite.config.ts`, `vite-plugin-meta-images.ts`).

## Troubleshooting (basado en código)

- **No conecta a MongoDB**: revisar `MONGODB_URI` y que Mongo esté arriba (`server/db.ts`).
- **No aparece QR**: si `WHATSAPP_QR_MANUAL=true`, la ventana QR se abre por `/api/sessions/:id/qr` (UI lo hace). Ver `server/whatsappManager.ts`, `client/src/pages/Sessions.tsx`.
- **WhatsApp no inicia por Chrome**: definir `PUPPETEER_EXECUTABLE_PATH` o instalar Chrome/Chromium (ver rutas por OS en `server/whatsappManager.ts`).
- **Campaña pausada por falta de sesiones**: verificar `verifiedConnected` con `/api/sessions/health` y revisar pools (`server/campaignEngine.ts`).
- **Campaña pausada por falta de GSM lines**: verificar líneas activas y `smsPoolId` (`server/campaignEngine.ts`).
- **Mensajes entrantes no llegan**: habilitar polling en Settings (usa `/api/settings/whatsapp-polling`).
- **Logs con datos sensibles**: desactivar `LOG_HTTP_BODY` y `LOG_HTTP_HEADERS` en producción (`server/index.ts`).

## Sesiones WhatsApp — estado verificado

- **Qué significa `verifiedConnected`**: el backend valida conexión real con heartbeat (`client.getState()`), no solo el `status` persistido en Mongo.
- **Heartbeat**: cuando `WHATSAPP_POLL_ENABLED=true`, cada `WHATSAPP_POLL_INTERVAL_MS` se verifica `getState()`; si falla, la sesión se marca `disconnected` y emite `session:disconnected`.
- **Sesiones fantasma**: si el `status` en DB dice `connected` pero `verifiedConnected=false`, la sesión no es utilizable para campañas.
- **Health endpoint**: `GET /api/sessions/health` (solo admin) devuelve `verifiedConnected`, `lastVerifiedAt` y `lastVerifyError`.
- **Validar sesiones (manual)**: `POST /api/sessions/verify-now` (admin/supervisor) fuerza heartbeat inmediato sin reconectar ni generar QR; útil antes de iniciar campañas.
- **Procedimiento cuando una sesión muere**:
  1) Revisar `/api/sessions/health`.
  2) Si `verifiedConnected=false`, usar `POST /api/sessions/:id/reconnect`.
  3) Escanear QR y confirmar que `verifiedConnected=true`.
- **Reset auth (manual)**: si reconnect no funciona, usar `POST /api/sessions/:id/reset-auth` y volver a escanear QR.

## UNKNOWN

- Despliegue fuera de Replit (Docker/CI/CD) no está definido en el repo.
- Estrategia de backups de MongoDB no está definida en el repo.
