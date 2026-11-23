import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { apiRouter } from './routes';
import { corsHandler } from './middleware/cors';
import { csrfOriginCheck } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error';
import { requestLogger } from './middleware/requestLogger';

/**
 * Locates the built React SPA. In the single-service production image the
 * bundle lives at /app/web/dist (one level above the server working dir);
 * during local development it lives at <repo>/web/dist.
 */
function resolveWebDistDir(): string | null {
  const candidates = [
    process.env.WEB_DIST_DIR,
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(__dirname, '../../web/dist'),
  ].filter((value): value is string => Boolean(value && value.length > 0));

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(corsHandler);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(csrfOriginCheck);

  app.use('/api', apiRouter);

  // Same-domain hosting of the production SPA (Render single-service deploy).
  const webDistDir = resolveWebDistDir();
  if (webDistDir) {
    app.use(
      express.static(webDistDir, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );

    // Client-side routing fallback: serve index.html for non-API navigations.
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api')) return next();
      if (path.extname(req.path)) return next();
      if (!req.accepts('html')) return next();
      res.sendFile(path.join(webDistDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
