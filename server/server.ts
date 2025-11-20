import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import apiRoutes from './routes/api';
import { setupVideoWorker } from './workers/videoWorker';

const app = new Hono();
const PORT = parseInt(process.env.PORT || '3000', 10);

const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];

app.use('/*', cors({
    origin: (origin) => {
        if (origin && origin.startsWith('http://localhost:')) return origin;
        return allowedOrigins[0];
    },
    credentials: true,
}));

// Create HTTP server for Socket.IO
const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || origin.startsWith('http://localhost:') || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

// Serve static files
app.use('/videos/*', serveStatic({ root: path.join(process.cwd(), 'public') }));
app.use('/*', serveStatic({ root: path.join(process.cwd(), 'web', 'dist') }));

// API routes
app.route('/api', apiRoutes);

// Socket.IO
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join:job', ({ jobId }) => {
        socket.join(jobId);
        console.log(`Client ${socket.id} joined job room: ${jobId}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Setup video worker
setupVideoWorker(io);

// Start servers
const honoServer = serve({
    fetch: app.fetch,
    port: PORT,
});

httpServer.listen(PORT + 1, () => {
    console.log(`Socket.IO server running on http://localhost:${PORT + 1}`);
});

console.log(`Hono server running on http://localhost:${PORT}`);
console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
