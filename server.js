const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files (your index.html)
app.use(express.static(__dirname));

// Store player data
const players = {};

io.on('connection', (socket) => {
    console.log(`[SYSTEM] Warrior connected: ${socket.id}`);

    // Handle New Player Join
    socket.on('joinGame', (username) => {
        players[socket.id] = {
            id: socket.id,
            name: username || 'Unknown Warrior',
            x: 0,
            z: 0,
            color: '#' + Math.floor(Math.random()*16777215).toString(16) // Random neon color
        };

        // Tell the new player about existing players
        socket.emit('currentPlayers', players);

        // Tell others a new warrior has entered Nairobi
        socket.broadcast.emit('newPlayer', players[socket.id]);
        
        console.log(`${players[socket.id].name} has entered the chase.`);
    });

    // Handle Movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].z = movementData.z;
            // Broadcast to everyone else
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Handle Chat
    socket.on('chatMessage', (msg) => {
        if (players[socket.id]) {
            io.emit('newMessage', {
                user: players[socket.id].name,
                text: msg,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        console.log(`[SYSTEM] Warrior disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`
    🚀 NAIROBI LOVE CHASE: STEAM EDITION
    ------------------------------------
    Server running at: http://localhost:${PORT}
    Status: MOTOR_COMBAT_READY
    `);
});
