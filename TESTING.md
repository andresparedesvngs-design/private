# TESTING

## Tests existentes (confirmados en código)

- **Vitest** configurado en `vitest.config.ts`.
- **Unitarios**:
  - `server/smsManager.test.ts` (normalización de números en `SmsManager`).
  - `server/campaignEngine.helpers.test.ts` (selección de templates).
  - `server/whatsappManager.normalizePhoneForWhatsapp.test.ts` (normalización de teléfonos).
  - `client/src/lib/utils.test.ts` (helpers de ObjectId).
- **Integración ligera**:
  - `server/health.test.ts` (GET `/api/health` en Express, sin DB).

### Cómo correrlos

- `npm test`
- `npm test -- --run` (modo CI, sin watch)

## Scripts de verificación manual (no son tests automáticos)

- `script/runCampaignTests.ts` — smoke test de API que crea campañas y deudores y las inicia; requiere credenciales y pools existentes.
- `script/sendSmsTest.ts` — envía SMS usando una línea GSM del Mongo; requiere `MONGODB_URI` y una línea configurada.
- `script/checkSmsState.ts` — imprime estado básico de líneas/pools/campañas/deudores/mensajes.
- `script/getRoot.ts` — request a una URL fija; utilidad de debugging.

## Cobertura faltante (hechos observables)

- No hay tests de frontend (React) de render en el repo.
- Solo hay integración para `/api/health`; no hay tests de rutas Express críticas ni de `storage`/`campaignEngine` end-to-end.
- No hay fixtures ni mocks para WhatsApp Web; ese flujo es **UNKNOWN** en automatización.

## Plan mínimo realista (sin inventar infraestructura)

1) **API unit/integration**: agregar tests con `supertest` para rutas críticas en `server/routes.ts` (auth, campañas, deudores, mensajes). 
2) **CampaignEngine**: tests unitarios con storage mock (simular debtors/pools/sessions) para validar pausas, fallback y cambios de estado.
3) **Storage**: tests con Mongo local (o Mongo en contenedor) para helpers `resetDebtors*` y `assignAvailableOrphanDebtorsToCampaign`.
4) **SMS Manager**: ampliar tests existentes para plantillas HTTP/Infobip/SMS Gate (mock `fetch`).
5) **Frontend**: smoke tests de render básico por página (React Testing Library). 

Si no se agrega infraestructura de contenedores, los puntos 1–3 quedan **UNKNOWN** en CI.
