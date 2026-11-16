// =============================================================================
// Manifest Law 8 & Sprint 3.2 Honesty Watchdog Scanner (L-09)
// Extracted into src/test-utils so the scanner itself can be meta-tested.
// =============================================================================

export interface ForbiddenPattern {
  label: string;
  regex: RegExp;
}

export const FORBIDDEN_HONESTY_PATTERNS: ForbiddenPattern[] = [
  { label: 'on-chain', regex: /\bon-chain\b/i },
  { label: 'blockchain', regex: /\bblockchain\b/i },
  { label: 'escrow', regex: /\bescrow\b/i },
  { label: 'эскроу', regex: /эскроу/i },
  { label: 'P2P', regex: /\bP2P\b/ },
  { label: 'verified', regex: /\bverified\b/i },
  { label: 'E2E', regex: /\bE2E\b/ },
  { label: 'end-to-end encrypt', regex: /end-to-end\s+encrypt/i },
  { label: 'encrypt*', regex: /\bencrypt(?:ed|ing|ion)\b/i },
  { label: 'smart contract', regex: /smart[\s-]+contract/i },
  { label: 'smart escrow', regex: /smart[\s-]+escrow/i },
  { label: 'immutable', regex: /\bimmutable\b/i },
  { label: 'zero-knowledge', regex: /zero[\s-]+knowledge/i },
  { label: 'AES-256', regex: /AES[\s-]?256/i },
  { label: 'decentralized', regex: /\bdecentraliz\w*/i },
  { label: 'децентрализ*', regex: /децентрализ[а-яё]*/i },
  { label: 'смарт-контракт*', regex: /смарт[\s-]+контракт[а-яё]*/i },
  { label: 'блокчейн*', regex: /блокчейн[а-яё]*/i },
  { label: 'шифрован*', regex: /(?<!не|не\s)шифрован[а-яё]*/i },
  { label: '智能合约', regex: /智能合约/ },
  { label: '去中心化', regex: /去中心化/ },
  { label: '区块链', regex: /区块链/ },
  { label: '加密', regex: /(?<!非|无)加密/ },
  { label: '暗号化', regex: /暗号化/ },
  { label: '分散型', regex: /分散型/ },
  { label: 'ブロックチェーン', regex: /ブロックチェーン/ },
  { label: 'verschlüsselt', regex: /verschlüsselt/i },
  { label: 'dezentral', regex: /\bdezentral\w*/i },
  { label: 'descentraliz', regex: /\bdescentraliz\w*/i },
  { label: 'cifrad*', regex: /\bcifrad[oa]\w*/i },
  { label: 'chiffré*', regex: /\bchiffr[ée]\w*/i },
];

// Explicit internal TypeScript field/method identifiers from Stage 1 types that are NOT user-facing copy.
const INTERNAL_CODE_SYMBOL_ALLOWLIST: RegExp[] = [
  /\bsmartContractEscrow\b/g,
  /\bcreateVerifiedReviewBlock\b/g,
  /\bverifiedInPerson\b/g,
  /\bverifiedBookingTx\b/g,
  /\bverifiedTier\b/g,
  /\bescrowTxHash\b/g,
  /\bescrow_locked\b/g,
  /\bonReleaseEscrow\b/g,
  /\bhandleReleaseEscrow\b/g,
  /\bescrowHash\b/g,
  /\bescrowLockedCount\b/g,
  /\bcryptographicSignatureVerified\b/g,
  /\buserVerified\b/g,
  /\bassertVerified\b/g,
  /\bverified:\s*(?:boolean|true|false)\b/g,
  /\bverified:\b/g,
  /\buser\.verified\b/g,
  // Explicitly negative prose statements ("no/not/zero ..."):
  /\bwithout\s+encryption\b/gi,
  /\bnot\s+encrypted\b/gi,
  /\bno\s+encryption\b/gi,
  /\bwithout\s+escrow\b/gi,
  /\bno\s+blockchain\b/gi,
  /\bno\s+P2P\b/gi,
  /\bNOT\s+a\s+real\s+P2P\b/gi,
  /type:\s*'sms'\s*\|\s*'push'\s*\|\s*'blockchain'\s*\|\s*'p2p'/g,
  /\bnon-blockchain\b/gi,
  /\bне\s+шифру[а-яё]+\b/gi,
  /\bбез\s+шифрования\b/gi,
  /\bбез\s+блокчейна\b/gi,
  /\bбез\s+эскроу\b/gi,
];

/**
 * Scans lines for unbadged production claims (missing explicit `[SIM]` / `SIMULATED` marker).
 */
export function findHonestyViolations(lines: string[], fileLabel = '<snippet>'): string[] {
  const violations: string[] = [];

  lines.forEach((line, idx) => {
    // Explicit simulation marker exempts [SIM]-badged UI labels and SIMULATED file headers.
    if (/\[SIM\]|SIMULATED|\[DEMO\]|DemoOnly/i.test(line)) {
      return;
    }

    let checkTarget = line;
    for (const allowed of INTERNAL_CODE_SYMBOL_ALLOWLIST) {
      checkTarget = checkTarget.replace(allowed, '');
    }

    for (const { label, regex } of FORBIDDEN_HONESTY_PATTERNS) {
      if (regex.test(checkTarget)) {
        violations.push(`${fileLabel}:${idx + 1} [${label}] -> ${line.trim()}`);
      }
    }
  });

  return violations;
}
