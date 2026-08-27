const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const isPackaged = app.isPackaged;
const projectRoot = isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
const processes = [];
let staticServer = null;
let relayProcess = null;

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(250, () => { socket.destroy(); resolve(false); });
  });
}

async function relayRunning() {
  return Boolean(relayProcess && !relayProcess.killed) || ((await portOpen(8787)) && (await portOpen(8788)));
}

function firstLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        return entry.address;
      }
    }
  }
  return "127.0.0.1";
}

function startProcess(command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, PHONETWIN_HTTP: "1", ...env },
    stdio: "inherit",
    windowsHide: true,
  });
  processes.push(child);
  child.on("error", (error) => console.error("PhoneTwin process failed", error));
  return child;
}

function startStaticServer() {
  const root = path.join(projectRoot, "dist");
  const mimeTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
  staticServer = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (requestPath === "/__relay/status") {
      response.writeHead(200, { "Content-Type": "application/json" });
      return relayRunning().then((running) => response.end(JSON.stringify({ running })));
    }
    if (requestPath === "/__relay/start") {
      return relayRunning().then((running) => {
        if (!running) {
          relayProcess = startProcess(process.execPath, [path.join(projectRoot, "relay", "server.mjs")], { ELECTRON_RUN_AS_NODE: "1" });
          relayProcess.once("exit", () => { relayProcess = null; });
        }
        response.writeHead(202, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ running, started: !running }));
      });
    }
    const relativePath = requestPath === "/" ? "/index.html" : requestPath;
    const filePath = path.resolve(root, `.${relativePath}`);
    if (!filePath.startsWith(`${root}${path.sep}`)) return response.writeHead(403).end("Forbidden");
    fs.readFile(filePath, (error, data) => {
      if (error) return fs.readFile(path.join(root, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) return response.writeHead(404).end("Not found");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(fallback);
      });
      response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream" }).end(data);
    });
  });
  staticServer.listen(5173, "127.0.0.1");
}

function startServices() {
  if (isPackaged) {
    startStaticServer();
    relayProcess = startProcess(process.execPath, [path.join(projectRoot, "relay", "server.mjs")], { ELECTRON_RUN_AS_NODE: "1" });
    relayProcess.once("exit", () => { relayProcess = null; });
    return "http://127.0.0.1:5173";
  }
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  startProcess(process.execPath, [path.join(projectRoot, "relay", "server.mjs")]);
  startProcess(npmCommand, ["run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]);
  return "http://127.0.0.1:5173";
}

function waitForWorkbench(url, attempts = 40) {
  return new Promise((resolve, reject) => {
    const probe = (remaining) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (remaining <= 0) reject(new Error("Vite did not start on port 5173"));
        else setTimeout(() => probe(remaining - 1), 250);
      });
    };
    probe(attempts);
  });
}

async function createWindow() {
  const url = startServices();
  try {
    await waitForWorkbench(url);
  } catch (error) {
    dialog.showErrorBox("PhoneTwin Studio", error.message);
    app.quit();
    return;
  }
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#080a0f",
    title: "PhoneTwin Studio",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.loadURL(url).catch((error) => {
    dialog.showErrorBox("PhoneTwin Studio", `Unable to load the local workbench.\n\n${error.message}`);
  });
  window.webContents.once("did-finish-load", () => {
    window.webContents.send("phonetwin-network", {
      lanIp: firstLanAddress(),
      endpoint: `ws://${firstLanAddress()}:8788/native`,
    });
  });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  for (const child of processes) child.kill();
  staticServer?.close();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  for (const child of processes) child.kill();
  staticServer?.close();
});
