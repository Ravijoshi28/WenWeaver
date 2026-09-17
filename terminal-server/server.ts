import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import os from "os";
import path from "path";

const PORT = 3001;

const shell =
  os.platform() === "win32"
    ? "powershell.exe"
    : process.env.SHELL || "/bin/bash";

const cwd = process.cwd();

const wss = new WebSocketServer({
  port: PORT,
});

wss.on("connection", (socket: WebSocket) => {

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
    },
  });

  // Shell -> browser
  ptyProcess.onData((data) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });

  // Browser -> shell
  socket.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === "input") {
        ptyProcess.write(data.data);
      }

      if (data.type === "resize") {
        const cols = Number(data.cols);
        const rows = Number(data.rows);

        if (
          Number.isInteger(cols) &&
          Number.isInteger(rows) &&
          cols > 0 &&
          rows > 0
        ) {
          ptyProcess.resize(cols, rows);
        }
      }
    } catch {
      console.error("Invalid WebSocket message");
    }
  });

  socket.on("close", () => {

    try {
      ptyProcess.kill();
    } catch {
      // Process already stopped
    }
  });

  socket.on("error", () => {
    try {
      ptyProcess.kill();
    } catch {
      // Process already stopped
    }
  });

  ptyProcess.onExit(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  });
});