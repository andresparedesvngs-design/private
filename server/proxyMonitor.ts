import net from "net";
import http from "http";
import https from "https";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { Server as SocketServer } from "socket.io";
import { storage } from "./storage";
import type { ProxyServer } from "@shared/schema";

type ProxyCheckOutcome = {
  status: "online" | "degraded" | "offline";
  lastPublicIp?: string | null;
  lastCheckAt: Date;
  lastSeenAt?: Date | null;
  latencyMs?: number | null;
  lastError?: string | null;
};

class ProxyMonitor {
  private timer: NodeJS.Timeout | null = null;
  private io?: SocketServer;
  private inFlight: Map<string, Promise<ProxyServer | null>> = new Map();

  setSocketServer(io: SocketServer) {
    this.io = io;
  }

  start() {
    if (this.timer) return;
    const intervalMs = this.getIntervalMs();
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async checkNow(id: string): Promise<ProxyServer | null> {
    const existing = this.inFlight.get(id);
    if (existing) {
      return await existing;
    }
    const proxy = await storage.getProxyServer(id);
    if (!proxy) return null;
    if (!proxy.enabled) {
      await this.ensureDisabled(proxy);
      const latest = await storage.getProxyServer(id);
      return latest ?? null;
    }
    return await this.runCheck(proxy);
  }

  private getIntervalMs(): number {
    const raw = Number(process.env.PROXY_CHECK_INTERVAL_MS ?? "15000");
    if (!Number.isFinite(raw) || raw <= 1000) {
      return 15000;
    }
    return Math.floor(raw);
  }

  private getTcpTimeoutMs(): number {
    const raw = Number(process.env.PROXY_TCP_TIMEOUT_MS ?? "2000");
    if (!Number.isFinite(raw) || raw <= 100) {
      return 2000;
    }
    return Math.floor(raw);
  }

  private getHttpTimeoutMs(): number {
    const raw = Number(process.env.PROXY_HTTP_TIMEOUT_MS ?? "8000");
    if (!Number.isFinite(raw) || raw <= 100) {
      return 8000;
    }
    return Math.floor(raw);
  }

  private getLatencyDegradedMs(): number {
    const raw = Number(process.env.PROXY_DEGRADED_LATENCY_MS ?? "2500");
    if (!Number.isFinite(raw) || raw <= 0) {
      return 2500;
    }
    return Math.floor(raw);
  }

  private getIpifyUrl(): string {
    const raw = String(process.env.PROXY_IPIFY_URL ?? "https://api.ipify.org").trim();
    return raw || "https://api.ipify.org";
  }

  private getMaxAttempts(): number {
    const raw = Number(process.env.PROXY_CHECK_RETRIES ?? "1");
    if (!Number.isFinite(raw) || raw <= 0) {
      return 1;
    }
    return Math.floor(raw);
  }

  private async tick(): Promise<void> {
    const proxies = await storage.getProxyServers();
    await Promise.all(
      proxies.map(async (proxy) => {
        if (!proxy.enabled) {
          await this.ensureDisabled(proxy);
          return;
        }
        await this.runCheck(proxy);
      })
    );
  }

  private async ensureDisabled(proxy: ProxyServer): Promise<void> {
    if (proxy.status === "offline" && proxy.lastError === "disabled") {
      return;
    }
    const now = new Date();
    const updated = await storage.updateProxyServer(proxy.id, {
      status: "offline",
      lastError: "disabled",
      lastCheckAt: now,
    });
    if (updated && this.io) {
      this.io.emit("proxy:updated", this.buildSocketPayload(updated));
    }
  }

  private async runCheck(proxy: ProxyServer): Promise<ProxyServer | null> {
    const existing = this.inFlight.get(proxy.id);
    if (existing) {
      return await existing;
    }

    const promise = (async () => {
      const outcome = await this.performCheck(proxy);
      const payload: Record<string, any> = {
        status: outcome.status,
        lastCheckAt: outcome.lastCheckAt,
        lastError: outcome.lastError ?? null,
      };
      if (outcome.lastPublicIp !== undefined) {
        payload.lastPublicIp = outcome.lastPublicIp;
      }
      if (outcome.latencyMs !== undefined) {
        payload.latencyMs = outcome.latencyMs;
      }
      if (outcome.lastSeenAt !== undefined) {
        payload.lastSeenAt = outcome.lastSeenAt;
      }

      const updated = await storage.updateProxyServer(proxy.id, payload);
      if (updated && this.io) {
        this.io.emit("proxy:updated", this.buildSocketPayload(updated));
      }
      return updated ?? null;
    })().finally(() => {
      this.inFlight.delete(proxy.id);
    });

    this.inFlight.set(proxy.id, promise);
    return await promise;
  }

  private buildSocketPayload(proxy: ProxyServer) {
    return {
      id: proxy.id,
      status: proxy.status,
      lastPublicIp: proxy.lastPublicIp ?? null,
      latencyMs: proxy.latencyMs ?? null,
      lastCheckAt: proxy.lastCheckAt ?? null,
      lastSeenAt: proxy.lastSeenAt ?? null,
    };
  }

  private async performCheck(proxy: ProxyServer): Promise<ProxyCheckOutcome> {
    const now = new Date();
    const tcpTimeoutMs = this.getTcpTimeoutMs();
    const httpTimeoutMs = this.getHttpTimeoutMs();
    const degradedThresholdMs = this.getLatencyDegradedMs();

    try {
      await this.tcpCheck(proxy.host, proxy.port, tcpTimeoutMs);
    } catch (error: any) {
      return {
        status: "offline",
        lastCheckAt: now,
        lastError: error?.message ?? String(error),
        latencyMs: null,
      };
    }

    const maxAttempts = this.getMaxAttempts();
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await this.fetchPublicIp(proxy, httpTimeoutMs);
        const status =
          result.latencyMs > degradedThresholdMs ? "degraded" : "online";
        return {
          status,
          lastPublicIp: result.ip,
          latencyMs: result.latencyMs,
          lastCheckAt: now,
          lastSeenAt: now,
          lastError: status === "online" ? null : `latency ${result.latencyMs}ms`,
        };
      } catch (error: any) {
        lastError = error?.message ?? String(error);
      }
    }

