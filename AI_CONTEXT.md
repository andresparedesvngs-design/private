# AI_CONTEXT — WhatsMassive (rest-express)

## 0. Alcance y fuente de verdad

- **Fuente de verdad**: el código del repositorio. La documentación interna (por ejemplo `replit.md`) puede estar desactualizada y debe validarse contra el código.
- **No asumir**: si algo no está explícitamente en el código, marcarlo como **UNKNOWN**.

## 1. Arquitectura real (backend + frontend)

- Monorepo con tres bloques: `server/` (Express + Socket.IO), `client/` (React + Vite) y `shared/` (Zod + Mongoose + tipos compartidos). Ver `server/index.ts`, `client/src/App.tsx`, `shared/schema.ts`.
- **Backend**: Node.js + TypeScript, Express, Socket.IO, Mongoose/MongoDB, Passport Local, whatsapp-web.js y sistema de campañas. Ver `server/index.ts`, `server/routes.ts`, `server/campaignEngine.ts`, `server/storage.ts`, `server/whatsappManager.ts`, `server/smsManager.ts`.
- **Frontend**: React + Vite, wouter, TanStack React Query, shadcn/ui, sockets para tiempo real. Ver `client/src/App.tsx`, `client/src/lib/api.ts`, `client/src/lib/socket.ts`.
- **Frontend/UI (rutas expuestas)**: Panel, Sesiones, Campañas, Mensajes, Deudores, Contactos, Registros y Configuración. No hay ruta `/cleanup` en el router ni opción de menú. Ver `client/src/components/layout/AppSidebar.tsx`, `client/src/App.tsx`.
- **Base de datos**: MongoDB vía Mongoose (`server/db.ts`, `shared/schema.ts`).
- **Tiempo real**: Socket.IO se usa para eventos de sesiones, campañas y mensajes (`server/routes.ts`, `server/whatsappManager.ts`, `server/campaignEngine.ts`).

## 2. Ejecución del sistema (visión operativa)

- `server/index.ts` crea el servidor Express y registra middleware, auth y rutas; en dev integra Vite con `server/vite.ts`, y en prod sirve estáticos con `server/static.ts`.
- El servidor escucha en **localhost** con el puerto `PORT` (por defecto 5000). Ver `server/index.ts`.
- El frontend se sirve desde el mismo servidor en desarrollo (Vite middleware) y desde `dist/public` en producción. Ver `server/vite.ts`, `server/static.ts`.

## 3. Autenticación y control de acceso

- Auth local vía `passport-local` y sesiones en memoria (`memorystore`), cookie `wm.sid`. Ver `server/auth.ts`.
- Las rutas `/api/auth/*` y `/api/health` se registran antes del middleware global; el resto de `/api/*` está protegido por `ensureAuthenticated`. Ver `server/index.ts` y `server/auth.ts`.
- Socket.IO aplica middleware de sesión y rechaza conexiones sin sesión válida. Ver `server/auth.ts` y `server/routes.ts`.

## 4. Contratos de dominio (fuente: shared/schema.ts)

### 4.1 Session (WhatsApp)
- Campos: `phoneNumber`, `status`, `qrCode`, `battery`, `messagesSent`, `lastActive`, timestamps. Ver `shared/schema.ts`.
- Estados observados en backend/UI: `initializing`, `qr_ready`, `authenticated`, `connected`, `reconnecting`, `auth_failed`, `disconnected`. Ver `server/whatsappManager.ts`, `client/src/pages/Sessions.tsx`.

### 4.2 Pool (WhatsApp routing)
- Campos: `name`, `strategy`, `delayBase`, `delayVariation`, `sessionIds`, `active`. Ver `shared/schema.ts`.
- Estrategias usadas en UI/API: `competitive`, `fixed_turns`, `random_turns` (strings libres; no enum formal). Ver `client/src/pages/Campaigns.tsx`, `server/routes.ts`.

