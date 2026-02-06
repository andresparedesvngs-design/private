# Master Context Document

## 1. Current Architecture Map

*   **Entry Point**: 
    *   The application entry point is `server/index.ts` for development (run with `tsx`) and `dist/index.cjs` in production.
    *   It sets up an Express server, connects to a database (`server/db.ts`), and configures authentication (`server/auth.ts`).

*   **WhatsApp Instance Management**:
    *   All WhatsApp-related logic is encapsulated in the `WhatsAppManager` class (`server/whatsappManager.ts`), which is instantiated as a singleton.
    *   `whatsapp-web.js` is instantiated as a single, isolated client per session. The `WhatsAppManager` maintains a `Map` of these clients, where each key is a unique `sessionId`.
    *   There is **no use of `worker_threads`**. All sessions run within the single main Node.js process.

*   **Authentication Strategy**:
    *   The system uses `whatsapp-web.js`'s `LocalAuth` strategy.
    *   Each session is initialized with a unique `clientId`: `new LocalAuth({ clientId: sessionId, dataPath: './.wwebjs_auth' })`.
    *   This saves authentication data for each session in its own subdirectory within the `.wwebjs_auth` folder, enabling persistent sessions that can be restored on application restart.

*   **Database and Storage**:
    *   The project uses `mongoose` for database interaction, indicating a MongoDB database. The connection logic is in `server/db.ts`.
    *   A generic `storage` object, defined in `server/storage.ts` (this file was not explicitly read, but its usage is inferred from `server/routes.ts`), provides an abstraction layer for all database operations (CRUD for sessions, users, campaigns, etc.).

## 2. Critical Dependencies Inventory

*   **`whatsapp-web.js`**: `^1.34.4`
*   **`puppeteer`**: `^24.35.0`
*   **`express`**: `^4.21.2`
*   **`mongoose`**: `^8.0.0`
*   **`socket.io`**: `^4.8.3`
*   **`tsx`**: `^4.20.5` (for running TypeScript directly)
*   **Unused Dependencies**: Based on a brief analysis, most of the installed dependencies appear to be in use, especially the UI-related ones in the `client` directory. A deep analysis was not performed, but no obviously unused critical dependencies were found.

## 3. Data Flow (`npm start`)

The `npm start` command executes `cross-env NODE_ENV=production node dist/index.cjs`. Here is the step-by-step flow:

1.  **Initialization**: `server/index.ts` (the source for `dist/index.cjs`) is executed.
2.  **Environment**: `dotenv` loads environment variables.
3.  **Server Setup**: An Express app and a standard `http` server are created.
4.  **Database**: `connectDatabase()` establishes a connection to MongoDB.
5.  **Authentication**: `setupAuth(app)` configures Passport.js for user authentication against the database.
6.  **Route Registration**: `registerRoutes(httpServer, app, sessionMiddleware)` is called. This is the core setup function.
7.  **Socket.IO**: Inside `registerRoutes`, a Socket.IO server is created and attached to the HTTP server to enable real-time communication with the frontend.
8.  **WhatsApp Session Restore**: Crucially, `whatsappManager.restoreSessions()` is called. This method fetches all sessions from the database that had a `status` of `'connected'` and attempts to re-initialize them by calling `whatsappManager.createSession()` for each one.
9.  **API Endpoints**: A comprehensive set of RESTful API endpoints are registered to manage sessions, campaigns, users, etc. These endpoints interact with the `whatsappManager` for actions (e.g., `POST /api/sessions`) and the `storage` module for data persistence.
10. **Static Files**: For production, `serveStatic(app)` configures Express to serve the built React frontend from the `dist` or a similar directory. In development, `setupVite(httpServer, app)` is used instead.
11. **Server Listening**: The HTTP server starts listening for requests on the configured port (defaulting to 5000).

## 4. Readiness State (Gap Analysis)

Comparing the current implementation to the target architecture reveals the following missing components:

*   **No Worker Threads (`worker_threads`)**: The current architecture runs all WhatsApp sessions in a single Node.js process. There is no implementation of `worker_threads` to isolate sessions into separate threads for performance and stability.
*   **No ADB Integration**: There is absolutely no code related to Android Debug Bridge (ADB) for controlling physical devices.
*   **No Proxy Management**: The Puppeteer configuration is basic and does not include any logic for assigning or rotating proxies (mobile or otherwise) to the browser instances.
*   **Manual Session Management**: Session management is essentially manual. While sessions are persisted and restored, the creation of new sessions is triggered via an API call (`POST /api/sessions`). The system is not designed to scale to 50 sessions automatically.
*   **No Advanced Session Orchestration**: There is no higher-level logic to distribute load across sessions, manage session health beyond basic connectivity checks, or handle automated session rotation.

---

### CONTEXTO PARA PROMPTS FUTUROS

Mi proyecto es una aplicación Node.js con un frontend de React. El backend usa Express, Mongoose (MongoDB) y `whatsapp-web.js`. Actualmente, la arquitectura gestiona múltiples sesiones de WhatsApp de forma persistente usando `LocalAuth`, guardando cada sesión en su propia carpeta. Todas las sesiones se ejecutan en un único hilo de Node.js. No hay implementación de `worker_threads`, control de dispositivos a través de ADB, ni rotación de proxies. La creación y restauración de sesiones son manejadas por un `WhatsAppManager` central a través de una API REST. El objetivo es evolucionar este sistema para soportar 50 sesiones concurrentes usando `worker_threads` y proxies móviles controlados por ADB.
