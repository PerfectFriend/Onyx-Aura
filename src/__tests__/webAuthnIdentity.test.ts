import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  assertNoSecretLikeFields,
  detectSecretLikeFields,
  fromBase64Url,
  generateCryptographicChallenge,
  toBase64Url,
} from '../infrastructure/identity/secretHygiene';
import {
  authenticateWebAuthnPasskey,
  createSimulatedDemoPasskey,
  derEcdsaToP1363,
  detectWebAuthnSupport,
  extractSpkiFromAttestationObject,
  verifyWebAuthnAssertion,
} from '../infrastructure/identity/webAuthnService';
import { SalonRepository } from '../infrastructure/storage/salonRepository';
import { MemoryStorageAdapter } from '../infrastructure/storage/indexedDbAdapter';
import { CryptoCloudEngine } from '../simulation/cryptocloud';
import { DEFAULT_ANONYMOUS_SESSION, isIdentitySessionExpired, PasskeyCredentialRecord } from '../domain/identity';
import { buildContentSecurityPolicy } from '../infrastructure/security/csp';

/**
 * Helper to encode raw 64-byte IEEE P1363 ECDSA signature `(r || s)` into ASN.1 DER (`30 len 02 rLen r 02 sLen s`)
 * matching what hardware/browser FIDO2 authenticators emit inside `AuthenticatorAssertionResponse.signature`.
 */
function p1363ToDerEcdsa(p1363: Uint8Array): Uint8Array {
  const half = p1363.length / 2;
  const encodeInt = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    let slice = bytes.slice(start);
    if ((slice[0] & 0x80) !== 0) {
      const prefixed = new Uint8Array(slice.length + 1);
      prefixed[0] = 0x00;
      prefixed.set(slice, 1);
      slice = prefixed;
    }
    const out = new Uint8Array(2 + slice.length);
    out[0] = 0x02;
    out[1] = slice.length;
    out.set(slice, 2);
    return out;
  };
  const rDer = encodeInt(p1363.slice(0, half));
  const sDer = encodeInt(p1363.slice(half));
  const der = new Uint8Array(2 + rDer.length + sDer.length);
  der[0] = 0x30;
  der[1] = rDer.length + sDer.length;
  der.set(rDer, 2);
  der.set(sDer, 2 + rDer.length);
  return der;
}

