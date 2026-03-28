// ===================================================================
// src/socket/socketManager.ts
// ===================================================================
// Singleton holder for the Socket.io server instance.
// Allows other modules (e.g. controllers) to access `io` without
// circular imports.
// ===================================================================

import { Server as SocketIOServer } from 'socket.io';
import { Orchestrator } from '../services/orchestrator';

let io: SocketIOServer | null = null;
let orchestratorInstance: Orchestrator | null = null;

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

/**
 * Store the shared Orchestrator instance (called once during socket setup).
 */
export function setOrchestrator(instance: Orchestrator): void {
  orchestratorInstance = instance;
}

/**
 * Retrieve the shared Orchestrator instance.
 * @throws If called before setOrchestrator().
 */
export function getOrchestrator(): Orchestrator {
  if (!orchestratorInstance) {
    throw new Error(
      '[SocketManager] Orchestrator instance not initialized. Call setOrchestrator() first.',
    );
  }
  return orchestratorInstance;
}
