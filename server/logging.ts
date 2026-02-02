import fs from "fs";
import path from "path";
import util from "util";

type LogMode = "daily" | "startup" | "off";
type LogLevel = "error" | "warn" | "info" | "debug";
type LogFormat = "plain" | "json";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  error: 40,
  warn: 30,
  info: 20,
  debug: 10,
};

let initialized = false;
let currentStamp = "";
let stream: fs.WriteStream | null = null;
let mode: LogMode = "off";
let logDir = "logs";
let minLevel: LogLevel = "info";
let logFormat: LogFormat = "plain";

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function getLocalDateStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function getStartupStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${y}-${m}-${d}_${hh}${mm}${ss}`;
}

function resolveMode(): LogMode {
  const raw = (process.env.LOG_FILE_MODE ?? "").trim().toLowerCase();
  if (!raw || raw === "off" || raw === "false" || raw === "0") {
    return "off";
  }
  if (raw === "startup" || raw === "start") {
    return "startup";
  }
  if (raw === "daily" || raw === "day" || raw === "true" || raw === "1") {
    return "daily";
  }
  return "off";
}

function resolveLogDir(): string {
  const raw = (process.env.LOG_DIR ?? "").trim();
  return raw || "logs";
}

function resolveLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").trim().toLowerCase();
  if (raw === "error") return "error";
  if (raw === "warn" || raw === "warning") return "warn";
  if (raw === "debug") return "debug";
  return "info";
}

function resolveLogFormat(): LogFormat {
  const raw = (process.env.LOG_FORMAT ?? "").trim().toLowerCase();
  return raw === "json" ? "json" : "plain";
}

function shouldWrite(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[minLevel];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  if (value instanceof Error) return false;
  if (Array.isArray(value)) return false;
  return Object.prototype.toString.call(value) === "[object Object]";
}

function safeJson(value: unknown): string {
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
    return `"${util.format(value)}"`;
  }
}

function openStream(nextStamp: string) {
  if (stream) {
    stream.end();
  }
  currentStamp = nextStamp;
  const filename =
    mode === "startup"
      ? `server-${nextStamp}.log`
      : `server-${nextStamp}.log`;
  fs.mkdirSync(logDir, { recursive: true });
  const filepath = path.join(logDir, filename);
  stream = fs.createWriteStream(filepath, { flags: "a" });
}

function ensureStream() {
  if (mode === "off") return;

  if (mode === "daily") {
    const today = getLocalDateStamp();
    if (!stream || currentStamp !== today) {
      openStream(today);
    }
    return;
  }

  if (!stream) {
    openStream(getStartupStamp());
  }
}

function writeLine(level: string, args: unknown[]) {
  const normalized = level.toLowerCase() as LogLevel;
  if (!shouldWrite(normalized)) {
    return;
  }
  ensureStream();
  if (!stream) return;

  const meta = args.length ? args[args.length - 1] : undefined;
  const hasMeta = isPlainObject(meta);
  const messageArgs = hasMeta ? args.slice(0, -1) : args;
  const message = util.format(...messageArgs);

  if (logFormat === "json") {
    const payload: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: normalized,
      msg: message,
      pid: process.pid,
    };
    if (hasMeta) {
      payload.meta = meta;
    }
    stream.write(`${safeJson(payload)}\n`);
    return;
  }

  const metaSuffix = hasMeta ? ` :: ${safeJson(meta)}` : "";
  const line = `[${new Date().toISOString()}] [${level}] ${message}${metaSuffix}\n`;
  stream.write(line);
}

export function initFileLogging(): void {
  if (initialized) return;
  initialized = true;

  mode = resolveMode();
  logDir = resolveLogDir();
  minLevel = resolveLogLevel();
  logFormat = resolveLogFormat();

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
  });

  if (mode === "off") {
    return;
  }

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  console.log = (...args: unknown[]) => {
    writeLine("INFO", args);
    original.log(...args);
  };

  console.info = (...args: unknown[]) => {
    writeLine("INFO", args);
    original.info(...args);
  };

  console.warn = (...args: unknown[]) => {
    writeLine("WARN", args);
    original.warn(...args);
  };

  console.error = (...args: unknown[]) => {
    writeLine("ERROR", args);
    original.error(...args);
  };

  console.debug = (...args: unknown[]) => {
    writeLine("DEBUG", args);
    original.debug(...args);
  };

  process.on("exit", () => {
    if (stream) {
      stream.end();
      stream = null;
    }
  });
}
