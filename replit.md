# WhatsMassive - Command Center

## Overview

WhatsMassive es una plataforma de mensajería masiva orientada a campañas de WhatsApp y SMS. Gestiona sesiones de WhatsApp, pools de enrutamiento, campañas, deudores, mensajes y logs en tiempo real.

## Status

Este documento fue actualizado para reflejar el stack real (MongoDB + Mongoose). Referencias anteriores a PostgreSQL/Drizzle deben considerarse obsoletas.

## System Architecture

### Frontend Architecture
- **Framework**: React con TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI Components**: shadcn/ui (Radix UI)
- **Styling**: Tailwind CSS
- **Real-time Updates**: Socket.IO client
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js con Express
- **Language**: TypeScript (tsx en desarrollo)
- **API Design**: REST bajo `/api`
- **Real-time Communication**: Socket.IO server
- **WhatsApp Integration**: whatsapp-web.js + Puppeteer
- **Auth**: Passport Local con sesiones en memoria

### Data Layer
- **Database**: MongoDB vía Mongoose
- **Schemas/Types**: `shared/schema.ts` (Zod + Mongoose)

### Key Domain Models
1. **Sessions**: Conexiones WhatsApp con QR, estados y métricas
2. **Pools**: Grupos de sesiones con estrategias de distribución
3. **Campaigns**: Trabajos de mensajería masiva con progreso
4. **Debtors**: Contactos con estado de envío
5. **Messages**: Historial de mensajes enviados/recibidos
6. **SystemLogs**: Auditoría del sistema

### Campaign Engine
El motor de campañas (`server/campaignEngine.ts`) gestiona campañas activas, distribución por pools, pausas configurables y eventos Socket.IO para la UI.

## External Dependencies

### Database
- **MongoDB**: almacenamiento principal (Mongoose).

### WhatsApp Integration
- **whatsapp-web.js** + **Puppeteer** para automatizar WhatsApp Web.
- **qrcode** para QR de autenticación.

### File Processing
- **xlsx** para importar/exportar datos (deudores/campañas).

### Real-time Communication
- **socket.io** para actualizaciones en vivo.

### SMS
- Integración por plantillas de URL (Infobip, SMS Gate o HTTP genérico) vía `smsManager.ts`.
