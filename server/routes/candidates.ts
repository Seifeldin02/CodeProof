import { Router } from 'express';
import { getAllCandidates, getCandidateById } from '../db/queries/candidates';
import { getRepositoryByCandidate } from '../db/queries/repositories';
import type { CandidateDetail } from '../../src/lib/apiTypes';

export const candidatesRouter = Router();

candidatesRouter.get('/', (_req, res) => {
  res.json(getAllCandidates());
});

candidatesRouter.get('/:id', (req, res) => {
  const candidate = getCandidateById(req.params.id);
  if (!candidate) {
    res.status(404).json({ error: 'Candidate not found' });
    return;
  }
  const detail: CandidateDetail = {
    ...candidate,
    repository: getRepositoryByCandidate(candidate.id),
  };
  res.json(detail);
});
