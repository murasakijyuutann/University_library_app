import { AccessStatus } from './access-status.types';

/**
 * What AccessPolicyResolver returns for a (member, resource) pair (build-guide.md
 * Phase 3.1). `allowed` is the actual per-member decision; `status` is the
 * access-contract category the decision falls under — the two are separate
 * because a category (e.g. LICENSE_GATED) can resolve to either outcome
 * depending on the member (their faculty is or isn't covered).
 */
export interface AccessDecision {
  readonly allowed: boolean;
  readonly status: AccessStatus;
  readonly reason: string;
}
