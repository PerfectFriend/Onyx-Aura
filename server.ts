// =============================================================================
// Nailix Full-Stack Entry Point (Stage 4 · Sprint 4.2)
// - Runs Express 5 on PORT 3000 with HTTP security headers, persistent file state
//   store (.data/nailix-server.json), `/api/auth/webauthn/*` SPKI + HttpOnly sessions,
//   and env-driven Stripe Hosted Checkout SAQ-A endpoints.
// - Mounts `vite.middlewares` in development (`tsx server.ts`) and serves `dist/` in prod.
// =============================================================================

import path from 'node:path';
import express from 'express';
import { createFoundationApiRouter } from './src/server/apiRouter';
import { defaultChallengeStubStore } from './src/server/challengeService';
import { securityHeadersMiddleware } from './src/server/securityHeaders';
import { FileServerStateStore } from './src/server/serverStore';
import { ServerSessionService } from './src/server/sessionService';
import { StripeHostedCheckoutService } from './src/server/stripeProvider';

const PORT = Number(process.env.PORT ?? 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware(IS_PRODUCTION));

  const stateStore = new FileServerStateStore();
  const sessionService = new ServerSessionService({ store: stateStore });
  const stripeService = new StripeHostedCheckoutService({ store: stateStore });

  if (IS_PRODUCTION && !sessionService.hasPersistentSecretConfigured()) {
    console.warn(
      '[Nailix Server] NAILIX_SESSION_SECRET is not set (>= 16 chars); using ephemeral boot-scoped HMAC key.'
    );
  }

  app.use(
    '/api',
    createFoundationApiRouter({
      challengeStore: defaultChallengeStubStore,
      stateStore,
      sessionService,
      stripeService,
    })
  );

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
    console.log(
      `[Nailix Server] Listening on http://0.0.0.0:${PORT} (${IS_PRODUCTION ? 'prod' : 'dev'})`
    );
  });
}

void startServer();
