import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  assertNoPlaintextSecrets,
  detectPlaintextSecrets,
  fromBase64Url,
  generateCryptographicChallenge,
  toBase64Url,
} from '../infrastructure/identity/secretHygiene';
import {
  createSimulatedDemoPasskey,
  detectWebAuthnSupport,
} from '../infrastructure/identity/webAuthnService';
import { SalonRepository } from '../infrastructure/storage/salonRepository';
import { MemoryStorageAdapter } from '../infrastructure/storage/indexedDbAdapter';
import { CryptoCloudEngine } from '../simulation/cryptocloud';
import { PasskeyCredentialRecord } from '../domain/identity';

describe('Stage 3 — WebAuthn Identity, Secret Hygiene & CSP', () => {
  it('round-trips arbitrary bytes cleanly through Base64URL encoding', () => {
    const sample = new Uint8Array([0, 15, 62, 63, 128, 251, 255]);
    const encoded = toBase64Url(sample);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = fromBase64Url(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(sample));
  });

  it('generates unique 32-byte cryptographic challenges via Web Crypto CSPRNG', () => {
    const c1 = generateCryptographicChallenge(32);
    const c2 = generateCryptographicChallenge(32);
    expect(c1.length).toBe(32);
    expect(c2.length).toBe(32);
    expect(toBase64Url(c1)).not.toBe(toBase64Url(c2));
  });

  it('blocks plaintext private keys, passwords, mnemonics, and PAT tokens via assertNoPlaintextSecrets', () => {
    const pemHeader = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
    const fakePat = ['ghp_', 'TestDummyTokenValue9876543210'].join('');

    expect(detectPlaintextSecrets(pemHeader)).toContain('PEM private key header');
    expect(detectPlaintextSecrets('{"privateKey":"0xdeadbeef"}')).toContain('privateKey field');
    expect(detectPlaintextSecrets('{"seedPhrase":"alpha beta gamma"}')).toContain('seedPhrase field');
    expect(detectPlaintextSecrets('{"password":"hunter2"}')).toContain('password field');
    expect(detectPlaintextSecrets(fakePat)).toContain('GitHub PAT');

    expect(() => assertNoPlaintextSecrets({ privateKey: '0x1234' })).toThrow(/Security policy violation/);

    const safePublicPasskey: PasskeyCredentialRecord = {
      id: 'cred-safe-spki',
      rawIdBase64Url: 'AQID',
      publicKeySpkiBase64Url: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE',
      displayName: 'Marina Sol',
      role: 'client',
      rpId: 'localhost',
      algorithm: -7,
      createdAt: '2026-11-15T10:00:00.000Z',
      lastUsedAt: '2026-11-15T10:00:00.000Z',
      transports: ['internal'],
      isSimulatedFallback: false,
    };

    expect(() => assertNoPlaintextSecrets(safePublicPasskey)).not.toThrow();
  });

  it('enforces secret hygiene on SalonRepository identity writes and CryptoCloud JSON snapshots', async () => {
    const repo = new SalonRepository(new MemoryStorageAdapter());
    await repo.ensureSeededAndLoad();

    await expect(
      repo.savePasskeys([
        {
          id: 'bad',
          rawIdBase64Url: 'AA',
          displayName: 'Bad',
          role: 'client',
          rpId: 'localhost',
          algorithm: -7,
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
          transports: [],
          isSimulatedFallback: false,
          privateKey: '0xshouldneverbestored',
        } as unknown as PasskeyCredentialRecord,
      ])
    ).rejects.toThrow(/Security policy violation/);

    const engine = new CryptoCloudEngine();
    await expect(
      engine.exportSessionSnapshot({
        appointments: [],
        reviews: [],
        portfolio: [],
        chats: [
          {
            id: 'chat-bad',
            threadId: 'thread-1',
            senderId: 'user-1',
            senderName: 'Test',
            senderRole: 'client',
            recipientId: 'artist-1',
            text: ['-----BEGIN', 'PRIVATE KEY-----'].join(' '),
            timestamp: '10:00',
          },
        ],
      })
    ).rejects.toThrow(/Security policy violation/);
    engine.destroy();
  });

  it('reports WebAuthn support cleanly in Node/SSR and marks demo fallback explicitly as [SIM]', async () => {
    const report = await detectWebAuthnSupport();
    expect(report.isSupported).toBe(false);
    expect(report.reason).toContain('SSR / Node');

    const simCred = createSimulatedDemoPasskey('Elena Demo', 'master');
    expect(simCred.isSimulatedFallback).toBe(true);
    expect(simCred.displayName).toContain('[SIM]');
    expect(simCred.role).toBe('master');
    expect(() => assertNoPlaintextSecrets(simCred)).not.toThrow();
  });

  it('declares a strict Content-Security-Policy meta header in index.html without invalid meta directives', () => {
    const indexHtml = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', '..', 'index.html'),
      'utf8'
    );
    expect(indexHtml).toContain('http-equiv="Content-Security-Policy"');
    expect(indexHtml).toContain("default-src 'self'");
    expect(indexHtml).toContain("object-src 'none'");
    expect(indexHtml).not.toContain('frame-ancestors');
  });
});
