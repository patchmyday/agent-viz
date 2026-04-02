import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { serveStatic } from "@hono/node-server/serve-static";

import { sessionsRouter } from "./routes/sessions.js";
import { hooksRouter } from "./routes/hooks.js";
import { onOpen, onMessage, onClose, onError } from "./ws/handler.js";
import { broker } from "./ws/broker.js";
import { initBuffer, getBuffer } from "./ingest/event-buffer.js";
import { startFileWatcher } from "./ingest/file-watcher.js";

// ---------------------------------------------------------------------------
// Event buffer — fan-out to WebSocket broker on each flush
// ---------------------------------------------------------------------------

initBuffer((events) => broker.broadcast(events));

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "ws://localhost:*"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  })
);

// Restrict CORS to localhost origins — this server is never exposed to the internet,
// but a malicious web page could make cross-origin requests to steal session data.
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return origin ?? "";
      }
      return "";
    },
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 600,
  })
);

// ---------------------------------------------------------------------------
// WebSocket upgrade
// ---------------------------------------------------------------------------

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get(
  "/api/ws",
  upgradeWebSocket(() => ({
    onOpen(_evt, ws) {
      if (ws.raw) onOpen(ws.raw);
    },
    onMessage(evt, ws) {
      if (!ws.raw) return;
      // Normalize WSMessageReceive (string | Blob | ArrayBufferLike) to string
      const data = evt.data;
      if (typeof data === "string") {
        onMessage(ws.raw, data);
      } else if (data instanceof Blob) {
        // Blobs are rare in Node.js WebSocket — skip
      } else {
        // ArrayBuffer / SharedArrayBuffer
        onMessage(ws.raw, Buffer.from(data as ArrayBuffer).toString("utf8"));
      }
    },
    onClose(_evt, ws) {
      if (ws.raw) onClose(ws.raw);
    },
    onError(evt, ws) {
      if (ws.raw) onError(ws.raw, new Error(String(evt)));
    },
  }))
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.route("/api/sessions", sessionsRouter);
app.route("/api/hooks", hooksRouter);

// Health check
app.get("/api/health", (c) =>
  c.json({ status: "ok", connections: broker.connectionCount })
);

// Serve static frontend in production (Vite builds to apps/frontend/dist)
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "../frontend/dist" }));
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT) || 3001;

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`Agent Viz backend listening on http://localhost:${port}`);
  console.log(`WebSocket endpoint: ws://localhost:${port}/api/ws`);
});

injectWebSocket(server);

// Start file watcher after server is up — store ref for graceful shutdown (fix 12)
const watcher = startFileWatcher();

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown() {
  console.log("Shutting down...");
  // fix 12: flush buffer and close watcher before exiting
  getBuffer().stop();
  watcher.close().finally(() => {
    server.close(() => process.exit(0));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
