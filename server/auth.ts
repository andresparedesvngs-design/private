import type { Express, RequestHandler } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Server as SocketServer } from "socket.io";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import type { User } from "@shared/schema";

export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "supervisor" | "executive";
  displayName?: string | null;
  executivePhone?: string | null;
  permissions: string[];
  notifyEnabled: boolean;
  notifyBatchWindowSec: number;
  notifyBatchMaxItems: number;
  legacy?: boolean;
}

const SESSION_COOKIE_NAME = "wm.sid";
const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_SESSION_SECRET = "dev-session-secret-change-me";

const isTruthyEnv = (value: string | undefined) => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
};

function getAdminCredentials(options?: {
  allowDefaults?: boolean;
}): { username: string; password: string } | null {
  const allowDefaults = options?.allowDefaults ?? true;
  const envUsername = (process.env.ADMIN_USERNAME ?? "").trim();
  const envPassword = (process.env.ADMIN_PASSWORD ?? "").trim();

  if (envUsername && envPassword) {
    return { username: envUsername, password: envPassword };
  }

  if (!allowDefaults) {
    return null;
  }

  console.warn(
    "[auth] Using default admin credentials. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env."
  );
  return { username: DEFAULT_ADMIN_USERNAME, password: DEFAULT_ADMIN_PASSWORD };
}

function getSessionSecret() {
  const secret = (process.env.SESSION_SECRET ?? "").trim() || DEFAULT_SESSION_SECRET;
  if (!process.env.SESSION_SECRET) {
    console.warn("[auth] Using default SESSION_SECRET. Set SESSION_SECRET in .env.");
  }
  return secret;
}

export async function createAdminIfMissing(): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const adminCount = await storage.getActiveAdminCount();
  if (adminCount > 0) {
    return;
  }

  const allowDefaults = !isProduction || isTruthyEnv(process.env.ALLOW_INSECURE_DEFAULTS);
  const creds = getAdminCredentials({ allowDefaults });
  if (!creds) {
    throw new Error(
      "[auth] No active admin users and ADMIN_USERNAME/ADMIN_PASSWORD not set. Refusing to start."
    );
  }

  const isDefaultCombo =
    creds.username.trim().toLowerCase() === DEFAULT_ADMIN_USERNAME &&
    creds.password === DEFAULT_ADMIN_PASSWORD;
  if (
    isProduction &&
    isDefaultCombo &&
    !isTruthyEnv(process.env.ALLOW_DEFAULT_ADMIN_CREDENTIALS)
  ) {
    throw new Error(
      "[auth] Refusing to bootstrap with default admin credentials in production. Set ADMIN_USERNAME/ADMIN_PASSWORD or ALLOW_DEFAULT_ADMIN_CREDENTIALS=true."
    );
  }

  const { username: rawUsername, password } = creds;
  const username = rawUsername.trim().toLowerCase();

  if (!username || !password) {
    console.warn("[auth] ADMIN_USERNAME/ADMIN_PASSWORD missing; cannot bootstrap admin.");
    return;
  }

  const existing = await storage.getUserByUsername(username);
  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    await storage.updateUser(existing.id, { role: "admin", active: true });
    await storage.updateUserPassword(existing.id, passwordHash);
    await storage.createSystemLog({
      level: "warning",
      source: "bootstrap",
      message: "Promoted existing user to admin (bootstrap).",
      metadata: { userId: existing.id, username },
    });
    return;
  }

  const created = await storage.createUser({
    username,
    passwordHash,
    role: "admin",
    active: true,
    displayName: "Administrador",
    permissions: [],
    notifyEnabled: true,
    notifyBatchWindowSec: 120,
    notifyBatchMaxItems: 5,
  });

  await storage.createSystemLog({
    level: "warning",
    source: "bootstrap",
    message: "Created admin user (bootstrap).",
    metadata: { userId: created.id, username },
  });
}

