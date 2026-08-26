import fs from "node:fs";
import https from "node:https";
import { WebSocketServer } from "ws";
const sseClients = new Set();
const tls = {
  key: fs.readFileSync(new URL("../certs/dev-key.pem", import.meta.url)),
  cert: fs.readFileSync(new URL("../certs/dev-cert.pem", import.meta.url)),
};
const server = https.createServer(tls, (req, res) => {
  const requestUrl = new URL(req.url, "https://localhost");
  if (req.method === "GET" && requestUrl.pathname === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(
      `data: ${JSON.stringify({ type: "bridge-status", connected: true })}\n\n`,
    );
    const client = { res, sessionId: requestUrl.searchParams.get("sessionId") };
    sseClients.add(client);
    req.on("close", () => sseClients.delete(client));
    return;
  }
  res.writeHead(404).end();
});
const wss = new WebSocketServer({ server });
const clients = new Set();
let binaryFrames = 0;
function handleConnection(socket) {
  clients.add(socket);
  socket.sessionId = null;
  console.log("sender/receiver connected", clients.size);
  socket.send(
    JSON.stringify({
      type: "bridge-status",
      connected: true,
      peers: clients.size,
    }),
  );
  for (const peer of clients)
    if (peer.readyState === 1)
      peer.send(JSON.stringify({ type: "peer-count", peers: clients.size }));
  socket.on("message", (raw, isBinary) => {
    if (isBinary) {
      binaryFrames += 1;
      if (binaryFrames === 1 || binaryFrames % 30 === 0)
        console.log("binary frame", binaryFrames, "bytes", raw.length, "peers", clients.size);
    }
    let message;
    const isText = !isBinary;
    try {
      if (isText) message = JSON.parse(raw);
    } catch {}
    if (message?.type === "hello" && message.sessionId) {
      socket.sessionId = message.sessionId;
      console.log(
        "session ready",
        message.sessionId,
        message.role || "unknown",
      );
      const status = JSON.stringify({
        type: "sender-status",
        sessionId: message.sessionId,
        capabilities: message.capabilities || [],
      });
      for (const peer of clients)
        if (peer !== socket && peer.readyState === 1) peer.send(status);
      for (const client of sseClients)
        if (!client.sessionId || client.sessionId === message.sessionId)
          client.res.write(`data: ${status}\n\n`);
      return;
    }
    const sessionId = message?.sessionId || socket.sessionId;
    for (const peer of clients) {
      if (peer.readyState !== 1 || peer === socket) continue;
      if (!sessionId || !peer.sessionId || peer.sessionId === sessionId)
        peer.send(raw);
    }
    if (isText)
      for (const client of sseClients)
        if (!sessionId || !client.sessionId || client.sessionId === sessionId)
          client.res.write(`data: ${raw}\n\n`);
  });
  socket.on("close", () => {
    clients.delete(socket);
    console.log("sender/receiver disconnected", clients.size);
    for (const peer of clients)
      if (peer.readyState === 1)
        peer.send(JSON.stringify({ type: "peer-count", peers: clients.size }));
  });
}
wss.on("connection", handleConnection);
// Native iOS development transport. It intentionally uses plain WS so an
// installed development build does not need to trust the local self-signed cert.
const nativeWss = new WebSocketServer({ port: 8788 });
nativeWss.on("connection", handleConnection);
server.listen(8787, "0.0.0.0", () =>
  console.log("Motion bridge wss://0.0.0.0:8787"),
);
console.log("Native sender bridge ws://0.0.0.0:8788");