### 4.3 GsmLine (SMS line)
- Campos: `name`, `urlTemplate`, `status`, `active`, `lastUsedAt`. Ver `shared/schema.ts`.
- `urlTemplate` define proveedor (Infobip, SMS Gate o HTTP genérico). Ver `server/smsManager.ts`.

### 4.4 GsmPool (SMS routing)
- Campos: `name`, `strategy`, `delayBase`, `delayVariation`, `lineIds`, `active`. Ver `shared/schema.ts`.
- Estrategias usadas: `fixed_turns`, `random_turns`. Ver `client/src/pages/Campaigns.tsx`.

### 4.5 Campaign
- Campos: `name`, `message`, `messageVariants`, `messageRotationStrategy`, `channel`, `smsPoolId`, `fallbackSms`, `status`, `poolId`, `debtorRangeStart`, `debtorRangeEnd`, `totalDebtors`, `sent`, `failed`, `progress`, `startedAt`, `completedAt`. Ver `shared/schema.ts`.
- Canales reales: `whatsapp`, `sms`, `whatsapp_fallback_sms` (más `fallbackSms` boolean). Ver `server/campaignEngine.ts`, `client/src/pages/Campaigns.tsx`.
- Estados usados por backend: `draft`, `active`, `paused`, `completed`. Ver `server/routes.ts`, `server/campaignEngine.ts`.
- El backend **no** asigna `status="error"`; los errores de campaña se comunican vía evento `campaign:error`. La UI muestra un badge/tooltip usando ese evento, sin inventar estados nuevos. Ver `client/src/pages/Campaigns.tsx`, `server/campaignEngine.ts`.

### 4.6 Debtor (deudor/contacto de campaña)
- Campos: `campaignId`, `name`, `phone`, `debt`, `status`, `lastContact`, `metadata`. Ver `shared/schema.ts`.
- Estados reales: `disponible`, `procesando`, `completado`, `fallado`. Ver `server/campaignEngine.ts`, `client/src/pages/Debtors.tsx`.
- `metadata` guarda campos dinámicos (ej. ejecutivo). Ver `client/src/pages/Debtors.tsx`, `client/src/pages/Messages.tsx`.

### 4.7 Contact
- Campos: `name`, `phone`, `phoneNormalized`, `rut`, `executiveName`, `executivePhone`, `executiveRut`, `metadata`. Ver `shared/schema.ts`.
- Se edita desde UI y se actualiza vía PATCH. Ver `client/src/pages/Contacts.tsx`, `server/routes.ts`.

### 4.8 Message
- Campos: `campaignId`, `debtorId`, `sessionId`, `phone`, `content`, `templateUsed`, `templateVariantIndex`, `channel`, `providerResponse`, `status`, `sentAt`, `deliveredAt`, `readAt`, `archived`, `error`. Ver `shared/schema.ts`.
- Estados reales usados en código: `pending`, `sent`, `failed`, `received`. `delivered` existe en esquema pero no se asigna en backend → **UNKNOWN**. Ver `server/whatsappManager.ts`, `server/campaignEngine.ts`.

### 4.9 SystemLog
- Campos: `level`, `source`, `message`, `metadata`. Ver `shared/schema.ts`.
- Se usa para auditoría y observabilidad en UI. Ver `server/storage.ts`, `client/src/pages/SystemLogs.tsx`.

## 5. Flujos end-to-end (UI → API → DB/Sockets)

### 5.1 Login
- UI `AuthGate` consulta `/api/auth/me`; si 401, muestra `Login.tsx`. Ver `client/src/components/auth/AuthGate.tsx`, `client/src/pages/Login.tsx`, `server/auth.ts`.

### 5.2 Sesiones WhatsApp
- Crear sesión: UI → POST `/api/sessions` → `storage.createSession` + `whatsappManager.createSession`, luego QR vía `/api/sessions/:id/qr`. Ver `client/src/pages/Sessions.tsx`, `server/routes.ts`, `server/whatsappManager.ts`.
- QR manual: `WHATSAPP_QR_MANUAL` + ventana QR (`WHATSAPP_QR_WINDOW_MS`). Ver `server/whatsappManager.ts`.
- Reconnect / reset auth: UI usa `/api/sessions/:id/reconnect` y `/api/sessions/:id/reset-auth`. Ver `client/src/pages/Sessions.tsx`, `server/routes.ts`, `server/whatsappManager.ts`.

