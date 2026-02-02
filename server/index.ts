import dotenv from "dotenv";
dotenv.config();

import { initFileLogging } from "./logging";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { connectDatabase } from "./db";
import { setupAuth } from "./auth";

initFileLogging();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, val) => {
      if (typeof val === "bigint") return val.toString();
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
      }
      return val;
    });
  } catch {
    return String(value);
  }
}

const LOG_HTTP_RAW = (process.env.LOG_HTTP ?? "true").trim().toLowerCase();
const LOG_HTTP_ENABLED = LOG_HTTP_RAW !== "false" && LOG_HTTP_RAW !== "0";
const LOG_HTTP_BODIES =
  (process.env.LOG_HTTP_BODY ?? "").trim().toLowerCase() === "true";
const LOG_HTTP_HEADERS =
  (process.env.LOG_HTTP_HEADERS ?? "").trim().toLowerCase() === "true";
const LOG_HTTP_ALL =
  (process.env.LOG_HTTP_ALL ?? "").trim().toLowerCase() === "true";

app.use((req, res, next) => {
  if (!LOG_HTTP_ENABLED) {
    next();
    return;
  }

  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  if (LOG_HTTP_BODIES) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (LOG_HTTP_ALL || path.startsWith("/api")) {
      const meta: Record<string, unknown> = {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: duration,
        ip: req.ip,
        userAgent: req.get("user-agent"),
      };

      if (LOG_HTTP_HEADERS) {
        meta.headers = req.headers;
      }

      if (LOG_HTTP_BODIES) {
        if (req.body !== undefined) {
          meta.requestBody = req.body;
        }
        if (capturedJsonResponse !== undefined) {
          meta.responseBody = capturedJsonResponse;
        }
      }

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (Object.keys(meta).length > 0) {
        logLine += ` :: ${safeStringify(meta)}`;
      }

      log(logLine, "http");
    }
  });

  next();
});

(async () => {
  await connectDatabase();
  const { sessionMiddleware, ensureAuthenticated } = setupAuth(app);

  // Protect all API routes except the auth routes defined in setupAuth.
  app.use("/api", ensureAuthenticated);

  await registerRoutes(httpServer, app, sessionMiddleware);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("[api] Unhandled error:", err);
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  
  // SOLUCIÓN DEFINITIVA PARA WINDOWS
  // Usar 'localhost' en lugar de '0.0.0.0'
  httpServer.listen(port, "localhost", () => {
    log(`serving on port ${port} (Windows compatible)`);
  });
})();
