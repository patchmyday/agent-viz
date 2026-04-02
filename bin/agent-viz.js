#!/usr/bin/env node

import { spawn, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, "..", "apps", "backend", "dist", "index.js");

const port = process.env.PORT ?? "3001";
const url = `http://localhost:${port}`;

const server = spawn("node", [serverEntry], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production" },
});

server.on("error", (err) => {
  console.error("Failed to start Agent Viz server:", err.message);
  process.exit(1);
});

server.on("close", (code) => {
  process.exit(code ?? 0);
});

// Forward signals so Ctrl-C cleanly stops the child process
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

// Poll the health endpoint, then open the browser once the server is ready
async function openWhenReady(retries = 20, delayMs = 150) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) break;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }

  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  execFile(opener, [url], (err) => {
    if (err) console.warn(`Could not open browser automatically: ${err.message}`);
  });

  console.log(`\nAgent Viz running at ${url}\n`);
}

openWhenReady();
