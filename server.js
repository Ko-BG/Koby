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

/** * UPDATED FOR ROOT STRUCTURE 
 * Tells Express to serve files directly from the root directory 
 */
app.use(express.static(__dirname));

// Explicitly serve index.html when the root URL is accessed
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- SOCKET LOGIC ---
io.on('connection', (socket) => {
    console.log(`NEW CONNECTION: ${socket.id}`);

    // 1. JOINING THE GAME
    socket.on('join', (data) => {
        state.players[socket.id] = {
            id: socket.id,
            name: data.name || "Nairobi Legend",
            x: Math.random() * 10,
            z: Math.random() * 10,
            color: data.color || 0xffffff,
            lastSeen: Date.now()
        };

        socket.emit('currentPlayers', state.players);
        socket.emit('updateLeaderboard', state.leaderboard);
        socket.broadcast.emit('newPlayer', state.players[socket.id]);
    });

    // 2. MOVEMENT SYNC
    socket.on('playerMovement', (movementData) => {
        if (state.players[socket.id]) {
            state.players[socket.id].x = movementData.x;
            state.players[socket.id].z = movementData.z;
            state.players[socket.id].lastSeen = Date.now();
            socket.broadcast.emit('playerMoved', state.players[socket.id]);
        }
    });

    // 3. CHAT SYSTEM
    socket.on('chatMessage', (msg) => {
        if (state.players[socket.id]) {
            const chatData = {
                name: state.players[socket.id].name,
                text: msg,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
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
setInterval(() => {
    const now = Date.now();
    for (let id in state.players) {
        if (now - state.players[id].lastSeen > 10000) {
            delete state.players[id];
            io.emit('playerDisconnected', id);
        }
    }
}, 5000);

// --- CLOUD READY LISTENER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ====================================
    NAIROBI MASTER SERVER ONLINE
    ROOT DIRECTORY MODE ACTIVE
    Port: ${PORT}
    ====================================
    `);
});
