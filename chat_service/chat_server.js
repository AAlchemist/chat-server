// Reference: https://socket.io/get-started/chat
const http = require("http");
const express = require("express");
const app = express();
const port = 3456;
const file = "chat_client.html";
const server = http.createServer(app);
const {Server} = require("socket.io");
const io = new Server(server);
app.get('/', (req, res) => {
    res.sendFile(__dirname + "/" + file);
});
server.listen(port, () => console.log(`server is running! Port = ${port}`));
// Same as io.sockets.on()
io.on("connection", function (socket) {
    // This callback runs when a new Socket.IO connection is established.
    console.log(`A user connected. Socket ID = ${socket.id}`)
    socket.on("message_request", function (data) {
        // This callback runs when the server receives a new message from the client.
        if (data["room"] == null) 
            // Send the message_response to all sockets (same as io.sockets.emit() )
            io.emit("message_response", { message: data["message"] }); // broadcast the message to other users
            // Broadcast to a specific room or a user.
        else 
            // Send the message_reponse to all sockets in the room
            socket.to(data["room"].emit("message_response", { message: data["message"] }));
    });
    socket.on("login_request", function(username) {
        socket.username = username;
        // Send login response to this socket
        socket.emit("login_response", {username: username});
    })
    socket.on("disconnect", function() {
        console.log("A user disconnected.");
    });
});