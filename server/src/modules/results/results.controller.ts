import type { Request, Response } from 'express';
import { asyncHandler, sendData } from '../../lib/http';
import { buildResultsCsv } from './csv';
import { exportResults, getResultDetail, listResults } from './results.service';
import type { ExportResultsQuery, ListResultsQuery } from './results.schemas';

export const listResultsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.query as unknown as ListResultsQuery;
    const results = await listResults(query);
    sendData(res, { results });
  },
);

export const exportResultsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.query as unknown as ExportResultsQuery;
    const items = await exportResults(query);
    const csv = buildResultsCsv(items);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="assessment-results-${date}.csv"`,
    );
    res.status(200).send(csv);
  },
);

export const resultDetailHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { attemptId } = req.params as { attemptId: string };
    const result = await getResultDetail(attemptId);
    sendData(res, { result });
  },
);