    return {
      status: "degraded",
      lastCheckAt: now,
      lastSeenAt: now,
      lastError: lastError ?? "proxy check failed",
      latencyMs: null,
    };
  }

  private async tcpCheck(host: string, port: number, timeoutMs: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      socket.setTimeout(timeoutMs);
      socket.once("error", (err) => finish(err));
      socket.once("timeout", () =>
        finish(new Error(`tcp timeout after ${timeoutMs}ms`))
      );
      socket.connect(port, host, () => finish());
    });
  }

  private async fetchPublicIp(
    proxy: ProxyServer,
    timeoutMs: number
  ): Promise<{ ip: string; latencyMs: number }> {
    const ipifyUrl = new URL(this.getIpifyUrl());
    const isHttps = ipifyUrl.protocol === "https:";
    const agent = new SocksProxyAgent(
      `socks5h://${proxy.host}:${proxy.port}`
    );
    const requestModule = isHttps ? https : http;
    const path = `${ipifyUrl.pathname}${ipifyUrl.search ?? ""}`;

    const startedAt = Date.now();
    return await new Promise((resolve, reject) => {
      const req = requestModule.request(
        {
          hostname: ipifyUrl.hostname,
          port: ipifyUrl.port ? Number(ipifyUrl.port) : isHttps ? 443 : 80,
          method: "GET",
          path,
          agent,
          headers: {
            "User-Agent": "WhatsMassive-ProxyMonitor/1.0",
          },
        },
        (res) => {
          const statusCode = res.statusCode ?? 0;
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            const latencyMs = Date.now() - startedAt;
            if (statusCode >= 400) {
              reject(new Error(`ipify status ${statusCode}`));
              return;
            }
            const ip = data.trim();
            if (!ip) {
              reject(new Error("ipify returned empty response"));
              return;
            }
            resolve({ ip, latencyMs });
          });
        }
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`ipify timeout after ${timeoutMs}ms`));
      });
      req.on("error", (err) => reject(err));
      req.end();
    });
  }
}

export const proxyMonitor = new ProxyMonitor();
