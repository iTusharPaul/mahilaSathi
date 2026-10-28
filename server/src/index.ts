import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { SERVER_CONFIG } from './config.js';
import { getDb } from './db/index.js';
import authRoutes from './routes/auth.js';
import circleRoutes from './routes/circles.js';
import reportRoutes from './routes/reports.js';
import planRoutes from './routes/plan.js';

const app = express();

app.use(cors());
app.use(express.json());

// Initialize database
getDb();

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/circles', circleRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/plan', planRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'NightWise',
    time: new Date().toISOString(),
    demoMode: SERVER_CONFIG.DEMO_MODE,
    nexconnConfigured: Boolean(SERVER_CONFIG.NEXCONN_APP_KEY && SERVER_CONFIG.NEXCONN_APP_SECRET),
  });
});

// Single Deployable: serve built client in production
const clientDistPath = path.resolve(process.cwd(), '../client/dist');
const altClientDistPath = path.resolve(process.cwd(), 'client/dist');
const resolvedDist = fs.existsSync(clientDistPath)
  ? clientDistPath
  : fs.existsSync(altClientDistPath)
  ? altClientDistPath
  : null;

if (resolvedDist) {
  console.log(`[NightWise Server] Serving frontend from ${resolvedDist}`);
  app.use(express.static(resolvedDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(resolvedDist, 'index.html'));
  });
}

const server = app.listen(SERVER_CONFIG.PORT, () => {
  console.log(`[NightWise Server] Running on http://localhost:${SERVER_CONFIG.PORT}`);
  console.log(`[NightWise Server] DEMO_MODE = ${SERVER_CONFIG.DEMO_MODE}`);
});

export default app;
