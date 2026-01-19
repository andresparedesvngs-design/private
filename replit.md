# WhatsMassive - Command Center

## Overview

WhatsMassive is a bulk WhatsApp messaging platform designed for managing mass communication campaigns. The system provides WhatsApp session management, campaign orchestration with routing pools, debtor contact management, and real-time message tracking. It enables users to connect multiple WhatsApp accounts, organize them into pools with different distribution strategies, and execute targeted messaging campaigns at scale.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state caching and synchronization
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom CSS variables for theming
- **Real-time Updates**: Socket.io client for WebSocket communication
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript compiled with tsx for development
- **API Design**: RESTful endpoints under `/api` prefix
- **Real-time Communication**: Socket.io server for bidirectional events
- **WhatsApp Integration**: whatsapp-web.js library with Puppeteer for browser automation
- **Session Persistence**: LocalAuth strategy for maintaining WhatsApp sessions

### Data Layer
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migration Strategy**: Drizzle Kit with `db:push` command for schema synchronization
- **Validation**: Zod schemas generated from Drizzle tables using drizzle-zod

### Key Domain Models
1. **Sessions**: WhatsApp account connections with status, QR codes, and message counts
2. **Pools**: Groups of sessions with distribution strategies (competitive, fixed turns, random turns)
3. **Campaigns**: Bulk messaging jobs with progress tracking and pool assignment
4. **Debtors**: Contact records with phone numbers, debt amounts, and messaging status
5. **Messages**: Individual message records with delivery tracking
6. **SystemLogs**: Application-level logging for debugging and monitoring

### Campaign Engine
The system includes a dedicated campaign processing engine (`server/campaignEngine.ts`) that:
- Manages active campaign state
- Distributes messages across pool sessions
- Tracks delivery progress in real-time
- Emits Socket.io events for frontend updates

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage for Express sessions

### WhatsApp Integration
- **whatsapp-web.js**: Core library for WhatsApp Web automation
- **Puppeteer**: Headless browser for WhatsApp Web client
- **qrcode**: QR code generation for session authentication

### File Processing
- **multer**: File upload handling for debtor imports
- **xlsx**: Excel file parsing for contact imports
- **csv-parser**: CSV file parsing support

### Real-time Communication
- **socket.io**: WebSocket server and client for live updates

### Third-Party Services
The attached assets suggest potential future integrations but the current codebase is self-contained with no external API dependencies beyond the database.