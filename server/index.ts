import express from 'express';
import { seedIfEmpty } from './db/seed';
import { candidatesRouter } from './routes/candidates';
import { repositoriesRouter } from './routes/repositories';
import { insightsRouter } from './routes/insights';

const PORT = Number(process.env.PORT ?? 8787);

// Create schema + seed demo data on first boot.
seedIfEmpty();

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/candidates', candidatesRouter);
app.use('/api/repositories', repositoriesRouter);
app.use('/api/insights', insightsRouter);

app.listen(PORT, () => {
  console.log(`[codeproof] API listening on http://localhost:${PORT}`);
});
