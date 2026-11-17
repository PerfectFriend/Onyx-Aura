// =============================================================================
// Stage 4 · Sprint 4.3 — PII-Free Server Security Audit Logger
// - Records bounded non-PII authentication & payment lifecycle events in memory
//   and emits structured single-line logs in runtime without exposing emails,
//   phones, session tokens, signatures, or secret keys.
// =============================================================================

export type ServerSecurityEventType =
  | 'auth.challenge.issued'
  | 'auth.register.ok'
  | 'auth.register.rejected'
  | 'auth.verify.spki_ok'
  | 'auth.verify.spki_rejected'
  | 'auth.verify.stub_fallback'
  | 'auth.verify.downgrade_blocked'
  | 'auth.session.revoked'
  | 'payments.checkout.created'
  | 'payments.checkout.rejected'
  | 'payments.webhook.processed'
  | 'payments.webhook.duplicate'
  | 'payments.webhook.rejected';

export interface ServerSecurityAuditEntry {
  timestamp: string;
  event: ServerSecurityEventType;
  outcome: 'ok' | 'rejected' | 'fallback';
  detail?: string;
}

const MAX_AUDIT_ENTRIES = 200;

export class ServerSecurityAuditLog {
  private readonly entries: ServerSecurityAuditEntry[] = [];

  public record(
    event: ServerSecurityEventType,
    outcome: 'ok' | 'rejected' | 'fallback',
    detail?: string
  ): void {
    const sanitizedDetail = detail ? detail.slice(0, 120).replace(/[\r\n]+/g, ' ') : undefined;
    const entry: ServerSecurityAuditEntry = {
      timestamp: new Date().toISOString(),
      event,
      outcome,
      ...(sanitizedDetail ? { detail: sanitizedDetail } : {}),
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_AUDIT_ENTRIES) {
      this.entries.shift();
    }
  }

  public getSummary(): {
    totalRecorded: number;
    recentRejectedCount: number;
    lastEvent?: ServerSecurityAuditEntry;
  } {
    const recentRejectedCount = this.entries.filter(e => e.outcome === 'rejected').length;
    return {
      totalRecorded: this.entries.length,
      recentRejectedCount,
      lastEvent: this.entries.length > 0 ? this.entries[this.entries.length - 1] : undefined,
    };
  }

  public listRecent(limit: number = 25): ServerSecurityAuditEntry[] {
    return this.entries.slice(-Math.max(1, limit));
  }
}