### 5.3 Campañas
- Crear campaña: UI → POST `/api/campaigns` (Zod). Ver `client/src/pages/Campaigns.tsx`, `server/routes.ts`.
- Iniciar: UI → POST `/api/campaigns/:id/start`; backend `campaignEngine.startCampaign` valida pools, canales y sesiones/lines; cambia estado a `active` y envía progreso. Ver `server/routes.ts`, `server/campaignEngine.ts`.
- Pausar: UI → POST `/api/campaigns/:id/pause`; backend detiene campaña y marca `paused`. Ver `server/routes.ts`, `server/campaignEngine.ts`.
- Retry fallidos: UI → POST `/api/campaigns/:id/retry-failed` que resetea deudores `fallado` a `disponible`. Ver `server/routes.ts`.

### 5.4 Envíos (WhatsApp y SMS)
- WhatsApp: `campaignEngine` usa `whatsappManager.sendMessage`, registra `Message` con status `sent` o `failed`. Ver `server/campaignEngine.ts`, `server/whatsappManager.ts`.
- SMS: `smsManager.sendSmsWithLine` con `urlTemplate` (Infobip/SMS Gate/HTTP genérico). Ver `server/smsManager.ts`.
- Fallback: canal `whatsapp_fallback_sms` o `fallbackSms=true` habilitan SMS si WhatsApp falla. Ver `server/campaignEngine.ts`.

### 5.5 Mensajes entrantes
- `whatsappManager` guarda mensajes entrantes como `Message.status="received"` y actualiza `Debtor.lastContact`. Emite `message:received`. Ver `server/whatsappManager.ts`.

### 5.6 Deudores
- Importación CSV/XLSX: cliente parsea y envía `/api/debtors/bulk`; backend valida con Zod y guarda en Mongo. Ver `client/src/pages/Debtors.tsx`, `server/routes.ts`.
- Limpieza, reset y liberación: `/api/debtors/cleanup`, `/api/debtors/reset`, `/api/debtors/release`. Ver `server/routes.ts`, `server/storage.ts`.

### 5.7 Mensajería UI
- UI agrupa conversaciones por teléfono, permite archivar, marcar leído y eliminar. Endpoints: `/api/messages/conversation/*`. Ver `client/src/pages/Messages.tsx`, `server/routes.ts`, `server/storage.ts`.

### 5.8 Settings
- Polling WhatsApp: `/api/settings/whatsapp-polling`. Ver `client/src/pages/Settings.tsx`, `server/routes.ts`, `server/whatsappManager.ts`.
- Ventana horaria: `/api/settings/campaign-window` (overrides). Ver `client/src/pages/Settings.tsx`, `server/routes.ts`, `server/campaignEngine.ts`.
- Pausas en campañas: `/api/settings/campaign-pauses`. Ver `client/src/pages/Settings.tsx`, `server/routes.ts`, `server/campaignEngine.ts`.

## 6. API HTTP (contratos reales)

### Auth
- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Health
- `GET /api/health`

### Dashboard
- `GET /api/dashboard/stats`

### Sessions
- `GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions`, `PATCH /api/sessions/:id`, `DELETE /api/sessions/:id`
- `POST /api/sessions/:id/reconnect`, `POST /api/sessions/:id/reset-auth`, `POST /api/sessions/:id/qr`
- `POST /api/sessions/:id/send` (envío manual)

### Pools (WhatsApp)
- `GET /api/pools`, `GET /api/pools/:id`, `POST /api/pools`, `PATCH /api/pools/:id`, `DELETE /api/pools/:id`

