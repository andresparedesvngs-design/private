import type { Express, RequestHandler } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import type { Server as SocketServer } from "socket.io";

export interface AuthUser {
  username: string;
  role: "admin";
}

const SESSION_COOKIE_NAME = "wm.sid";
const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

function getAdminCredentials() {
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.warn(
      "[auth] Using default admin credentials. Set ADMIN_USERNAME and ADMIN_PASSWORD in .env."
    );
  }

  return { username, password };
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || "dev-session-secret-change-me";
  if (!process.env.SESSION_SECRET) {
    console.warn(
      "[auth] Using default SESSION_SECRET. Set SESSION_SECRET in .env for production."
    );
  }
  return secret;
}

export function setupAuth(app: Express): {
  sessionMiddleware: RequestHandler;
  ensureAuthenticated: RequestHandler;
} {
  const isProduction = process.env.NODE_ENV === "production";
  const sessionSecret = getSessionSecret();
  const { username: adminUsername, password: adminPassword } =
    getAdminCredentials();

  const MemoryStore = createMemoryStore(session);
  const store = new MemoryStore({
    checkPeriod: 1000 * 60 * 60 * 24,
  });

  const sessionMiddleware = session({
    name: SESSION_COOKIE_NAME,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: ONE_WEEK_MS,
    },
  });

  passport.use(
    new LocalStrategy((username, password, done) => {
      if (username === adminUsername && password === adminPassword) {
        const user: AuthUser = { username: adminUsername, role: "admin" };
        return done(null, user);
      }
      return done(null, false, { message: "Credenciales inválidas" });
    })
  );

  passport.serializeUser((user: any, done) => {
    done(null, (user as AuthUser).username);
  });

  passport.deserializeUser((username: string, done) => {
    if (username === adminUsername) {
      const user: AuthUser = { username: adminUsername, role: "admin" };
      return done(null, user);
    }
    return done(null, false);
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
    const user = (req.user || { username: adminUsername, role: "admin" }) as
      | AuthUser
      | undefined;

    return res.json({
      username: user?.username ?? adminUsername,
      role: user?.role ?? "admin",
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
            username: authUser.username,
            role: authUser.role,
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
