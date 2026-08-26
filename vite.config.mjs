import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function relayControlPlugin() {
  let relayProcess = null;
  const portOpen = (port) =>
    new Promise((resolve) => {
      const socket = net.createConnection({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.setTimeout(250, () => {
        socket.destroy();
        resolve(false);
      });
    });
  const isRelayRunning = async () =>
    Boolean(relayProcess && !relayProcess.killed) ||
    ((await portOpen(8787)) && (await portOpen(8788)));
  const json = (res, status, value) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
  };
  return {
    name: "phone-twin-relay-control",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__relay/")) return next();
        if (req.method !== "GET" && req.method !== "POST")
          return json(res, 405, { error: "method not allowed" });
        if (req.url === "/__relay/status")
          return json(res, 200, { running: await isRelayRunning() });
        if (req.url !== "/__relay/start") return json(res, 404, { error: "not found" });
        if (await isRelayRunning()) return json(res, 200, { running: true, started: false });
        relayProcess = spawn(process.execPath, [path.resolve(process.cwd(), "relay/server.mjs")], {
          cwd: process.cwd(),
          stdio: "inherit",
        });
        relayProcess.once("exit", () => {
          relayProcess = null;
        });
        return json(res, 202, { running: false, started: true });
      });
      server.httpServer?.once("close", () => relayProcess?.kill("SIGTERM"));
    },
  };
}

export default defineConfig({
  plugins: [react(), relayControlPlugin()],
  server: {
    host: "0.0.0.0",
    https: {
      key: fs.readFileSync("./certs/dev-key.pem"),
      cert: fs.readFileSync("./certs/dev-cert.pem"),
    },
    proxy: {
      "/motion": {
        target: "https://localhost:8787",
        ws: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/motion/, ""),
      },
    },
  },
});
