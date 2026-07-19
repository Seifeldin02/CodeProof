import { Router } from 'express';
import { getInsights } from '../db/queries/insights';

export const insightsRouter = Router();

insightsRouter.get('/', (_req, res) => {
  res.json(getInsights());
});
