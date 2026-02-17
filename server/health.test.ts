import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { registerHealthRoute } from "./health";

describe("GET /api/health", () => {
  it("returns process and db status", async () => {
    const app = express();
    registerHealthRoute(app);

    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(typeof response.body.env).toBe("string");
    expect(typeof response.body.timestamp).toBe("string");
    expect(typeof response.body.uptimeSec).toBe("number");
    expect(typeof response.body.db?.connected).toBe("boolean");
    expect(typeof response.body.db?.state).toBe("string");
  });
});
