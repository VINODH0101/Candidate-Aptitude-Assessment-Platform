import type { Server } from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { finalizeExpiredAttempts } from './modules/assessment/assessment.service';

const SWEEP_INTERVAL_MS = 60_000;

async function bootstrap(): Promise<void> {
  await prisma.$connect();
  logger.info('Connected to database');

  try {
    const finalized = await finalizeExpiredAttempts();
    if (finalized > 0) {
      logger.info('Finalized expired attempts at startup', { count: finalized });
    }
  } catch (error) {
    logger.error('Failed to finalize expired attempts at startup', {
      error: error instanceof Error ? error.stack : String(error),
    });
  }

  const app = createApp();

  // Bind explicitly to all interfaces so container platforms (Render, Docker)
  // can reach the process. Render injects the port via process.env.PORT.
  const server: Server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`API listening on ${env.HOST}:${env.PORT}`, {
      env: env.NODE_ENV,
    });
  });

  const sweeper = setInterval(() => {
    finalizeExpiredAttempts()
      .then((count) => {
        if (count > 0) {
          logger.info('Finalized expired attempts', { count });
        }
      })
      .catch((error: unknown) => {
        logger.error('Expired attempt sweeper failed', {
          error: error instanceof Error ? error.stack : String(error),
        });
      });
  }, SWEEP_INTERVAL_MS);
  sweeper.unref();

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);
    clearInterval(sweeper);

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(() => {
      prisma
        .$disconnect()
        .catch((error: unknown) => {
          logger.error('Failed to disconnect Prisma', {
            error: error instanceof Error ? error.stack : String(error),
          });
        })
        .finally(() => {
          process.exit(0);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.stack : String(reason),
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception, shutting down', { error: error.stack });
  process.exit(1);
});

bootstrap().catch((error: unknown) => {
  logger.error('Failed to start server', {
    error: error instanceof Error ? error.stack : String(error),
  });
  process.exit(1);
});
