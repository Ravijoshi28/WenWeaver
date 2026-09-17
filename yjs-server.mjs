import { WebSocketServer } from "ws";
import * as Y from "yjs";
import { createYjsServer } from "yjs-server";

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 1234);

const yjss = createYjsServer({
  createDoc: () => {

    return new Y.Doc();
  },
});

const wss = new WebSocketServer({
  host: HOST,
  port: PORT,
});

wss.on("connection", (socket, request) => {

  // IMPORTANT:
  // Must be called immediately after connection.
  yjss.handleConnection(socket, request);

  socket.on("error", () => {
    console.error("Operation failed in yjs-server.mjs.");
  });
});

wss.on("error", () => {
  console.error("Operation failed in yjs-server.mjs.");
});

process.on("SIGTERM", () => {

  yjss.close();

  wss.close(() => {

    process.exit(0);
  });
});

process.on("SIGINT", () => {

  yjss.close();

  wss.close(() => {

    process.exit(0);
  });
});
