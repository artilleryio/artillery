const io = require("socket.io")(8080, {
  path: "/",
  serveClient: false
});

io.on("connection", (socket) => {
  socket.on("echo", (msg) => {
    socket.emit("echoResponse", msg);
  })

  socket.on("userDetails", (_, callback) => {
    callback({
      name: "Artillery"
    });
  })
});

console.log("Socket.IO server listening at http://localhost:8080/");
