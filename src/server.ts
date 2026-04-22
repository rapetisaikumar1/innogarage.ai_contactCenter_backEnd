import http from 'http';
import app from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const PORT = parseInt(env.PORT, 10);

const server = http.createServer(app);

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);

  server.close(async () => {
    logger.info('HTTP server closed');
    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting database');
    }
    process.exit(0);
  });

  // Force exit after 10 seconds if still hanging
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

// Catch uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — shutting down');
  process.exit(1);
});

async function start() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    server.listen(PORT, () => {
      logger.info({ port: PORT, env: env.NODE_ENV }, 'Server started');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
