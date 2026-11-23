import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { candidateAuthRouter } from '../modules/candidates/candidates.routes';
import { assessmentRouter } from '../modules/assessment/assessment.routes';
import { adminAuthRouter } from '../modules/admin-auth/admin-auth.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { requireAdmin, requireCandidate } from '../middleware/auth';

export const apiRouter = Router();

apiRouter.get('/health/live', (_req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', time: new Date().toISOString() },
  });
});

apiRouter.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({
      success: true,
      data: {
        status: 'ok',
        database: 'up',
        uptimeSeconds: Math.round(process.uptime()),
        time: new Date().toISOString(),
      },
    });
  } catch {
    res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is not reachable',
      },
    });
  }
});

apiRouter.use('/candidate/assessment', requireCandidate, assessmentRouter);
apiRouter.use('/candidate', candidateAuthRouter);

apiRouter.use('/admin/auth', adminAuthRouter);

// Every endpoint mounted here requires a valid admin session.
apiRouter.use('/admin', requireAdmin, adminRouter);
