const io = require("socket.io")(3000, {
  path: "/",
  serveClient: false
});

io.on("connection", socket => {
  socket.on("echo", (msg) => {
    socket.emit("echoResponse", msg);
  })
});

console.log("Socket.IO server listening at http://localhost:3000/");
