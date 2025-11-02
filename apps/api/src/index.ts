import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { config } from "./config/env";
import { testConnection } from "./db/connection";

// Import routes
import { authRouter } from "./routes/auth.routes";
import { transactionsRouter } from "./routes/transactions.routes";
import { accountsRouter } from "./routes/accounts.routes";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// API routes
app.get("/api", (c) => {
  return c.json({
    message: "Finance Tracker API",
    version: "1.0.0",
  });
});

// Mount API routes
app.route("/api/auth", authRouter);
app.route("/api/transactions", transactionsRouter);
app.route("/api/accounts", accountsRouter);

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found", path: c.req.path }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Server error:", err);
  return c.json(
    {
      error: "Internal Server Error",
      message:
        config.nodeEnv === "development" ? err.message : "Something went wrong",
    },
    500,
  );
});

// Test database connection on startup
testConnection();

console.log(`🚀 Server starting on port ${config.port}`);
console.log(`📝 Environment: ${config.nodeEnv}`);
console.log(`🔗 CORS enabled for: ${config.corsOrigin}`);

export default {
  port: config.port,
  fetch: app.fetch,
};
