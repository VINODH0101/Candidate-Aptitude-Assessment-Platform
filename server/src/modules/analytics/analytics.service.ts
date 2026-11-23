import type { AttemptStatus, AttemptResult } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const FINALIZED_STATUSES: AttemptStatus[] = ['COMPLETED', 'EXPIRED'];
const BUCKETS = ['below 0', '0-19', '20-39', '40-59', '60-79', '80-100'] as const;

interface DistributionRow {
  bucket: string;
  count: number;
}

export interface DashboardAnalytics {
  totals: {
    candidatesRegistered: number;
    completedAssessments: number;
    expiredAssessments: number;
    finalizedAssessments: number;
    inProgressAttempts: number;
  };
  performance: {
    averageNetScore: number;
    averagePercentage: number;
    highestNetScore: number;
    highestPercentage: number;
    passRate: number;
    passedCount: number;
    failedCount: number;
  };
  passFailDistribution: Array<{ result: AttemptResult; count: number }>;
  scoreDistribution: Array<{ bucket: string; count: number }>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getDashboardAnalytics(): Promise<DashboardAnalytics> {
  const [
    candidatesRegistered,
    completedAssessments,
    expiredAssessments,
    inProgressAttempts,
    aggregate,
    passedCount,
    distributionRows,
  ] = await Promise.all([
    prisma.candidate.count(),
    prisma.testAttempt.count({ where: { status: 'COMPLETED' } }),
    prisma.testAttempt.count({ where: { status: 'EXPIRED' } }),
    prisma.testAttempt.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.testAttempt.aggregate({
      where: { status: { in: FINALIZED_STATUSES } },
      _avg: { netScore: true, percentage: true },
      _max: { netScore: true, percentage: true },
      _count: { _all: true },
    }),
    prisma.testAttempt.count({
      where: { status: { in: FINALIZED_STATUSES }, result: 'PASS' },
    }),
    prisma.$queryRaw<DistributionRow[]>`
      SELECT "bucket", COUNT(*)::int AS "count"
      FROM (
        SELECT CASE
          WHEN "percentage" < 0 THEN 'below 0'
          WHEN "percentage" < 20 THEN '0-19'
          WHEN "percentage" < 40 THEN '20-39'
          WHEN "percentage" < 60 THEN '40-59'
          WHEN "percentage" < 80 THEN '60-79'
          ELSE '80-100'
        END AS "bucket"
        FROM "TestAttempt"
        WHERE "status" IN ('COMPLETED', 'EXPIRED') AND "percentage" IS NOT NULL
      ) bucketed
      GROUP BY "bucket"
    `,
  ]);

  const finalizedAssessments = completedAssessments + expiredAssessments;
  const failedCount = Math.max(0, finalizedAssessments - passedCount);
  const distributionMap = new Map(
    distributionRows.map((row) => [row.bucket, row.count]),
  );
  const scoreDistribution = BUCKETS.map((bucket) => ({
    bucket,
    count: distributionMap.get(bucket) ?? 0,
  }));

  return {
    totals: {
      candidatesRegistered,
      completedAssessments,
      expiredAssessments,
      finalizedAssessments,
      inProgressAttempts,
    },
    performance: {
      averageNetScore: round2(aggregate._avg.netScore ?? 0),
      averagePercentage: round2(aggregate._avg.percentage ?? 0),
      highestNetScore: aggregate._max.netScore ?? 0,
      highestPercentage: aggregate._max.percentage ?? 0,
      passRate:
        finalizedAssessments > 0
          ? round2((passedCount / finalizedAssessments) * 100)
          : 0,
      passedCount,
      failedCount,
    },
    passFailDistribution: [
      { result: 'PASS', count: passedCount },
      { result: 'FAIL', count: failedCount },
    ],
    scoreDistribution,
  };
}
