// ===================================================================
// Main Entry Point — Multi-Agent Workflow Builder Backend
// ===================================================================
//
// This file is the application bootstrap. It wires together:
//  - Express middleware stack (CORS, morgan, JSON parser)
//  - REST API routes (auth, workflows, agents, executions)
//  - Socket.io realtime layer (JWT auth, orchestrator events)
//  - Prisma database connection
//  - Global error handler
//  - Graceful shutdown
//
// Start with: npm run dev
// ===================================================================

import dotenv from 'dotenv';
dotenv.config(); // Load .env BEFORE any other imports read process.env

import express from 'express';
import http from 'http';
import cors from 'cors';
import morgan from 'morgan';

import prisma from './config/db';
import routes from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { logger } from './utils';
import { checkAllProviders } from './services/ai/ai-provider.factory';
import { setupSocket } from './socket';
import { setIO } from './socket/socketManager';
import { checkProvidersHealth } from './services/aiProviders';

// ─── Constants ────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '5000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const NODE_ENV = process.env.NODE_ENV || 'development';

// ─── Express App ──────────────────────────────────────────────────

const app = express();
const server = http.createServer(app);

// ─── Middleware Stack ─────────────────────────────────────────────
// Order matters: CORS → Logger → Body parsers → Routes → Error handler

// CORS — allow frontend origin with credentials (cookies, auth headers)
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// HTTP request logger — 'dev' format for colored, concise output
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsers — accept JSON up to 10MB (for large workflow configs)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health-Check Endpoint ────────────────────────────────────────
// Placed BEFORE API routes — no auth required.
// Returns server status, uptime, and AI provider availability.

app.get('/api/health', async (_req, res) => {
  // Check both the legacy provider system and the new streaming system
  const [legacyProviders, streamingProviders] = await Promise.all([
    checkAllProviders(),
    checkProvidersHealth(),
  ]);

  res.json({
    status: 'ok',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    database: 'connected',
    providers: {
      legacy: legacyProviders,
      streaming: streamingProviders,
    },
  });
});

// ─── API Routes (v1) ─────────────────────────────────────────────
// All REST endpoints are versioned under /api/v1
// See src/routes/index.ts for sub-router mounting

app.use('/api/v1', routes);

// ─── 404 Handler — Unmatched Routes ─────────────────────────────
// Must come AFTER all valid routes but BEFORE the error handler.

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    hint: 'All API endpoints are under /api/v1/. Check the docs at /api/health',
  });
});

// ─── Global Error Handler ─────────────────────────────────────────
// Catches all errors thrown or passed via next(error) in routes.
// Handles ApiError, ZodError, Prisma errors, and unknown errors.

app.use(errorHandler);

// ─── Socket.io Setup ─────────────────────────────────────────────
// Uses the dedicated socket module which includes:
//  - JWT authentication middleware
//  - Workflow room management (join/leave)
//  - Execution lifecycle events
//  - Orchestrator integration for real-time streaming

const io = setupSocket(server);

// Store the io instance globally so controllers can access it
// (e.g. execution.controller.ts uses getIO() to create Orchestrator)
setIO(io);

// ─── Start Server ─────────────────────────────────────────────────

async function bootstrap() {
  try {
    // 1. Verify database connection
    await prisma.$connect();
    logger.info('✅ Database connected successfully');

    // 2. Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
      logger.info(`📡 Socket.io ready (JWT auth enabled)`);
      logger.info(`🌍 Environment: ${NODE_ENV}`);
      logger.info(`🔗 CORS origin: ${FRONTEND_URL}`);
      logger.info(`📖 Health check: http://localhost:${PORT}/api/health`);
      logger.info(`📋 API base: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// ─── Graceful Shutdown ────────────────────────────────────────────
// Handle SIGINT (Ctrl+C) and SIGTERM (Docker / PM2 stop) signals.

async function shutdown(signal: string) {
  logger.info(`\n${signal} received — shutting down gracefully…`);

  // 1. Close Socket.io (disconnect all clients)
  io.close();
  logger.info('📡 Socket.io connections closed');

  // 2. Close HTTP server (stop accepting new requests)
  server.close();
  logger.info('🚫 HTTP server closed');

  // 3. Disconnect Prisma (release DB connection pool)
  await prisma.$disconnect();
  logger.info('🗄️  Database disconnected');

  logger.info('👋 Server shut down.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle unhandled promise rejections (prevents silent crashes)
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('⚠️  Unhandled Promise Rejection:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

// ─── Go! ──────────────────────────────────────────────────────────
bootstrap();
