// =============================================================================
// Nailix Full-Stack Entry Point (Stage 4 · Sprint 4.1 Foundation)
// - Runs Express on PORT 3000 with `/api/*` challenge & payment status endpoints.
// - Mounts `vite.middlewares` in development (`tsx server.ts`) and serves `dist/` in prod.
// =============================================================================

import path from 'node:path';
import express from 'express';
import { createFoundationApiRouter } from './src/server/apiRouter';

const PORT = Number(process.env.PORT ?? 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();

  app.use('/api', createFoundationApiRouter());

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Nailix Server] Listening on http://0.0.0.0:${PORT} (${IS_PRODUCTION ? 'prod' : 'dev'})`);
  });
}

void startServer();
