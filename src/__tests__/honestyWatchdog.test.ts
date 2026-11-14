import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Honesty Watchdog (Law 8 & Sprint 1.5 K-02 / K-16):
 * Fails if any source file, index.html, metadata.json, or vite.config.ts
 * makes unbadged production claims for capabilities that are not yet implemented
 * (e.g. on-chain, E2E encryption, smart contract, immutable, zero-knowledge, AES-256,
 * or decentralized architecture) on a line without `[SIM]` or `SIMULATED`.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

function collectTargetFiles(): string[] {
  const results: string[] = [
    path.join(PROJECT_ROOT, 'index.html'),
    path.join(PROJECT_ROOT, 'metadata.json'),
    path.join(PROJECT_ROOT, 'vite.config.ts'),
  ];

  const srcDir = path.join(PROJECT_ROOT, 'src');
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  walk(srcDir);
  return results;
}

const FORBIDDEN_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'on-chain', regex: /\bon-chain\b/i },
  { label: 'E2E', regex: /\bE2E\b/ },
  { label: 'end-to-end encrypted', regex: /end-to-end\s+encrypt/i },
  { label: 'smart contract', regex: /smart[\s-]+contract/i },
  { label: 'smart escrow', regex: /smart[\s-]+escrow/i },
  { label: 'immutable', regex: /\bimmutable\b/i },
  { label: 'zero-knowledge', regex: /zero[\s-]+knowledge/i },
  { label: 'AES-256', regex: /AES[\s-]?256/i },
  { label: 'decentralized', regex: /\bdecentraliz\w*/i },
  { label: 'децентрализ*', regex: /децентрализ[а-яё]*/i },
  { label: 'смарт-контракт*', regex: /смарт[\s-]+контракт[а-яё]*/i },
  { label: 'блокчейн*', regex: /блокчейн[а-яё]*/i },
  { label: 'шифрован*', regex: /(?<!не)шифрован[а-яё]*/i },
  { label: '智能合约', regex: /智能合约/ },
  { label: '去中心化', regex: /去中心化/ },
  { label: '暗号化', regex: /暗号化/ },
  { label: '分散型', regex: /分散型/ },
  { label: 'verschlüsselt', regex: /verschlüsselt/i },
  { label: 'dezentral', regex: /\bdezentral\w*/i },
  { label: 'descentraliz', regex: /\bdescentraliz\w*/i },
];

describe('Manifest Law 8 — Honesty Watchdog (K-02)', () => {
  it('contains zero unbadged blockchain / E2E / smart-contract / decentralized promises across app source and config', () => {
    const violations: string[] = [];
    const files = collectTargetFiles();

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      const rel = path.relative(PROJECT_ROOT, filePath);
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

      lines.forEach((line, idx) => {
        // Explicit simulation markers exempt technical comments or [SIM]-labeled copy
        if (/\[SIM\]|SIMULATED|NOT real|NOT production|planned for Stage|запланирован|до Этапа/i.test(line)) {
          return;
        }
        // Skip internal type identifier names / code identifiers that don't render copy?
        // Actually code comments and identifiers should also stay clean unless marked [SIM].
        // Allow TS interface key `smartContractEscrow:` itself (key name), check only the string value if any.
        const checkTarget = line.replace(/\bsmartContractEscrow\b/, '').replace(/\bcreateVerifiedReviewBlock\b/, '');

        for (const { label, regex } of FORBIDDEN_PATTERNS) {
          if (regex.test(checkTarget)) {
            violations.push(`${rel}:${idx + 1} [${label}] -> ${line.trim()}`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('keeps public/ free of binary .apk artifacts and scripts/build-apk.sh free of hardcoded passwords (K-01)', () => {
    const publicApk = path.join(PROJECT_ROOT, 'public', 'nailix.apk');
    const keystorePath = path.join(PROJECT_ROOT, 'android-build', 'nailix-release.keystore');
    expect(fs.existsSync(publicApk)).toBe(false);
    expect(fs.existsSync(keystorePath)).toBe(false);

    const buildScript = fs.readFileSync(path.join(PROJECT_ROOT, 'scripts', 'build-apk.sh'), 'utf8');
    expect(buildScript).not.toContain('nailix123');
    expect(buildScript).toContain('NAILIX_KEYSTORE_PASS');
    expect(buildScript).toContain('dist-apk');
  });
});
