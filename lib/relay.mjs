import { createConnection } from "node:net";
import { SOCKET_PATH } from "../host/paths.mjs";

export function relay(method, params = {}, meta = {}, { subscribe = false, onEvent } = {}) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(SOCKET_PATH);
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Timed out after 30000 ms"));
    }, 30000);
    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id: 1, method, params, ...meta })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const message = JSON.parse(line);
        if (message.type === "event") {
          onEvent?.(message.event);
          continue;
        }
        if (message.id !== 1) continue;
        clearTimeout(timer);
        if (!subscribe) socket.end();
        if (message.error) {
          reject(new Error(message.error));
        } else if (subscribe) {
          resolve({
            result: message.result,
            socket,
            close: () => socket.destroy(),
          });
        } else {
          resolve(message.result);
        }
      }
    });
    socket.on("error", (error) => {
      clearTimeout(timer);
      const unavailable = ["ENOENT", "ECONNREFUSED"].includes(error.code);
      reject(new Error(
        unavailable
          ? "Secret Menu is not running (no bridge socket)."
          : error.message,
      ));
    });
  });
}
