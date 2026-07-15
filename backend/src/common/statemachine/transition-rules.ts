import { LoanStatus } from '../../loan/entity/loan.types';
import { ReservationStatus } from '../../reservation/entity/reservation.types';

/**
 * Plain TS mirrors of the ThesisSubmission/IllRequest Prisma enums, kept here
 * (rather than imported from a not-yet-built thesis/ill entity file) since
 * this is the one place all four state machines' vocabularies need to be
 * visible together. Kept in sync with prisma/schema.prisma by hand.
 */
export type SubmissionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EMBARGOED'
  | 'PUBLISHED';

export type IllRequestStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'REQUESTED_EXTERNALLY'
  | 'FULFILLED'
  | 'DELIVERED'
  | 'RETURN_DUE'
  | 'RETURNED'
  | 'CANCELLED';

export type TransitionMap<S extends string> = ReadonlyMap<S, ReadonlySet<S>>;

function transitionMap<S extends string>(
  entries: ReadonlyArray<[S, readonly S[]]>,
): TransitionMap<S> {
  return new Map(entries.map(([from, targets]) => [from, new Set(targets)]));
}

/**
 * The legal-transition map per state machine (build-guide.md Phase 3.2;
 * project-structure_v3.md §2.13) — declared as data, not scattered `if`
 * chains, mirroring what AccessPolicyResolver does for access. A terminal
 * state (RETURNED, LOST, EXPIRED, FULFILLED, CANCELLED, REJECTED, PUBLISHED)
 * maps to an empty set: no outgoing transitions are legal.
 *
 * Full state-diagram elaboration is still deferred (build-guide.md §5), but
 * the *home* for transition legality is not — this is that home.
 */
export const LOAN_TRANSITIONS: TransitionMap<LoanStatus> =
  transitionMap<LoanStatus>([
    ['ACTIVE', ['RETURNED', 'OVERDUE', 'LOST']],
    ['OVERDUE', ['RETURNED', 'LOST']],
    ['RETURNED', []],
    ['LOST', []],
  ]);

export const RESERVATION_TRANSITIONS: TransitionMap<ReservationStatus> =
  transitionMap<ReservationStatus>([
    ['QUEUED', ['READY_FOR_PICKUP', 'CANCELLED']],
    ['READY_FOR_PICKUP', ['FULFILLED', 'EXPIRED', 'CANCELLED']],
    ['EXPIRED', []],
    ['FULFILLED', []],
    ['CANCELLED', []],
  ]);

export const SUBMISSION_TRANSITIONS: TransitionMap<SubmissionStatus> =
  transitionMap<SubmissionStatus>([
    ['DRAFT', ['SUBMITTED']],
    ['SUBMITTED', ['UNDER_REVIEW']],
    ['UNDER_REVIEW', ['APPROVED', 'REJECTED']],
    ['APPROVED', ['EMBARGOED', 'PUBLISHED']],
    ['EMBARGOED', ['PUBLISHED']],
    ['REJECTED', []],
    ['PUBLISHED', []],
  ]);

export const ILL_REQUEST_TRANSITIONS: TransitionMap<IllRequestStatus> =
  transitionMap<IllRequestStatus>([
    ['SUBMITTED', ['UNDER_REVIEW', 'CANCELLED']],
    ['UNDER_REVIEW', ['REQUESTED_EXTERNALLY', 'CANCELLED']],
    ['REQUESTED_EXTERNALLY', ['FULFILLED', 'CANCELLED']],
    ['FULFILLED', ['DELIVERED']],
    ['DELIVERED', ['RETURN_DUE']],
    ['RETURN_DUE', ['RETURNED']],
    ['RETURNED', []],
    ['CANCELLED', []],
  ]);
