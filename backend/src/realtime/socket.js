import { Server } from 'socket.io';
import { verifyToken } from '../utils/jwt.js';
import { subscribeToClickUpdates } from '../services/realtime.service.js';

let subscriberClient = null;

/**
 * Attaches a Socket.io server to the given HTTP server. Every connection
 * must present a valid JWT (same token used for REST auth) in the
 * connection handshake - anonymous users have no dashboard to push updates
 * to, so there's nothing for them to subscribe to anyway. Each authenticated
 * socket joins a room named after its user id; the Redis subscription below
 * fans each click update out only to the room for the link's owner, so one
 * user never sees another user's click activity.
 */
export async function attachRealtimeServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
  });

  io.use((socket, next) => {
    try {
      const { token } = socket.handshake.auth || {};
      if (!token) throw new Error('No token provided');
      const payload = verifyToken(token);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
  });

  subscriberClient = await subscribeToClickUpdates((payload) => {
    const room = `user:${payload.userId}`;
    if (payload.type === 'click') {
      io.to(room).emit('link:click', { shortCode: payload.shortCode, clickCount: payload.clickCount });
    } else if (payload.type === 'deleted') {
      io.to(room).emit('link:deleted', { shortCode: payload.shortCode });
    } else if (payload.type === 'permanently_deleted') {
      io.to(room).emit('link:permanentlyDeleted', { shortCode: payload.shortCode });
    } else if (payload.type === 'enriched') {
      io.to(room).emit('link:enriched', {
        shortCode: payload.shortCode,
        title: payload.title,
        category: payload.category,
        summary: payload.summary,
        keyTopics: payload.keyTopics,
        readingTimeMinutes: payload.readingTimeMinutes,
      });
    }
  });

  return io;
}

export async function closeRealtimeServer() {
  if (subscriberClient) {
    await subscriberClient.quit().catch(() => {});
  }
}
