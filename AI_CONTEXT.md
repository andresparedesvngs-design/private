# AI Context for "rest-express" Project

## 1. Project Overview

This is a full-stack web application designed as a marketing and communication automation platform. Its core functionality revolves around managing contacts, creating and running campaigns, and sending messages via WhatsApp and SMS. The application provides a web-based UI for users to manage these activities.

The project is structured as a monorepo with two main parts:
- A **React frontend** located in the `client` directory.
- A **Node.js/Express backend** located in the `server` directory.

## 2. Technologies, Languages, and Frameworks

### Backend
- **Language:** TypeScript
- **Framework:** Express.js
- **Database:** MongoDB (using Mongoose as the ODM)
- **Real-time Communication:** Socket.IO
- **Authentication:** Passport.js for session-based authentication.
- **Messaging:**
  - `whatsapp-web.js`: For interacting with WhatsApp, likely for sending messages and managing a WhatsApp bot. This uses Puppeteer for browser automation.
  - An `smsManager.ts` module suggests SMS sending capabilities, although the specific provider is not immediately clear.
- **File Handling:** `multer` for file uploads and `xlsx` for parsing Excel files (likely for importing contacts).
- **Runtime:** `tsx` for running TypeScript in development and `node` for production.

### Frontend
- **Language:** TypeScript
- **Framework:** React
- **Build Tool:** Vite
- **Routing:** `wouter`
- **Styling:** Tailwind CSS with a UI component library based on `shadcn/ui` and `@radix-ui`.
- **Data Fetching & State Management:** `@tanstack/react-query` for server state management and `socket.io-client` for real-time updates.
- **UI Components:** A rich set of custom components is available in `client/src/components/ui`.

### Shared
- **Data Validation:** `zod` is used for schema definition and validation, with schemas shared between the frontend and backend in the `shared/schema.ts` file.

## 3. Architecture and Structure

### Backend (`server/`)
- **`index.ts`**: The main entry point for the Express server.
- **`routes.ts`**: Defines all API endpoints.
- **`db.ts`**: Manages the connection to the MongoDB database.
- **`auth.ts`**: Handles user authentication logic using Passport.js.
- **`whatsappManager.ts`**: A critical module that encapsulates the logic for interacting with WhatsApp.
- **`smsManager.ts`**: Manages SMS sending functionality.
- **`campaignEngine.ts`**: Contains the core logic for executing marketing/communication campaigns.
- **`storage.ts`**: Handles file storage for uploads.
- **`vite.ts` / `static.ts`**: Serve the Vite development server and static frontend assets, respectively.

### Frontend (`client/`)
- **`src/main.tsx`**: The entry point for the React application.
- **`src/App.tsx`**: The root component, which likely sets up routing and global providers.
- **`src/pages/`**: Contains the main views of the application, such as `Dashboard.tsx`, `Campaigns.tsx`, `Contacts.tsx`, etc.
- **`src/components/`**: Contains reusable UI components, including a large set of `shadcn/ui`-style components in the `ui` subdirectory.
- **`src/lib/`**: Contains utility functions, the API client (`api.ts`), the Socket.IO client (`socket.ts`), and the React Query client (`queryClient.ts`).
- **`src/hooks/`**: Contains custom React hooks.

## 4. Main System Flows

1.  **Authentication Flow**:
    - The user logs in via a form on the `Login.tsx` page.
    - The server's `auth.ts` module, using Passport.js, validates the credentials against the database.
    - A session is created for the user.
    - The frontend receives a success response and navigates the user to the main dashboard.

2.  **Campaign Execution Flow**:
    - A user creates a campaign through the UI (likely in `Campaigns.tsx`).
    - The campaign details are sent to the backend and saved in the database.
    - The `campaignEngine.ts` is triggered to start the campaign.
    - The engine iterates through the campaign's contacts and uses `whatsappManager.ts` and/or `smsManager.ts` to send messages.
    - The status of the campaign and individual messages is updated in the database and communicated to the frontend in real-time via Socket.IO.

3.  **Real-time Updates Flow**:
    - The frontend establishes a WebSocket connection to the server using Socket.IO.
    - When events occur on the server (e.g., a new message is received, a WhatsApp session is established, campaign progress updates), the server emits events via Socket.IO.
    - The frontend listens for these events and updates the UI accordingly, providing a real-time experience.

## 5. Important Considerations

- **WhatsApp Integration**: The `whatsapp-web.js` library is a key part of this application. It works by automating a real WhatsApp Web session in the background. This can be brittle and may require careful handling of authentication, session management, and potential blocking by WhatsApp. The `whatsappManager.ts` is the central place for this logic.
- **Monorepo Structure**: The separation between `client` and `server` is clear, but they share schemas via the `shared` directory. When making changes to data structures, always update the Zod schemas in `shared/schema.ts` to maintain consistency.
- **UI Components**: The project uses a rich set of pre-built UI components in `client/src/components/ui`. Before creating a new component, check if one already exists.
- **Environment Variables**: The application likely uses a `.env` file (as suggested by the `dotenv` package) to manage configuration for the database, session secrets, and other sensitive information. This file is not checked into version control.
- **Scripts**: The `script/` directory contains useful scripts for building the project (`build.ts`) and for testing specific functionalities (`sendSmsTest.ts`, `runCampaignTests.ts`).

## 6. Key Issues and Recommendations for AI

This section summarizes the findings of a code review and provides guidance for future modifications.

### Critical Issues
- **Mass Assignment Vulnerability:**
  - **Location:** Multiple `PATCH` endpoints in `server/routes.ts`.
  - **Problem:** `req.body` is passed directly to the database update functions, allowing attackers to modify any field.
  - **Action:** **Always validate `req.body` for any `PATCH` request using a Zod schema (`.partial()`)** that only includes fields the user is allowed to change. Do not pass the raw body to the storage layer.

- **Hardcoded CORS Origin:**
  - **Location:** `server/routes.ts` in the `SocketServer` configuration.
  - **Problem:** The `origin` is hardcoded to `http://localhost:5000`, which will fail in production.
  - **Action:** The CORS origin must be loaded from environment variables (e.g., `process.env.CORS_ORIGIN`).

### Medium & Minor Issues to Address
- **Inconsistent Error Handling:**
  - **Problem:** `try...catch` blocks are duplicated in every route handler, and error messages can leak internal details.
  - **Action:** When adding new routes, use a centralized async error handling wrapper that passes errors to the global error handler in `index.ts`. Avoid sending raw `error.message` to the client.

- **Lack of Automated Tests:**
  - **Problem:** The project lacks a testing framework and test cases.
  - **Action:** When adding new features or fixing bugs, create corresponding unit or integration tests using a framework like `vitest` or `jest`.

- **Verbose Logging:**
  - **Problem:** The default logging configuration can log sensitive request/response bodies.
  - **Action:** Ensure that logging of sensitive information is disabled in production environments. Use the centralized logger instead of `console.log`.