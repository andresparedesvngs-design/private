# PROJECT_MAP

## Raíz del repositorio

- `package.json` — scripts de ejecución y dependencias.
- `tsconfig.json` — configuración de TypeScript.
- `vite.config.ts` — configuración Vite (alias, plugins, root `client/`).
- `vitest.config.ts` — configuración de tests con Vitest.
- `postcss.config.js` — PostCSS + Tailwind.
- `components.json` — configuración shadcn/ui (referencia `tailwind.config.ts`, ver notas en AI_CONTEXT.md).
- `vite-plugin-meta-images.ts` — plugin para OG/Twitter meta en despliegues Replit.
- `.env` — variables de entorno locales (contiene secretos).
- `.replit` / `replit.md` — configuración Replit y documentación (posiblemente desactualizada).
- `AI_CONTEXT.md`, `PROJECT_MAP.md`, `TESTING.md`, `RUNBOOK.md` — documentación interna.

## Backend (`server/`)

- `server/index.ts` — entrypoint Express; logging HTTP; auth; registro de rutas; integración Vite (dev) / static (prod).
- `server/routes.ts` — API REST + Socket.IO; endpoints para sesiones, pools, campañas, deudores, mensajes, settings, logs.
- `server/proxyMonitor.ts` — worker de health-check para Proxy Servers (TCP + ipify via SOCKS5) y eventos Socket.IO.
- `server/auth.ts` — Passport Local, sesiones y middleware de autorización; conecta auth con Socket.IO.
- `server/db.ts` — conexión MongoDB con Mongoose.
- `server/storage.ts` — implementación de `MongoStorage` + helpers de negocio.
- `server/campaignEngine.ts` — motor de campañas (envíos, pausas, fallback, progreso).
- `server/whatsappManager.ts` — gestión de sesiones WhatsApp Web, QR, polling, mensajes entrantes.
- `server/healthPolicy.ts` — política de salud de sesiones (strikes/cooldown/blocked) + normalización de límites/counters.
- `server/rateLimiter.ts` — rate limiter in-memory por sesión (token bucket) para límite por minuto.
- `server/smsManager.ts` — envío SMS (Infobip, SMS Gate, HTTP genérico) + normalización.
- `server/logging.ts` — logger a archivos con niveles y formato.
- `server/vite.ts` — middleware Vite para dev.
- `server/static.ts` — servir estáticos en prod.
- `server/smsManager.test.ts` — test unitario de normalización de números (Vitest).
- `server/healthPolicy.test.ts` — tests unitarios para health policy (Vitest).
- `server/rateLimiter.test.ts` — tests unitarios para token bucket limiter (Vitest).

## Shared (`shared/`)

- `shared/schema.ts` — esquemas Zod + modelos Mongoose + tipos TypeScript compartidos.

## Frontend (`client/`)

- `client/index.html` — HTML base y meta tags.
- `client/src/main.tsx` — bootstrap React.
- `client/src/App.tsx` — router (wouter), providers y AuthGate.
- `client/src/components/` — layout, auth y UI (shadcn/ui).
- `client/src/pages/` — vistas principales: Dashboard, Sessions, Campaigns, Debtors, Contacts, Messages, Settings, SystemLogs, ProxyServers, NotFound.
- `client/src/lib/` — API client (React Query), sockets, utils y queryClient.
- `client/src/hooks/` — hooks de UI.
- `client/public/` — assets públicos (opengraph, favicon).

## Scripts (`script/`)

- `script/build.ts` — build: Vite client + esbuild server.
- `script/runCampaignTests.ts` — script de smoke test contra API.
- `script/sendSmsTest.ts` — envío de SMS de prueba usando una línea GSM.
- `script/checkSmsState.ts` — inspección rápida de estado GSM/campañas/deudores.
- `script/getRoot.ts` — fetch simple a URL fija (debug).

## Directorios generados / runtime

- `dist/` — salida de build (server + client).
- `logs/` — logs del servidor (si LOG_FILE_MODE != off).
- `uploads/` — destino para `multer` (no hay ruta activa confirmada).
- `.wwebjs_auth/`, `.wwebjs_cache/` — datos de sesión de WhatsApp Web.
- `node_modules/` — dependencias.
