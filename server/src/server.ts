import { app } from "./app.js";
import { config } from "./config/env.js";
import { checkDatabaseConnection, closeDatabasePool } from "./config/database.js";
import { storageService } from "./services/storage.service.js";
import { Server } from "http";

let server: Server | null = null;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  // Pre-flight database check
  const dbHealth = await checkDatabaseConnection();
  if (dbHealth.ok) {
    console.log(`[DATABASE] Connected to MariaDB (${dbHealth.version || "verified"})`);
  } else {
    console.warn(`[DATABASE] Warning: Initial database check failed: ${dbHealth.error}`);
  }

  // Pre-flight storage initialization
  try {
    await storageService.init();
    console.log(`[STORAGE] Storage engine initialized (driver: ${config.STORAGE_DRIVER}, root: ${config.STORAGE_ROOT})`);
  } catch (err: any) {
    console.error("[STORAGE] Warning: Storage initialization issue:", err.message);
  }

  server = app.listen(config.PORT, () => {
    console.log(`[SERVER] SCARO ERP API server running in ${config.NODE_ENV} mode`);
    console.log(`[SERVER] Listening on http://localhost:${config.PORT}`);
    console.log(`[SERVER] API Prefix: ${config.API_PREFIX}`);
    console.log(`[SERVER] Health endpoint: http://localhost:${config.PORT}${config.API_PREFIX}/health`);
  });

  // Handle graceful shutdown signals
  process.on("SIGTERM", () => handleGracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => handleGracefulShutdown("SIGINT"));

  process.on("unhandledRejection", (reason: unknown) => {
    console.error("[FATAL] Unhandled Promise Rejection:", reason);
  });

  process.on("uncaughtException", (error: Error) => {
    console.error("[FATAL] Uncaught Exception:", error);
    handleGracefulShutdown("UNCAUGHT_EXCEPTION");
  });
}

async function handleGracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[SERVER] Received ${signal}. Starting graceful shutdown...`);

  const forceExitTimeout = setTimeout(() => {
    console.error("[SERVER] Graceful shutdown timed out after 10 seconds. Forcing process exit.");
    process.exit(1);
  }, 10000);

  // Unref timer to allow clean exit if tasks finish early
  forceExitTimeout.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((err) => {
          if (err) return reject(err);
          console.log("[SERVER] HTTP listener closed. No longer accepting new connections.");
          resolve();
        });
      });
    }

    console.log("[DATABASE] Closing MariaDB connection pool...");
    await closeDatabasePool();
    console.log("[DATABASE] Connection pool closed successfully.");

    console.log("[SERVER] Graceful shutdown complete. Exiting cleanly.");
    process.exit(0);
  } catch (err) {
    console.error("[SERVER] Error during graceful shutdown:", err);
    process.exit(1);
  }
}

startServer().catch((err) => {
  console.error("[FATAL] Server failed to start:", err);
  process.exit(1);
});
