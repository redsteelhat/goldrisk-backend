/**
 * GoldRisk AI Backend
 * Entry point
 */

import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/auth.routes.js';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`GoldRisk AI Backend running on port ${port}`);
});
