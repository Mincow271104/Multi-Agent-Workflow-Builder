// ===================================================================
// src/socket/socketManager.ts
// ===================================================================
// Singleton holder for the Socket.io server instance.
// Allows other modules (e.g. controllers) to access `io` without
// circular imports.
// ===================================================================

import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

/**
 * Store the Socket.io server instance (called once during startup).
 */
export function setIO(instance: SocketIOServer): void {
  io = instance;
}

/**
 * Retrieve the Socket.io server instance.
 * @throws If called before setIO().
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error(
      '[SocketManager] Socket.io instance not initialized. Call setIO() first.',
    );
  }
  return io;
}

export default { setIO, getIO };
