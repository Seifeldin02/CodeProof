import { Router } from 'express';
import { getAllRepositories, getRepositoryByCandidate } from '../db/queries/repositories';

export const repositoriesRouter = Router();

repositoriesRouter.get('/', (_req, res) => {
  res.json(getAllRepositories());
});

repositoriesRouter.get('/candidate/:id', (req, res) => {
  const repo = getRepositoryByCandidate(req.params.id);
  if (!repo) {
    res.status(404).json({ error: 'Repository not found' });
    return;
  }
  res.json(repo);
});
