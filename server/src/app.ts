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
const projectRoot = path.resolve(__dirname, "../..");
const clientDistPath = process.env.CLIENT_DIST_PATH
  ? path.resolve(process.env.CLIENT_DIST_PATH)
  : path.resolve(projectRoot, "dist");

const BLOCKED_SENSITIVE_PREFIXES = [
  "/.",
  "/server/storage",
  "/storage",
  "/local-storage",
  "/package.json",
  "/tsconfig.json",
];

export function createApp(): Express {
  const app = express();

  // 0. Trust First Proxy Hop (Local Nginx Reverse Proxy)
  app.set("trust proxy", 1);

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. Cross-Origin Resource Sharing (CORS)
  const allowedOrigins = config.CORS_ORIGIN
    ? config.CORS_ORIGIN.split(",").map((o) => o.trim())
    : [];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || config.NODE_ENV === "development") {
          return callback(null, true);
        }
        return callback(new Error("CORS policy does not allow access from this origin."));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
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
  if (fs.existsSync(clientDistPath)) {
    app.use(
      express.static(clientDistPath, {
        index: false,
        dotfiles: "ignore",
        maxAge: config.NODE_ENV === "production" ? "1d" : 0,
      })
    );

    // Single Page Application (SPA) Fallback for non-API GET routes
    app.get("*", (req, res, next) => {
      // Never intercept API routes
      if (req.path.startsWith(config.API_PREFIX) || req.path.startsWith("/api/")) {
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