### GSM Lines / Pools (SMS)
- `GET /api/gsm-lines`, `GET /api/gsm-lines/:id`, `POST /api/gsm-lines`, `PATCH /api/gsm-lines/:id`, `DELETE /api/gsm-lines/:id`
- `GET /api/gsm-pools`, `GET /api/gsm-pools/:id`, `POST /api/gsm-pools`, `PATCH /api/gsm-pools/:id`, `DELETE /api/gsm-pools/:id`

### Campaigns
- `GET /api/campaigns`, `GET /api/campaigns/:id`, `POST /api/campaigns`, `PATCH /api/campaigns/:id`, `DELETE /api/campaigns/:id`
- `POST /api/campaigns/:id/start`, `POST /api/campaigns/:id/pause`, `POST /api/campaigns/:id/retry-failed`

### Debtors
- `GET /api/debtors`, `GET /api/debtors/:id`, `POST /api/debtors`, `POST /api/debtors/bulk`, `PATCH /api/debtors/:id`, `DELETE /api/debtors/:id`
- `POST /api/debtors/reset`, `POST /api/debtors/cleanup`, `POST /api/debtors/release`

### Contacts
- `GET /api/contacts`, `PATCH /api/contacts/:id`

### Messages
- `GET /api/messages`
- `PATCH /api/messages/conversation/read`
- `PATCH /api/messages/conversation/archive`
- `POST /api/messages/conversation/delete`

### Logs
- `GET /api/logs`

### Settings
- `GET/POST /api/settings/whatsapp-polling`
- `GET/POST /api/settings/campaign-window`
- `GET/POST /api/settings/campaign-pauses`

## 7. Eventos Socket.IO (emisores reales)

- Sesiones: `session:created`, `session:updated`, `session:deleted`, `session:qr`, `session:ready`, `session:auth_failed`, `session:disconnected`, `session:reconnecting`. Ver `server/routes.ts`, `server/whatsappManager.ts`.
- Campañas: `campaign:started`, `campaign:paused`, `campaign:updated`, `campaign:progress`, `campaign:error`, `campaign:cooldown`. La UI usa `campaign:error` para mostrar badge/tooltip de error, sin estado `status="error"`. Ver `server/routes.ts`, `server/campaignEngine.ts`, `client/src/pages/Campaigns.tsx`.
- Mensajes: `message:created`, `message:received`. Ver `server/campaignEngine.ts`, `server/whatsappManager.ts`.

## 8. Invariantes operativas (no romper)

- **Campañas**: WhatsApp requiere `poolId` con sesiones asignadas; SMS requiere `smsPoolId` con líneas activas. Si no se cumplen, la campaña se pausa o falla. Ver `server/campaignEngine.ts`.
- **Estados de deudores**: el motor cambia `disponible → procesando → completado|fallado`. UI y reportes dependen de estos estados. Ver `server/campaignEngine.ts`, `client/src/pages/Campaigns.tsx`.
- **Templates**: `campaign.message` es obligatorio y se complementa con `messageVariants`. Tokens `{nombre}`, `{deuda}`, `{phone}`, y metadata `{<key>}` se reemplazan. Ver `server/campaignEngine.ts`, `client/src/pages/Campaigns.tsx`.
- **Storage**: `storage` transforma `_id` a `id` y tipos Date; no saltarse esta capa si se cambia persistencia. Ver `server/storage.ts`.
- **Sockets**: la UI depende de eventos para refrescar queries. Ver `client/src/lib/socket.ts`.

## 9. Configuración (env) — ver RUNBOOK.md

- Variables definidas en `server/*`, `script/*` y `vite-plugin-meta-images.ts`. Ver RUNBOOK.md para el listado completo.
- El archivo `.env` contiene valores locales **sensibles**; no se deben copiar en documentación pública.

## 9.1 Assets

- El favicon configurado en `client/index.html` apunta a `/favicon.png` (no SVG). Ver `client/index.html`.

## 10. Desalineaciones / UNKNOWN (hechos observables)

- `components.json` referencia `tailwind.config.ts`, pero ese archivo no existe en el repo → **UNKNOWN**.
- Infraestructura CI/CD, Docker, despliegue fuera de Replit: **UNKNOWN**.
