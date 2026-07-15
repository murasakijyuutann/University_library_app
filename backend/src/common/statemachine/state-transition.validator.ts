import { Injectable } from '@nestjs/common';
import { InvalidStateTransitionException } from '../exception/invalid-state-transition.exception';
import { TransitionMap } from './transition-rules';

/**
 * Does for transition legality what AccessPolicyResolver does for access
 * (build-guide.md Phase 3.2; project-structure_v3.md §2.13): one owner for
 * "is this state move legal," consulted by every entity service at its
 * transition points, instead of duplicated `if` chains across
 * LoanService/ReservationQueueService/ThesisSubmissionService/IllRequestService.
 */
@Injectable()
export class StateTransitionValidator {
  /** Throws InvalidStateTransitionException if `from -> to` is not in `transitions`. */
  assertLegal<S extends string>(
    entityType: string,
    transitions: TransitionMap<S>,
    from: S,
    to: S,
  ): void {
    if (!this.isLegal(transitions, from, to)) {
      throw new InvalidStateTransitionException(entityType, from, to);
    }
  }

  isLegal<S extends string>(
    transitions: TransitionMap<S>,
    from: S,
    to: S,
  ): boolean {
    return transitions.get(from)?.has(to) ?? false;
  }
}
