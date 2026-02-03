import type { Express } from "express";

export function registerHealthRoute(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
}
