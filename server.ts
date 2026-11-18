// =============================================================================
// Nailix Full-Stack Entry Point (Stage 4 · Sprint 4.4 Hardened)
// - Runs Express 5 on PORT 3000 with HTTP security headers (HSTS + strict
//   frame-ancestors), persistent file state store (.data/nailix-server.json),
//   hardened WebAuthn + HttpOnly sessions, and Stripe Hosted Checkout SAQ-A.
// - Enforces production NAILIX_SESSION_SECRET, explicit TRUST_PROXY gating,
//   and JSON 404 for unknown /api/* paths so API typos never fall into SPA HTML.
// =============================================================================

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express, { Express } from 'express';
import { createFoundationApiRouter, FoundationRouterDependencies } from './src/server/apiRouter';
import { defaultChallengeStubStore } from './src/server/challengeService';
import { securityHeadersMiddleware } from './src/server/securityHeaders';
import { FileServerStateStore } from './src/server/serverStore';
import { ServerSessionService } from './src/server/sessionService';
import { StripeHostedCheckoutService } from './src/server/stripeProvider';

export interface CreateServerAppOptions {
  isProduction?: boolean;
  sessionSecret?: string;
  trustProxy?: boolean;
  mountFrontend?: boolean;
  routerDeps?: FoundationRouterDependencies;
}

export async function createAppServer(options: CreateServerAppOptions = {}): Promise<Express> {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  const trustProxyEnv = process.env.TRUST_PROXY?.trim().toLowerCase();
  const trustProxy =
    options.trustProxy ?? (trustProxyEnv === '1' || trustProxyEnv === 'true');

  const stateStore = options.routerDeps?.stateStore ?? new FileServerStateStore();
  const sessionService =
    options.routerDeps?.sessionService ??
    new ServerSessionService({
      store: stateStore,
      secret: options.sessionSecret,
    });
  const stripeService =
    options.routerDeps?.stripeService ?? new StripeHostedCheckoutService({ store: stateStore });

  // Q-07: Refuse production startup without persistent HMAC session secret
  if (isProduction && !sessionService.hasPersistentSecretConfigured()) {
    throw new Error(
      '[Nailix Server] Refusing production startup: NAILIX_SESSION_SECRET (>= 16 chars) is required.'
    );
  }

  const app = express();
  if (trustProxy) {
    app.set('trust proxy', 1);
  }
  app.use(securityHeadersMiddleware(isProduction));

  app.use(
    '/api',
    createFoundationApiRouter({
      challengeStore: defaultChallengeStubStore,
      stateStore,
      sessionService,
      stripeService,
      isProduction,
      ...options.routerDeps,
    })
  );

  // Q-07: Unknown /api/* routes MUST return JSON 404 instead of falling through to SPA index.html
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const mountFrontend = options.mountFrontend ?? true;
  if (mountFrontend) {
    if (!isProduction) {
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
  }

  return app;
}

export async function startServer() {
  const port = Number(process.env.PORT ?? 3000);
  const isProduction = process.env.NODE_ENV === 'production';
  const app = await createAppServer({ isProduction, mountFrontend: true });

  app.listen(port, '0.0.0.0', () => {
    console.log(
      `[Nailix Server] Listening on http://0.0.0.0:${port} (${isProduction ? 'prod' : 'dev'})`
    );
  });
}

const isEntrypoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  void startServer().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