describe('Stage 3 / Sprint 3.2 — WebAuthn Identity, Cryptographic Verification, Secret Hygiene & CSP', () => {
  it('round-trips arbitrary bytes cleanly through Base64URL and IEEE P1363 <-> DER ECDSA conversion', () => {
    const sample = new Uint8Array([0, 15, 62, 63, 128, 251, 255]);
    const encoded = toBase64Url(sample);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(Array.from(fromBase64Url(encoded))).toEqual(Array.from(sample));

    const fakeP1363 = new Uint8Array(64).fill(7);
    fakeP1363[0] = 0x80; // Triggers leading 0x00 sign-padding in ASN.1 DER
    const der = p1363ToDerEcdsa(fakeP1363);
    expect(Array.from(derEcdsaToP1363(der))).toEqual(Array.from(fakeP1363));
  });

  it('generates unique 32-byte cryptographic challenges via Web Crypto CSPRNG', () => {
    const c1 = generateCryptographicChallenge(32);
    const c2 = generateCryptographicChallenge(32);
    expect(c1.length).toBe(32);
    expect(c2.length).toBe(32);
    expect(toBase64Url(c1)).not.toBe(toBase64Url(c2));
  });

  it('flags expanded secret-like patterns (L-05: private_key, JWK d, apiKey, numeric password, Bearer, AKIA, PAT)', () => {
    const pemHeader = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');
    const fakePat = ['ghp_', 'TestDummyTokenValue9876543210'].join('');

    expect(detectSecretLikeFields(pemHeader).length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"private_key":"x"}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"kty":"EC","d":"SECRET"}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"apiKey":"sk-live-1"}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"password": 12345}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"auth":"Bearer eyJhbGciOi.payload.sig"}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"aws":"AKIA1234567890ABCDEF"}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields(fakePat).length).toBeGreaterThan(0);

    expect(() => assertNoSecretLikeFields({ private_key: '0x1234' })).toThrow(/Security policy violation/);
  });

  it('verifies ECDSA P-256 WebAuthn assertion (clientDataJSON, rpIdHash, UP flag, DER signature, signCount) and rejects tampering (L-04 / L-15)', async () => {
    const keyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const spkiBuf = await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const spkiBase64Url = toBase64Url(spkiBuf);

    const rpId = 'nailix.example';
    const expectedOrigin = 'https://nailix.example';
    const challengeBytes = generateCryptographicChallenge(32);
    const expectedChallengeBase64Url = toBase64Url(challengeBytes);

    const clientDataBytes = new TextEncoder().encode(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: expectedChallengeBase64Url,
        origin: expectedOrigin,
        crossOrigin: false,
      })
    );

    const rpIdHash = new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
    );
    const authData = new Uint8Array(37);
    authData.set(rpIdHash, 0);
    authData[32] = 0x05; // UP (0x01) + UV (0x04)
    new DataView(authData.buffer).setUint32(33, 42, false);

    const clientDataHash = new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', clientDataBytes)
    );
    const signedPayload = new Uint8Array(authData.length + clientDataHash.length);
    signedPayload.set(authData, 0);
    signedPayload.set(clientDataHash, authData.length);

    const rawSig = new Uint8Array(
      await globalThis.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keyPair.privateKey,
        signedPayload
      )
    );
    const derSig = p1363ToDerEcdsa(rawSig);

    const validResult = await verifyWebAuthnAssertion({
      response: {
        clientDataJSON: clientDataBytes,
        authenticatorData: authData,
        signature: derSig,
      },
      expectedChallengeBase64Url,
      expectedOrigin,
      expectedRpId: rpId,
      storedCredential: {
        publicKeySpkiBase64Url: spkiBase64Url,
        algorithm: -7,
        signCount: 10,
      },
    });

    expect(validResult.verification).toBe('signature_verified');
    expect(validResult.cryptographicSignatureVerified).toBe(true);
    expect(validResult.signCount).toBe(42);
    expect(validResult.userVerified).toBe(true);

    // Reject origin phishing mismatch
    await expect(
      verifyWebAuthnAssertion({
        response: { clientDataJSON: clientDataBytes, authenticatorData: authData, signature: derSig },
        expectedChallengeBase64Url,
        expectedOrigin: 'https://evil.example',
        expectedRpId: rpId,
        storedCredential: { publicKeySpkiBase64Url: spkiBase64Url, algorithm: -7, signCount: 10 },
      })
    ).rejects.toThrow(/origin mismatch/i);

    // Reject signCount downgrade (cloning defense)
    await expect(
      verifyWebAuthnAssertion({
        response: { clientDataJSON: clientDataBytes, authenticatorData: authData, signature: derSig },
        expectedChallengeBase64Url,
        expectedOrigin,
        expectedRpId: rpId,
        storedCredential: { publicKeySpkiBase64Url: spkiBase64Url, algorithm: -7, signCount: 99 },
      })
    ).rejects.toThrow(/signCount/i);

    // Reject tampered signature
    const badDer = new Uint8Array(derSig);
    badDer[badDer.length - 1] ^= 0xff;
    await expect(
      verifyWebAuthnAssertion({
        response: { clientDataJSON: clientDataBytes, authenticatorData: authData, signature: badDer },
        expectedChallengeBase64Url,
        expectedOrigin,
        expectedRpId: rpId,
        storedCredential: { publicKeySpkiBase64Url: spkiBase64Url, algorithm: -7, signCount: 10 },
      })
    ).rejects.toThrow(/cryptographic signature/i);
  });

  it('N-05 (W7 / W10 / W11-W12): enforces UV for master, BE flag for synced passkeys, and presence_only when SPKI missing', async () => {
    const keyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const spkiBase64Url = toBase64Url(
      await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey)
    );
    const rpId = 'nailix.example';
    const expectedOrigin = 'https://nailix.example';
    const expectedChallengeBase64Url = toBase64Url(generateCryptographicChallenge(32));
    const clientDataBytes = new TextEncoder().encode(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: expectedChallengeBase64Url,
        origin: expectedOrigin,
      })
    );
    const rpIdHash = new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId))
    );
    const cHash = new Uint8Array(
      await globalThis.crypto.subtle.digest('SHA-256', clientDataBytes)
    );

    const signWithFlags = async (flagsByte: number, counterVal: number) => {
      const authData = new Uint8Array(37);
      authData.set(rpIdHash, 0);
      authData[32] = flagsByte;
      new DataView(authData.buffer).setUint32(33, counterVal, false);
      const signedPayload = new Uint8Array(authData.length + cHash.length);
      signedPayload.set(authData, 0);
      signedPayload.set(cHash, authData.length);
      const rawSig = new Uint8Array(
        await globalThis.crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          keyPair.privateKey,
          signedPayload
        )
      );
      return { authData, derSig: p1363ToDerEcdsa(rawSig) };
    };

    // W7: assertion with UP only (0x01, no UV) must be rejected when UV is required for master
    const upOnly = await signWithFlags(0x01, 20);
    await expect(
      verifyWebAuthnAssertion({
        response: {
          clientDataJSON: clientDataBytes,
          authenticatorData: upOnly.authData,
          signature: upOnly.derSig,
        },
        expectedChallengeBase64Url,
        expectedOrigin,
        expectedRpId: rpId,
        requireUserVerification: true,
        storedCredential: {
          publicKeySpkiBase64Url: spkiBase64Url,
          algorithm: -7,
          signCount: 10,
          role: 'master',
        },
      })
    ).rejects.toThrow(/User Verification \(UV/i);

    // W10: with BE flag (0x08 | 0x04 | 0x01 = 0x0d), counter rollback is a warning, not a failure
    const syncedRollback = await signWithFlags(0x0d, 0);
    const syncedRes = await verifyWebAuthnAssertion({
      response: {
        clientDataJSON: clientDataBytes,
        authenticatorData: syncedRollback.authData,
        signature: syncedRollback.derSig,
      },
      expectedChallengeBase64Url,
      expectedOrigin,
      expectedRpId: rpId,
      storedCredential: {
        publicKeySpkiBase64Url: spkiBase64Url,
        algorithm: -7,
        signCount: 5,
        role: 'master',
      },
    });
    expect(syncedRes.verification).toBe('signature_verified');
    expect(syncedRes.backupEligible).toBe(true);
    expect(syncedRes.warnings.some(w => /non-monotonic signCount/i.test(w))).toBe(true);

    // W11/W12: without stored SPKI public key, result MUST be presence_only (never signature_verified)
    const noSpkiRes = await verifyWebAuthnAssertion({
      response: {
        clientDataJSON: clientDataBytes,
        authenticatorData: syncedRollback.authData,
        signature: new Uint8Array([9, 9, 9]),
      },
      expectedChallengeBase64Url,
      expectedOrigin,
      expectedRpId: rpId,
      storedCredential: undefined,
    });
    expect(noSpkiRes.verification).toBe('presence_only');
    expect(noSpkiRes.cryptographicSignatureVerified).toBe(false);
  });

  it('exercises navigator.credentials.get ceremony end-to-end with mocked browser authenticator (L-15)', async () => {
    const keyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const spkiBase64Url = toBase64Url(
      await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey)
    );
    const rawId = new Uint8Array([9, 8, 7, 6]);
    const credId = toBase64Url(rawId);

    const prevWindow = globalThis.window;
    const prevNavigator = globalThis.navigator;
    const prevPublicKeyCredential = (globalThis as Record<string, unknown>).PublicKeyCredential;

    try {
      const origin = 'https://nailix.local';
      const hostname = 'nailix.local';

      const mockCred: PasskeyCredentialRecord = {
        id: credId,
        rawIdBase64Url: credId,
        publicKeySpkiBase64Url: spkiBase64Url,
        displayName: 'Elena Test',
        role: 'master',
        rpId: hostname,
        algorithm: -7,
        signCount: 1,
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        transports: ['internal'],
        isSimulatedFallback: false,
      };

      const fakeNavigator = {
        credentials: {
          create: () => Promise.resolve(null),
          get: async (opts: CredentialRequestOptions) => {
            const pk = opts.publicKey!;
            const clientDataJSON = new TextEncoder().encode(
              JSON.stringify({
                type: 'webauthn.get',
                challenge: toBase64Url(pk.challenge as ArrayBuffer),
                origin,
              })
            );
            const rpIdHash = new Uint8Array(
              await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(hostname))
            );
            const authData = new Uint8Array(37);
            authData.set(rpIdHash, 0);
            authData[32] = 0x05;
            new DataView(authData.buffer).setUint32(33, 5, false);

            const cHash = new Uint8Array(
              await globalThis.crypto.subtle.digest('SHA-256', clientDataJSON)
            );
            const payload = new Uint8Array(authData.length + cHash.length);
            payload.set(authData, 0);
            payload.set(cHash, authData.length);

            const rawSig = new Uint8Array(
              await globalThis.crypto.subtle.sign(
                { name: 'ECDSA', hash: 'SHA-256' },
                keyPair.privateKey,
                payload
              )
            );
            return {
              id: credId,
              type: 'public-key',
              rawId: rawId.buffer,
              response: {
                clientDataJSON: clientDataJSON.buffer,
                authenticatorData: authData.buffer,
                signature: p1363ToDerEcdsa(rawSig).buffer,
              },
            } as unknown as Credential;
          },
        },
      };

      Object.defineProperty(globalThis, 'window', {
        value: {
          isSecureContext: true,
          location: { origin, hostname },
        },
        configurable: true,
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: fakeNavigator,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'PublicKeyCredential', {
        value: function MockPublicKeyCredential() {},
        configurable: true,
      });

      const res = await authenticateWebAuthnPasskey([mockCred]);
      expect(res.cryptographicSignatureVerified).toBe(true);
      expect(res.credential.signCount).toBe(5);
      expect(res.credential.id).toBe(credId);
    } finally {
      Object.defineProperty(globalThis, 'window', { value: prevWindow, configurable: true });
      Object.defineProperty(globalThis, 'navigator', { value: prevNavigator, configurable: true });
      if (prevPublicKeyCredential === undefined) {
        delete (globalThis as Record<string, unknown>).PublicKeyCredential;
      } else {
        Object.defineProperty(globalThis, 'PublicKeyCredential', {
          value: prevPublicKeyCredential,
          configurable: true,
        });
      }
    }
  });

  it('enforces domain language purity (L-18: nullable displayName) & session TTL expiry (L-04)', () => {
    expect(DEFAULT_ANONYMOUS_SESSION.displayName).toBeNull();
    expect(
      isIdentitySessionExpired({
        ...DEFAULT_ANONYMOUS_SESSION,
        authenticated: true,
        expiresAt: new Date(Date.now() - 10_000).toISOString(),
      })
    ).toBe(true);
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
    ).rejects.toThrow();

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
            origin: 'user',
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
    expect(() => assertNoSecretLikeFields(simCred)).not.toThrow();
  });

  it('builds strict production CSP without script unsafe-inline, external fonts, or wildcard origins (L-07, L-08, L-19)', () => {
    const prodCsp = buildContentSecurityPolicy('production');
    const directives = Object.fromEntries(
      prodCsp
        .split(';')
        .map(d => d.trim())
        .filter(Boolean)
        .map(d => {
          const [name, ...rest] = d.split(/\s+/);
          return [name, rest.join(' ')];
        })
    );

    expect(directives['default-src']).toBe("'self'");
    expect(directives['script-src']).toBe("'self'");
    expect(directives['script-src']).not.toContain("'unsafe-inline'");
    expect(directives['connect-src']).toBe("'self'");
    expect(directives['font-src']).toBe("'self' data:");
    expect(directives['img-src']).not.toMatch(/\bhttps:\b/);
    expect(directives['object-src']).toBe("'none'");

    const indexHtml = fs.readFileSync(
      path.resolve(import.meta.dirname, '..', '..', 'index.html'),
      'utf8'
    );
    expect(indexHtml).toContain('http-equiv="Content-Security-Policy"');
    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('user-scalable=no');
    expect(indexHtml).not.toContain('frame-ancestors');
  });

  it('N-05 (W11/W12): extracts SPKI from CBOR/COSE attestationObject when getPublicKey() is absent (EC2 P-256 & RSA)', async () => {
    const keyPair = await globalThis.crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const jwk = await globalThis.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const expectedSpki = toBase64Url(
      await globalThis.crypto.subtle.exportKey('spki', keyPair.publicKey)
    );
    const x = fromBase64Url(jwk.x!);
    const y = fromBase64Url(jwk.y!);

    // Build minimal CBOR COSE_Key map: { 1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y }
    const coseBytes = new Uint8Array([
      0xa5, // map(5)
      0x01, 0x02, // 1 -> 2
      0x03, 0x26, // 3 -> -7
      0x20, 0x01, // -1 -> 1
      0x21, 0x58, 0x20, ...x, // -2 -> bytes(32)
      0x22, 0x58, 0x20, ...y, // -3 -> bytes(32)
    ]);

    const credId = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]);
    const authData = new Uint8Array(55 + credId.length + coseBytes.length);
    authData[32] = 0x45; // UP | UV | AT
    authData[53] = 0x00;
    authData[54] = credId.length;
    authData.set(credId, 55);
    authData.set(coseBytes, 55 + credId.length);

    // CBOR attestationObject: { "fmt": "none", "authData": bstr(authData) }
    const header = new Uint8Array([
      0xa2, // map(2)
      0x63, 0x66, 0x6d, 0x74, // "fmt"
      0x64, 0x6e, 0x6f, 0x6e, 0x65, // "none"
      0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, // "authData"
      0x58, authData.length, // bstr(len <= 255)
    ]);
    const attestationObject = new Uint8Array(header.length + authData.length);
    attestationObject.set(header, 0);
    attestationObject.set(authData, header.length);

    const extracted = extractSpkiFromAttestationObject(attestationObject);
    expect(extracted).not.toBeNull();
    expect(extracted?.algorithm).toBe(-7);
    expect(extracted?.spkiBase64Url).toBe(expectedSpki);

    // Also verify RSA COSE_Key (kty = 3, alg = -257 RS256, -1 = n, -2 = e)
    const rsaN = new Uint8Array([0xc1, 0x02, 0x03, 0x04]);
    const rsaE = new Uint8Array([0x01, 0x00, 0x01]);
    const rsaCose = new Uint8Array([
      0xa4, // map(4)
      0x01, 0x03, // 1 -> 3 (RSA)
      0x03, 0x39, 0x01, 0x00, // 3 -> -257
      0x20, 0x44, ...rsaN, // -1 -> n
      0x21, 0x43, ...rsaE, // -2 -> e
    ]);
    const rsaAuthData = new Uint8Array(55 + credId.length + rsaCose.length);
    rsaAuthData[32] = 0x45;
    rsaAuthData[54] = credId.length;
    rsaAuthData.set(credId, 55);
    rsaAuthData.set(rsaCose, 55 + credId.length);
    const rsaHeader = new Uint8Array([
      0xa1,
      0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61,
      0x58, rsaAuthData.length,
    ]);
    const rsaAtt = new Uint8Array(rsaHeader.length + rsaAuthData.length);
    rsaAtt.set(rsaHeader, 0);
    rsaAtt.set(rsaAuthData, rsaHeader.length);

    const extractedRsa = extractSpkiFromAttestationObject(rsaAtt);
    expect(extractedRsa).not.toBeNull();
    expect(extractedRsa?.algorithm).toBe(-257);
    expect(typeof extractedRsa?.spkiBase64Url).toBe('string');

    // Non-map / truncated input fails gracefully with null
    expect(extractSpkiFromAttestationObject(new Uint8Array([0x01, 0x02]))).toBeNull();
  });
});
