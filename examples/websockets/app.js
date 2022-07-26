const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8888 })

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    ws.send(msg);
  });
});

console.log("WebSockets server listening at ws://localhost:8888");
