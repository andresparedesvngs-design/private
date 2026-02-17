import path from "path";

export const DEFAULT_PORT = 5000;
export const DEFAULT_MONGO_URI = "mongodb://localhost:27017/whatsapp_campaigns";
export const DEFAULT_SOCKET_PATH = "/socket.io";
export const DEFAULT_WWEBJS_AUTH_DIR = ".wwebjs_auth";

export function getNodeEnv(): string {
  return (process.env.NODE_ENV ?? "development").trim().toLowerCase();
}

export function isProductionEnv(): boolean {
  return getNodeEnv() === "production";
}

export function getPort(): number {
  const parsed = Number.parseInt(process.env.PORT ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_PORT;
}

export function getMongoUri(): string {
  return (process.env.MONGO_URI ?? process.env.MONGODB_URI ?? "").trim();
}

export function getMongoUriOrDefault(): string {
  return getMongoUri() || DEFAULT_MONGO_URI;
}

function splitCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getSocketOriginAllowlist(): string[] {
  const raw =
    (process.env.SOCKET_ORIGIN ?? process.env.CORS_ORIGIN ?? "").trim();
  if (raw) {
    return splitCsv(raw);
  }

  const baseUrl = (process.env.BASE_URL ?? "").trim();
  return baseUrl ? [baseUrl] : [];
}

export function getSocketPath(): string {
  const raw = (process.env.SOCKET_PATH ?? DEFAULT_SOCKET_PATH).trim();
  if (!raw) {
    return DEFAULT_SOCKET_PATH;
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

export function resolveWwebjsAuthDir(): string {
  const raw = (process.env.WWEBJS_AUTH_DIR ?? "").trim();
  const target = raw || DEFAULT_WWEBJS_AUTH_DIR;
  return path.resolve(target);
}

export function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}
