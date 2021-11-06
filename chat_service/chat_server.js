// Reference: https://socket.io/get-started/chat
const http = require("http");
const express = require("express");
const app = express();
const port = 3456;
const file = "chat_client.html";
const server = http.createServer(app);
const {Server, Socket} = require("socket.io");
const io = new Server(server);
app.get('/', (req, res) => {
    res.sendFile(__dirname + "/" + file);
});
app.use(express.static("css")); // Serve css file in express
server.listen(port, () => console.log(`server is running! Port = ${port}`));

let room_creator = new Map(); // {room_name: creater_username}
const global_room = "global";
// Same as io.sockets.on()
io.on("connection", function (socket) {
    // This callback runs when a new Socket.IO connection is established.
    console.log(`Socket connected. Socket ID = ${socket.id}`)

    socket.on("message_request", function (data) {
        if (data["room"] == null) 
            // Send the message_response to all sockets (same as io.sockets.emit() )   (never happens)
            io.emit("message_response", { message: data["message"]}); // broadcast the message to other users
            // Broadcast to a specific room or a user.
        else 
            // Send the message_reponse to all sockets in the room
            io.to(data["room"]).emit("message_response", { message: data["message"] , username: socket.username});
    });

    socket.on("login_request", function(username) {
        let username_set = get_username_set();
        if (username_set.has(username)) {
            socket.emit("error_msg", "Duplicated Username: " + username);
            return;
        }
        socket.username = username;
        socket.current_room = global_room;
        socket.join(global_room);
        // Send login response to this socket
        socket.emit("login_response", {username: username, room_creator: Array.from(room_creator)});
    });
    
    socket.on("logout_request", function() {
        socket.username = null;
        socket.leave(socket.current_room);
        socket.emit("logout_response");
    })


    socket.on("disconnect", function() {
        console.log("Socket disconnected.");
        
    });

    socket.on("create_room_request", function(new_room_name) {
        if (room_creator.has(new_room_name)) {
            socket.emit("error_msg", "Duplicated room name: " + new_room_name);
            return;
        }
        room_creator.set(new_room_name, socket.username);
        // console.log(JSON.stringify(room_creator)); // https://stackoverflow.com/questions/40766650/how-to-emit-a-map-object
        // Maps and Sets and other ES2015 datatypes cannot be JSON-encoded.
        io.emit("create_room_response", Array.from(room_creator));
    });

    socket.on("change_room_request", function(room) {
        if (socket.current_room != null) 
            socket.leave(socket.current_room);
        socket.join(room);
        socket.current_room = room;
        io.to(room).emit("change_room_response", {
                    "room": room, 
                    "users": get_username_by_sockets(get_sockets_by_room(room)), 
                    "host": room_creator.get(room)
        });
    })

    // function get_rooms() {
    //     let room_list = [];
    //     // const rooms = io.of("/").adapter.rooms; // Map<Room, Set<SocketId>>
    //     let keys = room_creator.keys();
    //     for (let room in keys)
    //         room_list.push(room)
    //     return room_list;
    // }

    function get_sockets_by_room(room) {
        sid_set = io.of("/").adapter.rooms.get(room); // Map<Room, Set<SocketId>>
        let sockets = [];
        for (let sid of sid_set)
            sockets.push(io.sockets.sockets.get(sid));
        return sockets;
    }

    function get_username_by_sockets(sockets) {
        let username_list = [];
        for (let socket of sockets)
            username_list.push(socket.username);
        return username_list;
    }

    function get_all_sockets() {
        let sids = io.of("/").adapter.sids; // Map<SocketId, Set<Room>>
        let socket_id_list = sids.keys(); 
        let socket_list = [];
        for (let socket_id of socket_id_list) 
            socket_list.push(io.sockets.sockets.get(socket_id));
        return socket_list;
    }

    function get_username_set() {
        let socket_list = get_all_sockets();
        let username_set = new Set();
        for (let socket of socket_list) 
            username_set.add(socket.username);
        return username_set;
    }
});