import { ConflictException } from '@nestjs/common';

/**
 * A placeholder-but-real exception for illegal state moves surfaced before the
 * full StateTransitionValidator lands (build-guide.md Phase 3.2). Used now
 * where LoanService needs to reject an already-returned loan; Phase 3 will
 * route this through the generic transition-rules map instead of an ad hoc
 * check, without changing this exception's shape.
 */
export class InvalidStateTransitionException extends ConflictException {
  constructor(entityType: string, from: string, to: string) {
    super(`${entityType} cannot transition from ${from} to ${to}.`);
  }
}
