import { SetMetadata } from '@nestjs/common';

export const AUDITED_KEY = 'audited_transition';

export interface AuditedMeta {
  /** Logical aggregate name written to audit_log_entry.entityType. */
  entityType: string;
  /** Verb written to audit_log_entry.action (e.g. RETURN, TRANSITION, ENQUEUE). */
  action: string;
  /**
   * Derive the audited entity id from the handler's return value.
   * Controllers that return DTOs with string ids should parse here.
   */
  entityId: (result: unknown) => bigint;
  oldValue?: (result: unknown) => unknown;
  newValue?: (result: unknown) => unknown;
}

/**
 * Marks a controller handler so {@link AuditInterceptor} writes an
 * `audit_log_entry` after a successful response. Only transitions that pass
 * through decorated handlers are captured — see docs/audit-coverage.md.
 */
export const Audited = (meta: AuditedMeta) => SetMetadata(AUDITED_KEY, meta);
