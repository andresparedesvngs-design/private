import { describe, expect, it } from "vitest";
import { whatsappManager } from "./whatsappManager";

describe("whatsappManager auto reconnect guard", () => {
  it("blocks auto reconnect for disconnected sessions", () => {
    const guard = (whatsappManager as any).getAutoReconnectGuard({
      status: "disconnected",
      healthStatus: "warning",
      cooldownUntil: null,
    });
    expect(guard.blocked).toBe(true);
    expect(guard.reason).toBe("disconnected");
  });

  it("blocks auto reconnect for cooldown sessions", () => {
    const guard = (whatsappManager as any).getAutoReconnectGuard({
      status: "connected",
      healthStatus: "cooldown",
      cooldownUntil: new Date(Date.now() + 60_000),
    });
    expect(guard.blocked).toBe(true);
    expect(guard.reason).toBe("cooldown");
  });

  it("allows auto reconnect for healthy reconnecting sessions", () => {
    const guard = (whatsappManager as any).getAutoReconnectGuard({
      status: "reconnecting",
      healthStatus: "healthy",
      cooldownUntil: null,
    });
    expect(guard.blocked).toBe(false);
    expect(guard.reason).toBeNull();
  });
});
