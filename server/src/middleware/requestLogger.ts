import morgan from "morgan";
import { config } from "../config/env.js";

// Custom morgan format omitting all request bodies, headers, and secrets
const devFormat = ":method :url :status :response-time ms - :res[content-length]";
const prodFormat = ":remote-addr - [:date[clf]] \":method :url HTTP/:http-version\" :status :res[content-length] \":referrer\" :response-time ms";

export const requestLogger = morgan(config.NODE_ENV === "production" ? prodFormat : devFormat, {
  skip: (req) => req.url === "/api/v1/health", // Keep health probe logs clean
});
