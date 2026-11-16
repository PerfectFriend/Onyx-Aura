import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { findHonestyViolations } from '../test-utils/honesty';

/**
 * Honesty Watchdog (Manifest Law 8 & Sprint 3.2 L-09 / L-10):
 * - Scans src/**, index.html, metadata.json, vite.config.ts, README.md, and docs/REALITY_MAP.md.
 * - Requires explicit `[SIM]` / `SIMULATED` markers for any simulated ledger, escrow, P2P, or encryption copy.
 * - Includes meta-test proving the guard actively rejects planted unbadged claims.
 */

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

function collectTargetFiles(): string[] {
  const results: string[] = [
    path.join(PROJECT_ROOT, 'index.html'),
    path.join(PROJECT_ROOT, 'metadata.json'),
    path.join(PROJECT_ROOT, 'vite.config.ts'),
    path.join(PROJECT_ROOT, 'README.md'),
    path.join(PROJECT_ROOT, 'docs', 'REALITY_MAP.md'),
  ];

  const srcDir = path.join(PROJECT_ROOT, 'src');
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'test-utils' || entry.name === 'node_modules') {
          continue;
        }
        walk(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  walk(srcDir);
  return results;
}

describe('Manifest Law 8 — Honesty Watchdog (K-02 / L-09 / L-10)', () => {
  it('meta-test: catches planted unbadged claims and permits explicit [SIM] badges (L-09)', () => {
    expect(findHonestyViolations(['<span>Public P2P</span>'])).not.toEqual([]);
    expect(findHonestyViolations(['<span>Escrow Locked</span>'])).not.toEqual([]);
    expect(findHonestyViolations(['<span>Verified Guild Supplier</span>'])).not.toEqual([]);
    expect(findHonestyViolations(['<span>Public P2P [SIM]</span>'])).toEqual([]);
    expect(findHonestyViolations(['<span>Deposit Hold [SIM]</span>'])).toEqual([]);
  });

  it('contains zero unbadged blockchain / escrow / P2P / E2E / verified promises across src, config, README, and REALITY_MAP', () => {
    const violations: string[] = [];
    const files = collectTargetFiles();

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      const rel = path.relative(PROJECT_ROOT, filePath);
      const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
      violations.push(...findHonestyViolations(lines, rel));
    }

    expect(violations).toEqual([]);
  });

  it('keeps public/, repo, and android-build/ free of stale bundles, keystore, and hardcoded passwords (K-01 / L-10 / L-16)', () => {
    const publicApk = path.join(PROJECT_ROOT, 'public', 'nailix.apk');
    const keystorePath = path.join(PROJECT_ROOT, 'android-build', 'nailix-release.keystore');
    const staleWwwBundleDir = path.join(PROJECT_ROOT, 'android-build', 'assets', 'www');

    expect(fs.existsSync(publicApk)).toBe(false);
    expect(fs.existsSync(keystorePath)).toBe(false);
    expect(fs.existsSync(staleWwwBundleDir)).toBe(false);

    const buildScript = fs.readFileSync(path.join(PROJECT_ROOT, 'scripts', 'build-apk.sh'), 'utf8');
    expect(buildScript).not.toContain('nailix123');
    expect(buildScript).not.toContain('--ks-pass "pass:');
    expect(buildScript).toContain('--ks-pass env:NAILIX_KEYSTORE_PASS');
    expect(buildScript).toContain('Refusing to auto-generate a throwaway release key');
    expect(buildScript).toContain('dist-apk');
  });
});
