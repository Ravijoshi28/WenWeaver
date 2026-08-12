import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { createYjsServer } from "yjs-server";

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 1234);

console.log("================================");
console.log("🚀 Starting Aollab Yjs Server");
console.log(`🌐 Binding: ${HOST}:${PORT}`);
console.log("================================");

const yjss = createYjsServer({
  createDoc: () => {
    console.log("📄 Creating new Y.Doc");
    return new Y.Doc();
  },
});

const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
});

wss.on("connection", (socket, request) => {
  console.log("🟢 Yjs client connected");
  console.log("📍 Room:", request.url);

  // IMPORTANT:
  // Must be called immediately after connection.
  yjss.handleConnection(socket, request);

  socket.on("close", () => {
    console.log("🔴 Yjs client disconnected");
  });

  socket.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
  });
});

wss.on("listening", () => {
  console.log("================================");
  console.log("✅ Aollab Yjs server is running");
  console.log(`🌐 ${HOST}:${PORT}`);
  console.log("================================");
});

wss.on("error", (error) => {
  console.error("❌ Yjs server error:", error);
});

process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received");

  yjss.close();

  wss.close(() => {
    console.log("✅ Yjs server stopped");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received");

  yjss.close();

  wss.close(() => {
    console.log("✅ Yjs server stopped");
    process.exit(0);
  });
});