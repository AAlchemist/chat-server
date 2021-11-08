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
let banned_lists = new Map(); // {room_nmae: [username]}
let rooms_pwd = new Map();//{room_name: pwd}
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
        console.log(socket.username);

        socket.current_room = global_room;
        socket.join(global_room);
        // Send login response to this socket
        socket.emit("login_response", {username: username, room_creator: Array.from(room_creator)});
        io.to(socket.current_room).emit("change_room_response", {
            "room": socket.current_room, 
            "users": get_username_by_sockets(get_sockets_by_room(socket.current_room)), 
            "host": room_creator.get(socket.current_room)
        });
    });
    
    socket.on("logout_request", function() {
        socket.username = null;
        socket.leave(socket.current_room);
        socket.emit("logout_response");
    })


    socket.on("disconnect", function() {
        console.log("Socket disconnected.");
        
    });

    socket.on("create_room_request", function(data) {
        if (room_creator.has(data["new_room_name"])) {
            socket.emit("error_msg", "Duplicated room name: " + data["new_room_name"]);
            return;
        }
        if(data["room_pwd"]!= ""){
            console.log("has pwd")
            rooms_pwd.set(data['new_room_name'], data['room_pwd']);
            console.log(rooms_pwd);
        }
        room_creator.set(data["new_room_name"], socket.username);
        // console.log(JSON.stringify(room_creator)); // https://stackoverflow.com/questions/40766650/how-to-emit-a-map-object
        // Maps and Sets and other ES2015 datatypes cannot be JSON-encoded.
        io.emit("create_room_response", Array.from(room_creator));
    });

    
    socket.on("change_room_request", function(room) {
        let is_banned = false;
        let is_protected = false;
        if(banned_lists.has(room)){
            let bannedUsers = banned_lists.get(room);

            for(const u of bannedUsers){
                if(u == socket.username)is_banned = true;
            }
        }
        if(rooms_pwd.has(room)){
            is_protected = true;  
        }
        if(!is_banned && !is_protected){
            if (socket.current_room != null) {
                socket.leave(socket.current_room);
                // Update current room
                io.to(socket.current_room).emit("change_room_response", {
                    "room": socket.current_room, 
                    "users": get_username_by_sockets(get_sockets_by_room(socket.current_room)), 
                    "host": room_creator.get(socket.current_room)
                });
            }
            
            

            socket.join(room);
            socket.current_room = room;
            // Update new room
            io.to(room).emit("change_room_response", {
                        "room": room, 
                        "users": get_username_by_sockets(get_sockets_by_room(room)), 
                        "host": room_creator.get(room)
            });

        }
        else if(is_banned){
            let bannedMsg = "You were banned from this room!";
            socket.emit("message_response", { message: bannedMsg , username: "Server"});
            io.to(socket.current_room).emit("change_room_response", {
                "room": socket.current_room, 
                "users": get_username_by_sockets(get_sockets_by_room(socket.current_room)), 
                "host": room_creator.get(socket.current_room)
            });
            return;
        }else{
            var pwd_req_msg = "This room requires password to enter. Please enter the password here."
            socket.emit("message_response", { message: pwd_req_msg , username: "Server"});
        }
        
    });
    socket.on("pwd_verify_request", function(data){
        if(rooms_pwd.get(data["room"]) == data["pwd"]){
            socket.leave(socket.current_room);
            socket.join(data["room"]);
            socket.current_room = data["room"];
            io.to(data["room"]).emit("change_room_response", {
                "room": data["room"], 
                "users": get_username_by_sockets(get_sockets_by_room(data["room"])), 
                "host": room_creator.get(data["room"])
            });
        }else{
            var msg = "Wrong Password!"
            socket.emit('error_msg', msg);
        }
    })
    
    socket.on('dm', function(data){
        var to = data['to'];
        var from = socket.username;
        var room_name = data['room_name'];
        let dmMsg = data['msg'];
        dmMsg = "This is a private message from " + socket.username+": "+dmMsg;
        console.log(dmMsg);
        var sockets = io.sockets.adapter.rooms.get(room_name);
        for(const s of sockets){
            const clientSocket = io.sockets.sockets.get(s);
            if(clientSocket.username == to){
                console.log(to);
                socket.broadcast.to(clientSocket.id).emit("message_response", { message: dmMsg , username: socket.username});
                socket.emit("message_response", { message: dmMsg , username: socket.username});

            }
        }
    });
    socket.on('get_rooms_pwd', ()=>{
        io.emit('rooms_pwd_response', Array.from(rooms_pwd));
    })
    socket.on('ban_user', function(info){
        var banner_name = info['banner_name'];
        var banned_name = info['banned_name'];
        var room_name = info['room_name'];

        if(room_creator.get(room_name) == banner_name){
            if(banned_lists.has(room_name)){
                banned_lists.set(room_name, banned_lists.get(room_name).push(banned_name));

            }else{
                const newBannedList = [banned_name]
                
                banned_lists.set(room_name, newBannedList)
            }
            var banned_user_id = kick_user_out(room_name, banned_name);
            var msg = banned_name + " was banned from " + room_name;
            io.to(room_name).emit("message_response", { message: msg , username: socket.username});
            var dmMsg = "you were banned from " + room_name
            socket.broadcast.to(banned_user_id).emit("message_response", { message: dmMsg , username: socket.username});
        }
    });

    socket.on('kick_user', function(info){
        var banner_name = info['banner_name'];
        var banned_name = info['banned_name'];
        var room_name = info['room_name'];

        if(room_creator.get(room_name) == banner_name){
            var kicked_user_id = kick_user_out(room_name, banned_name);
            var msg = banned_name + " was kicked out of " + room_name;
            io.to(room_name).emit("message_response", { message: msg , username: socket.username});
            var dmMsg = "you were kicked out of " + room_name
            socket.broadcast.to(kicked_user_id).emit("message_response", { message: dmMsg , username: socket.username});
        }
    });
    socket.on("start_typing", function(data){
        var msg = socket.username +" is typing.";
        if(data["to"] == "public"){
            io.to(socket.current_room).emit("message_response", { message: msg , username: "Server"});
        }else{
            var sockets = io.sockets.adapter.rooms.get(socket.current_room);
            for(const s of sockets){
                const clientSocket = io.sockets.sockets.get(s);
                if(clientSocket.username == data["to"]){
                    socket.broadcast.to(clientSocket.id).emit("message_response", { message: msg , username: "Server"});
                }
            }
        }
    });
    socket.on("stop_typing", function(data){
        var msg = socket.username +" stops typing.";
        if(data["to"] == "public"){
            console.log(socket.current_room);
            io.to(socket.current_room).emit("message_response", { message: msg , username: "Server"});
        }else{
            var sockets = io.sockets.adapter.rooms.get(socket.current_room);
            for(const s of sockets){
                const clientSocket = io.sockets.sockets.get(s);
                if(clientSocket.username == data["to"]){
                    socket.broadcast.to(clientSocket.id).emit("message_response", { message: msg , username: "Server"});
                }
            }
        }
    });
    // function get_rooms() {
    //     let room_list = [];
    //     // const rooms = io.of("/").adapter.rooms; // Map<Room, Set<SocketId>>
    //     let keys = room_creator.keys();
    //     for (let room in keys)
    //         room_list.push(room)
    //     return room_list;
    // }
    function kick_user_out(room_name, banned_name){
        var sockets = io.sockets.adapter.rooms.get(room_name);
        for(const s of sockets){
            const clientSocket = io.sockets.sockets.get(s);
            if(clientSocket.username == banned_name){
                clientSocket.leave(room_name);
                clientSocket.join("global");
                clientSocket.current_room = "global";
                io.to("global").emit("change_room_response", {
                    "room": "global", 
                    "users": get_username_by_sockets(get_sockets_by_room("global")), 
                    "host": room_creator.get("global")
                });
                return clientSocket.id
            }
        }
    }
    function get_sockets_by_room(room) {
        sid_set = io.of("/").adapter.rooms.get(room); // Map<Room, Set<SocketId>>
        let sockets = [];
        if (sid_set == null) return sockets;
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