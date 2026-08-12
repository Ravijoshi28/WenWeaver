"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

import "@xterm/xterm/css/xterm.css";

export default function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!terminalRef.current) {
      return;
    }

    const terminal = new XTerm({
      cursorBlink: true,
      cursorStyle: "block",

      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",

      fontSize: 14,

      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#ffffff",

        black: "#484f58",
        red: "#ff7b72",
        green: "#3fb950",
        yellow: "#d29922",
        blue: "#58a6ff",
        magenta: "#bc8cff",
        cyan: "#39c5cf",
        white: "#b1bac4",
      },
    });

    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);

    terminal.open(terminalRef.current);

    fitAddon.fit();

    terminal.focus();

    const socket = new WebSocket("ws://localhost:3001");

    socket.onopen = () => {
      terminal.write(
        "\x1b[1;32mConnected to terminal\x1b[0m\r\n"
      );

      socket.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        })
      );
    };

    socket.onmessage = (event) => {
      terminal.write(event.data);
    };

    socket.onerror = () => {
      terminal.write(
        "\r\n\x1b[1;31mWebSocket connection error\x1b[0m\r\n"
      );
    };

    socket.onclose = () => {
      terminal.write(
        "\r\n\x1b[1;31mTerminal disconnected\x1b[0m\r\n"
      );
    };

    // User typing -> shell
    const dataDisposable = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "input",
            data,
          })
        );
      }
    });

    // Terminal resizing -> PTY
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();

        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "resize",
              cols: terminal.cols,
              rows: terminal.rows,
            })
          );
        }
      } catch {
        // Terminal may be disposing
      }
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();

      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }

      terminal.dispose();
    };
  }, []);

  return (
    <div
      ref={terminalRef}
      style={{
        width: "100%",
        height: "600px",
        padding: "12px",
        background: "#0d1117",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    />
  );
}