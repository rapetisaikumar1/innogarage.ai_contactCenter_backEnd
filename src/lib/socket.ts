import { Server as SocketIOServer, Socket } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from './logger';

let io: SocketIOServer | null = null;

export function initSocketIO(httpServer: http.Server): SocketIOServer {
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── Auth middleware: validate JWT on every socket connection ─────────────
  io.use((socket: Socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string) ||
        (socket.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const payload = jwt.verify(token, env.JWT_SECRET) as {
        userId: string;
        role: string;
      };

      (socket as Socket & { userId: string; role: string }).userId = payload.userId;
      (socket as Socket & { userId: string; role: string }).role = payload.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket as Socket & { userId: string; role: string };
    logger.info({ userId, role, socketId: socket.id }, 'Socket connected');

    // Each user joins a personal room so we can target them individually
    socket.join(`user:${userId}`);

    // Admins also join the admin room for broadcast events
    if (role === 'ADMIN' || role === 'MANAGER') {
      socket.join('admins');
    }

    socket.on('disconnect', () => {
      logger.info({ userId, socketId: socket.id }, 'Socket disconnected');
    });
  });

  logger.info('Socket.IO initialised');
  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialised — call initSocketIO first');
  return io;
}

// ── Emit helpers ─────────────────────────────────────────────────────────────

/** Emit to every connected socket (all users) */
export function emitToAll(event: string, data: unknown): void {
  getIO().emit(event, data);
}

/** Emit to a specific user by userId */
export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(`user:${userId}`).emit(event, data);
}

/** Emit to a list of userIds */
export function emitToUsers(userIds: string[], event: string, data: unknown): void {
  const ioServer = getIO();
  for (const uid of userIds) {
    ioServer.to(`user:${uid}`).emit(event, data);
  }
}

/** Emit to all admins/managers */
export function emitToAdmins(event: string, data: unknown): void {
  getIO().to('admins').emit(event, data);
}
