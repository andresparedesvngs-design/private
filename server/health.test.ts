import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { registerHealthRoute } from "./health";

describe("GET /api/health", () => {
  it("returns ok:true", async () => {
    const app = express();
    registerHealthRoute(app);

    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
