import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { createYjsServer } from "yjs-server";

const HOST = "localhost";
const PORT = 1234;

console.log("================================");
console.log("🚀 Starting Yjs WebSocket server");
console.log(`🌐 ws://${HOST}:${PORT}`);
console.log("================================");

const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
});

const yjss = createYjsServer({
  createDoc: () => {
    console.log("📄 Creating new Y.Doc");
    return new Y.Doc();
  },
});

wss.on("connection", (socket, request) => {
  console.log("🟢 Client connected");
  console.log("📍 Room:", request.url);

  yjss.handleConnection(socket, request);

  socket.on("close", () => {
    console.log("🔴 Client disconnected");
  });

  socket.on("error", (error) => {
    console.error("❌ Client WebSocket error:", error);
  });
});

wss.on("listening", () => {
  console.log("================================");
  console.log("✅ Yjs server is running");
  console.log(`🌐 ws://${HOST}:${PORT}`);
  console.log("================================");
});

wss.on("error", (error) => {
  console.error("❌ Server error:", error);
});