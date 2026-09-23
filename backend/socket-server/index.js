'use strict';

const http = require('http');
const { Server } = require('socket.io');
const config = require('../shared/config');
const db = require('../shared/db');
const socketHandler = require('./socketHandler');

function createSocketServer(existingHttpServer = null) {
    let server = existingHttpServer;
    let isStandalone = false;

    if (!server) {
        server = http.createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ status: 'ok', service: 'socket-server' }));
            }
            res.writeHead(404);
            res.end();
        });
        isStandalone = true;
    }

    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25000,
        pingTimeout: 20000,
    });

    socketHandler.init(io);

    if (isStandalone) {
        const port = config.SOCKET_PORT;
        server.listen(port, () => {
            console.log(`[SocketServer] ⚡ Standalone Socket Server running on port ${port}`);
        });
    }

    return { io, server };
}

async function start() {
    await db.connectDB();
    createSocketServer();
}

if (require.main === module) {
    start().catch((err) => {
        console.error('[SocketServer Fatal]:', err);
        process.exit(1);
    });
}

module.exports = { createSocketServer, start };
