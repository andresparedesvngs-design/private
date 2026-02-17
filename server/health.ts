import type { Express } from "express";
import mongoose from "mongoose";
import { getNodeEnv } from "./env";

export function registerHealthRoute(app: Express) {
  app.get("/api/health", (_req, res) => {
    const stateByCode: Record<number, string> = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };
    const stateCode = mongoose.connection.readyState;
    const dbState = stateByCode[stateCode] ?? "unknown";
    const dbConnected = stateCode === 1;

    res.json({
      ok: true,
      env: getNodeEnv(),
      timestamp: new Date().toISOString(),
      uptimeSec: Math.floor(process.uptime()),
      db: {
        connected: dbConnected,
        state: dbState,
        name: mongoose.connection.name || null,
        host: mongoose.connection.host || null,
      },
    });
  });
}