export async function logAdminStatus(): Promise<void> {
  const users = await storage.getUsers();
  const admins = users.filter((user) => user.role === "admin" && user.active);
  if (admins.length === 0) {
    console.warn("[auth] No active admin users found in DB.");
    await storage.createSystemLog({
      level: "warning",
      source: "bootstrap",
      message: "No active admin users found in DB.",
      metadata: { count: 0 },
    });
    return;
  }

  const safeAdmins = admins.map((admin) => ({
    id: admin.id,
    username: admin.username,
    role: admin.role,
    active: admin.active,
  }));

  console.log("[auth] Active admins:", safeAdmins);
  await storage.createSystemLog({
    level: "info",
    source: "bootstrap",
    message: "Active admin users found in DB.",
    metadata: { count: safeAdmins.length, admins: safeAdmins },
  });
}

export function setupAuth(app: Express): {
  sessionMiddleware: RequestHandler;
  ensureAuthenticated: RequestHandler;
} {
  const isProduction = process.env.NODE_ENV === "production";
  const allowInsecureDefaults =
    !isProduction || isTruthyEnv(process.env.ALLOW_INSECURE_DEFAULTS);
  const sessionCookieSecureRaw = (
    process.env.SESSION_COOKIE_SECURE ?? ""
  )
    .trim()
    .toLowerCase();
  const sessionCookieSecure =
    sessionCookieSecureRaw === "true"
      ? true
      : sessionCookieSecureRaw === "false"
        ? false
        : isProduction;
  const sessionSecret = getSessionSecret();
  if (
    isProduction &&
    sessionSecret === DEFAULT_SESSION_SECRET &&
    !isTruthyEnv(process.env.ALLOW_INSECURE_SESSION_SECRET)
  ) {
    throw new Error(
      "[auth] SESSION_SECRET is not set (or is default) in production. Refusing to start. Set SESSION_SECRET or ALLOW_INSECURE_SESSION_SECRET=true."
    );
  }

  const adminCredsForLegacy = getAdminCredentials({
    allowDefaults: allowInsecureDefaults,
  });
  const adminUsername = adminCredsForLegacy?.username ?? "";
  const adminPassword = adminCredsForLegacy?.password ?? "";
  const allowLegacyLogin = isProduction
    ? isTruthyEnv(process.env.ALLOW_LEGACY_ADMIN_LOGIN)
    : true;

  const MemoryStore = createMemoryStore(session);
  const memoryStore = new MemoryStore({
    checkPeriod: 1000 * 60 * 60 * 24,
  });

  const sessionStoreMode = (
    process.env.SESSION_STORE ?? (isProduction ? "mongo" : "memory")
  )
    .trim()
    .toLowerCase();

  const resolveMongoSessionStore = () => {
    const mongoUrl = (process.env.MONGODB_URI ?? "").trim();
    if (!mongoUrl && mongoose.connection.readyState !== 1) {
      if (isProduction) {
        throw new Error(
          "[auth] SESSION_STORE=mongo requires MONGODB_URI (or an active mongoose connection)."
        );
      }
      return null;
    }

    const ttlSeconds = Math.ceil(ONE_WEEK_MS / 1000);
    try {
      if (mongoose.connection.readyState === 1) {
        return MongoStore.create({
          client: mongoose.connection.getClient(),
          collectionName: "sessions",
          ttl: ttlSeconds,
          autoRemove: "native",
        });
      }

      return MongoStore.create({
        mongoUrl,
        collectionName: "sessions",
        ttl: ttlSeconds,
        autoRemove: "native",
      });
    } catch (error: any) {
      if (isProduction) {
        throw error;
      }
      console.warn(
        "[auth] Failed to init Mongo session store, falling back to memory:",
        error?.message ?? error
      );
      return null;
    }
  };

  const store =
    sessionStoreMode === "mongo"
      ? resolveMongoSessionStore() ?? memoryStore
      : memoryStore;

  const sessionMiddleware = session({
    name: SESSION_COOKIE_NAME,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: sessionCookieSecure,
      maxAge: ONE_WEEK_MS,
    },
  });

  const buildAuthUser = (user: User): AuthUser => ({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName ?? null,
    executivePhone: user.executivePhone ?? null,
    permissions: user.permissions ?? [],
    notifyEnabled: user.notifyEnabled ?? true,
    notifyBatchWindowSec: user.notifyBatchWindowSec ?? 120,
    notifyBatchMaxItems: user.notifyBatchMaxItems ?? 5,
  });

  const legacyAdminUser: AuthUser = {
    id: "legacy-admin",
    username: adminUsername || DEFAULT_ADMIN_USERNAME,
    role: "admin",
    displayName: "Administrador",
    executivePhone: null,
    permissions: [],
    notifyEnabled: true,
    notifyBatchWindowSec: 120,
    notifyBatchMaxItems: 5,
    legacy: true,
  };

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (user) {
          if (!user.active) {
            return done(null, false, { message: "Usuario inactivo" });
          }
          const match = await bcrypt.compare(password, user.passwordHash);
          if (!match) {
            return done(null, false, { message: "Credenciales inválidas" });
          }
          return done(null, buildAuthUser(user));
        }

        if (
          allowLegacyLogin &&
          adminUsername &&
          adminPassword &&
          username === adminUsername &&
          password === adminPassword
        ) {
          console.warn("[auth] Using legacy ADMIN_USERNAME/ADMIN_PASSWORD login.");
          return done(null, legacyAdminUser);
        }

        return done(null, false, { message: "Credenciales inválidas" });
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, (user as AuthUser).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      if (id === legacyAdminUser.id) {
        return done(null, legacyAdminUser);
      }

      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      if (!user.active) {
        return done(null, false);
      }
      return done(null, buildAuthUser(user));
    } catch (error) {
      return done(error);
    }
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  const ensureAuthenticated: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }
    return res.status(401).json({ error: "No autenticado" });
  };

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: "No autenticado" });
    }
    const user = (req.user || legacyAdminUser) as AuthUser | undefined;

    return res.json({
      id: user?.id ?? legacyAdminUser.id,
      username: user?.username ?? (adminUsername || DEFAULT_ADMIN_USERNAME),
      role: user?.role ?? "admin",
      displayName: user?.displayName ?? null,
      executivePhone: user?.executivePhone ?? null,
      notifyEnabled: user?.notifyEnabled ?? true,
      notifyBatchWindowSec: user?.notifyBatchWindowSec ?? 120,
      notifyBatchMaxItems: user?.notifyBatchMaxItems ?? 5,
      permissions: user?.permissions ?? [],
    });
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate(
      "local",
      (
        err: any,
        user: AuthUser | false | null,
        info: { message?: string } | undefined
      ) => {
        if (err) {
          return next(err);
        }
        if (!user) {
          return res.status(401).json({
            error: info?.message ?? "Credenciales inválidas",
          });
        }
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            return next(loginErr);
          }
          const authUser = user as AuthUser;
          return res.json({
            id: authUser.id,
            username: authUser.username,
            role: authUser.role,
            displayName: authUser.displayName ?? null,
            executivePhone: authUser.executivePhone ?? null,
            notifyEnabled: authUser.notifyEnabled ?? true,
            notifyBatchWindowSec: authUser.notifyBatchWindowSec ?? 120,
            notifyBatchMaxItems: authUser.notifyBatchMaxItems ?? 5,
            permissions: authUser.permissions ?? [],
          });
        });
      }
    )(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((logoutErr) => {
      if (logoutErr) {
        return next(logoutErr);
      }
      if (req.session) {
        req.session.destroy((destroyErr) => {
          if (destroyErr) {
            return next(destroyErr);
          }
          res.clearCookie(SESSION_COOKIE_NAME);
          return res.json({ success: true });
        });
        return;
      }
      res.clearCookie(SESSION_COOKIE_NAME);
      return res.json({ success: true });
    });
  });

  return { sessionMiddleware, ensureAuthenticated };
}

export function bindAuthToSocket(
  io: SocketServer,
  sessionMiddleware: RequestHandler
) {
  io.use((socket, next) => {
    sessionMiddleware(socket.request as any, {} as any, (err?: any) => {
      if (err) {
        return next(err);
      }
      return next();
    });
  });

  io.use((socket, next) => {
    const request: any = socket.request;
    const user = request?.session?.passport?.user;
    if (!user) {
      return next(new Error("Unauthorized"));
    }
    return next();
  });
}




