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
import { resolveConfiguredOrigins } from './src/server/originPolicy';
import { securityHeadersMiddleware } from './src/server/securityHeaders';
import { FileServerStateStore } from './src/server/serverStore';
import { ServerSessionService } from './src/server/sessionService';
import { StripeHostedCheckoutService } from './src/server/stripeProvider';

export interface CreateServerAppOptions {
  isProduction?: boolean;
  sessionSecret?: string;
  requirePersistentSessionSecret?: boolean;
  trustProxy?: boolean | number;
  mountFrontend?: boolean;
  routerDeps?: FoundationRouterDependencies;
}

export async function createAppServer(options: CreateServerAppOptions = {}): Promise<Express> {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  const trustProxyRaw = process.env.TRUST_PROXY?.trim().toLowerCase();
  let parsedTrustProxy: boolean | number = false;
  if (trustProxyRaw === 'true') {
    parsedTrustProxy = 1;
  } else if (trustProxyRaw && /^\d+$/.test(trustProxyRaw)) {
    const hops = Number.parseInt(trustProxyRaw, 10);
    parsedTrustProxy = hops > 0 ? hops : false;
  }
  const trustProxy = options.trustProxy ?? parsedTrustProxy;

  const stateStore = options.routerDeps?.stateStore ?? new FileServerStateStore();
  const sessionService =
    options.routerDeps?.sessionService ??
    new ServerSessionService({
      store: stateStore,
      secret: options.sessionSecret,
    });
  const stripeService =
    options.routerDeps?.stripeService ?? new StripeHostedCheckoutService({ store: stateStore });

  const strictSecretsEnv = process.env.NAILIX_STRICT_SECRETS?.trim().toLowerCase();
  const hasLiveExternalSecrets =
    Boolean(process.env.STRIPE_SECRET_KEY?.trim()) ||
    Boolean(process.env.NAILIX_MASTER_INVITE_CODES?.trim()) ||
    strictSecretsEnv === '1' ||
    strictSecretsEnv === 'true';
  const requirePersistentSecret =
    options.requirePersistentSessionSecret ?? (isProduction && hasLiveExternalSecrets);

  // Q-07 + Cloud Run deploy compatibility:
  // Refuse startup without NAILIX_SESSION_SECRET whenever live payment keys,
  // master invite codes, or NAILIX_STRICT_SECRETS=1 are active in production.
  // Showcase Cloud Run deployments without custom secrets boot cleanly with
  // a per-instance 32-byte CSPRNG session key and emit an honest warning.
  if (requirePersistentSecret && !sessionService.hasPersistentSecretConfigured()) {
    throw new Error(
      '[Nailix Server] Refusing production startup: NAILIX_SESSION_SECRET (>= 16 chars) is required when Stripe/master secrets or NAILIX_STRICT_SECRETS are enabled.'
    );
  }
  if (isProduction && !sessionService.hasPersistentSecretConfigured()) {
    console.warn(
      '[Nailix Server] Starting in showcase production mode without NAILIX_SESSION_SECRET; HttpOnly sessions use an ephemeral per-instance CSPRNG key.'
    );
  }

  // V-01: Emit loud startup warning in production if neither APP_URL nor NAILIX_ALLOWED_ORIGINS is configured
  const configuredOrigins = resolveConfiguredOrigins(options.routerDeps?.allowedOrigins);
  if (isProduction && configuredOrigins.length === 0) {
    console.warn(
      '[Nailix Server] WARNING: Production started with no allowed origins configured (APP_URL / NAILIX_ALLOWED_ORIGINS unset). Same-origin browser POST requests to WebAuthn and Checkout will be rejected with HTTP 403.'
    );
  }

  const app = express();
  if (trustProxy !== false && trustProxy !== 0) {
    app.set('trust proxy', trustProxy === true ? 1 : trustProxy);
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
        res.sendFile(path.join(distDir, 'index.html'), err => {
          if (err && !res.headersSent) {
            res.status(503).json({
              error: 'Frontend bundle not built. Run npm run build first.',
            });
          }
        });
      });
    }
  }

  return app;
}

export async function startServer() {
  const parsedPort = Number(process.env.PORT || 3000);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
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
