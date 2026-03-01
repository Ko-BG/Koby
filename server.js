const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Allows connections from different ports during dev
});

// --- GAME DATABASE ---
const state = {
    players: {},
    leaderboard: [
        { name: "Tileh", score: 9999 },
        { name: "NairobiRay", score: 8500 }
    ]
};

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log(`NEW CONNECTION: ${socket.id}`);

    // 1. JOINING THE GAME
    socket.on('join', (data) => {
        state.players[socket.id] = {
            id: socket.id,
            name: data.name || "Nairobi Legend",
            x: Math.random() * 10, // Random spawn
            z: Math.random() * 10,
            color: data.color || 0xffffff,
            lastSeen: Date.now()
        };

        // Sync new player with the current world state
        socket.emit('currentPlayers', state.players);
        socket.emit('updateLeaderboard', state.leaderboard);
        
        // Notify others
        socket.broadcast.emit('newPlayer', state.players[socket.id]);
    });

    // 2. MOVEMENT SYNC
    socket.on('playerMovement', (movementData) => {
        if (state.players[socket.id]) {
            // Update the "Source of Truth"
            state.players[socket.id].x = movementData.x;
            state.players[socket.id].z = movementData.z;
            state.players[socket.id].lastSeen = Date.now();

            // Broadcast only to other players to save bandwidth
            socket.broadcast.emit('playerMoved', state.players[socket.id]);
        }
    });

    // 3. CHAT SYSTEM (The Relay)
    // Listens for a message and broadcasts it to the whole city
    socket.on('chatMessage', (msg) => {
        if (state.players[socket.id]) {
            const chatData = {
                name: state.players[socket.id].name,
                text: msg,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            
            // Broadcast to all connected clients
            io.emit('newMessage', chatData); 
            console.log(`[CHAT] ${chatData.name}: ${msg}`);
        }
    });

    // 4. DISCONNECTION
    socket.on('disconnect', () => {
        console.log(`PLAYER LEFT: ${socket.id}`);
        delete state.players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// --- SERVER HEARTBEAT ---
// Clean up "ghost" players who crashed without disconnecting
setInterval(() => {
    const now = Date.now();
    for (let id in state.players) {
        if (now - state.players[id].lastSeen > 10000) { // 10 seconds timeout
            delete state.players[id];
            io.emit('playerDisconnected', id);
        }
    }
}, 5000);

// --- CLOUD READY LISTENER ---
// Uses process.env.PORT for Heroku/Render/Railway compatibility
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ====================================
    NAIROBI MULTIPLAYER SERVER STARTED
    Port: ${PORT}
    ====================================
    `);
});
