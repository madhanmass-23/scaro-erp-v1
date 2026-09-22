import express, { Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "./config/env.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import apiRouter from "./routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function resolveClientDistPath(): string | null {
  const candidates = [
    process.env.CLIENT_DIST_PATH ? path.resolve(process.env.CLIENT_DIST_PATH) : null,
    path.resolve(__dirname, "../../dist"),
    path.resolve(__dirname, "../dist"),
    path.resolve(process.cwd(), "dist"),
    path.resolve(process.cwd(), "../dist"),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return null;
}

const clientDistPath = resolveClientDistPath();

const BLOCKED_SENSITIVE_PREFIXES = [
  "/.",
  "/server/storage",
  "/storage",
  "/local-storage",
  "/package.json",
  "/tsconfig.json",
];

function isOriginAllowed(origin: string | undefined, hostHeader: string | undefined): boolean {
  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, standard browser navigation)
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);

    // 1. Configured CORS_ORIGIN values (comma-separated, trimmed)
    const configuredOrigins = config.CORS_ORIGIN
      ? config.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
      : [];
    if (configuredOrigins.includes(origin)) {
      return true;
    }

    // 2. Same-origin matching incoming request Host header
    if (hostHeader) {
      const hostWithoutPort = hostHeader.split(":")[0].toLowerCase();
      const originHost = parsedOrigin.hostname.toLowerCase();
      if (originHost === hostWithoutPort) {
        return true;
      }
    }

    // 3. Railway deployment domains (*.up.railway.app, *.railway.app)
    if (parsedOrigin.protocol === "https:") {
      const hostname = parsedOrigin.hostname.toLowerCase();
      if (
        hostname.endsWith(".up.railway.app") ||
        hostname.endsWith(".railway.app") ||
        hostname === "up.railway.app" ||
        hostname === "railway.app"
      ) {
        return true;
      }
    }

    // 4. Localhost and loopback origins (for development and test)
    if (config.NODE_ENV !== "production") {
      const hostname = parsedOrigin.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname === "[::1]"
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export function createApp(): Express {
  const app = express();

  // 0. Trust First Proxy Hop (Local Nginx Reverse Proxy / Railway Edge)
  app.set("trust proxy", 1);

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. Cross-Origin Resource Sharing (CORS)
  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      const host = req.headers.host;
      const allowed = isOriginAllowed(origin, host);

      callback(null, {
        origin: allowed,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
      });
    })
  );

  // 3. Request Parsers with payload limits & Cookie Parser
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  // 4. Request Logging
  app.use(requestLogger);

  // 5. Mount API Version 1 Routes (Highest priority)
  app.use(config.API_PREFIX, apiRouter);

  // 6. Serve Compiled Frontend SPA (if dist exists)
  if (clientDistPath) {
    const assetsPath = path.join(clientDistPath, "assets");
    if (fs.existsSync(assetsPath)) {
      app.use(
        "/assets",
        express.static(assetsPath, {
          dotfiles: "ignore",
          maxAge: config.NODE_ENV === "production" ? "1y" : 0,
          immutable: config.NODE_ENV === "production",
        })
      );
      // Explicitly catch missing /assets/* requests and return 404 text/plain
      app.use("/assets", (_req, res) => {
        res.status(404).type("text/plain").send("Asset not found");
      });
    }

    // Serve root-level static files (favicon.svg, manifest.webmanifest, etc.)
    app.use(
      express.static(clientDistPath, {
        index: false,
        dotfiles: "ignore",
        maxAge: config.NODE_ENV === "production" ? "1h" : 0,
      })
    );

    // Single Page Application (SPA) Fallback for non-API, non-asset HTML routes
    app.get("*", (req, res, next) => {
      // Never intercept API routes
      if (req.path.startsWith(config.API_PREFIX) || req.path.startsWith("/api/")) {
        return next();
      }

      // Never intercept requests for static assets or files with extensions
      if (req.path.startsWith("/assets/") || /\.[a-zA-Z0-9]+$/.test(req.path)) {
        return next();
      }

      // Block sensitive paths from falling back to HTML
      const isBlocked = BLOCKED_SENSITIVE_PREFIXES.some(
        (prefix) => req.path === prefix || req.path.startsWith(prefix + "/") || req.path.startsWith(prefix)
      );
      if (isBlocked) {
        return next();
      }

      const indexPath = path.join(clientDistPath, "index.html");
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      return next();
    });
  }

  // 7. Catch-all for undefined routes
  app.use(notFoundHandler);

  // 8. Centralized Error Handler
  app.use(errorHandler);

  return app;
}


export const app = createApp();
