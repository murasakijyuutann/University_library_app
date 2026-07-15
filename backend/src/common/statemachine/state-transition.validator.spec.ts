import { StateTransitionValidator } from './state-transition.validator';
import {
  ILL_REQUEST_TRANSITIONS,
  LOAN_TRANSITIONS,
  RESERVATION_TRANSITIONS,
  SUBMISSION_TRANSITIONS,
} from './transition-rules';
import { InvalidStateTransitionException } from '../exception/invalid-state-transition.exception';
import type { IllRequestStatus, SubmissionStatus } from './transition-rules';

// Phase 3.2 (build-guide.md) — pure unit tests (no database needed): every
// legal transition passes, and a representative set of illegal ones (skipping
// a step, or moving out of a terminal state) are rejected.
describe('StateTransitionValidator (Phase 3.2)', () => {
  const validator = new StateTransitionValidator();

  describe('Loan', () => {
    it('allows every legal transition', () => {
      expect(() =>
        validator.assertLegal('Loan', LOAN_TRANSITIONS, 'ACTIVE', 'RETURNED'),
      ).not.toThrow();
      expect(() =>
        validator.assertLegal('Loan', LOAN_TRANSITIONS, 'ACTIVE', 'OVERDUE'),
      ).not.toThrow();
      expect(() =>
        validator.assertLegal('Loan', LOAN_TRANSITIONS, 'OVERDUE', 'RETURNED'),
      ).not.toThrow();
    });

    it('rejects transitions out of a terminal state', () => {
      expect(() =>
        validator.assertLegal('Loan', LOAN_TRANSITIONS, 'RETURNED', 'ACTIVE'),
      ).toThrow(InvalidStateTransitionException);
      expect(() =>
        validator.assertLegal('Loan', LOAN_TRANSITIONS, 'LOST', 'RETURNED'),
      ).toThrow(InvalidStateTransitionException);
    });
  });

  describe('Reservation', () => {
    it('allows the happy path QUEUED -> READY_FOR_PICKUP -> FULFILLED', () => {
      expect(() =>
        validator.assertLegal(
          'Reservation',
          RESERVATION_TRANSITIONS,
          'QUEUED',
          'READY_FOR_PICKUP',
        ),
      ).not.toThrow();
      expect(() =>
        validator.assertLegal(
          'Reservation',
          RESERVATION_TRANSITIONS,
          'READY_FOR_PICKUP',
          'FULFILLED',
        ),
      ).not.toThrow();
    });

    it('rejects skipping READY_FOR_PICKUP: QUEUED -> FULFILLED', () => {
      expect(() =>
        validator.assertLegal(
          'Reservation',
          RESERVATION_TRANSITIONS,
          'QUEUED',
          'FULFILLED',
        ),
      ).toThrow(InvalidStateTransitionException);
    });

    it('rejects any transition out of a terminal state', () => {
      expect(() =>
        validator.assertLegal(
          'Reservation',
          RESERVATION_TRANSITIONS,
          'CANCELLED',
          'QUEUED',
        ),
      ).toThrow(InvalidStateTransitionException);
    });
  });

  describe('ThesisSubmission', () => {
    it('allows the full happy path', () => {
      const path: Array<[SubmissionStatus, SubmissionStatus]> = [
        ['DRAFT', 'SUBMITTED'],
        ['SUBMITTED', 'UNDER_REVIEW'],
        ['UNDER_REVIEW', 'APPROVED'],
        ['APPROVED', 'EMBARGOED'],
        ['EMBARGOED', 'PUBLISHED'],
      ];
      for (const [from, to] of path) {
        expect(() =>
          validator.assertLegal(
            'ThesisSubmission',
            SUBMISSION_TRANSITIONS,
            from,
            to,
          ),
        ).not.toThrow();
      }
    });

    it('rejects DRAFT -> PUBLISHED, skipping the whole review chain', () => {
      expect(() =>
        validator.assertLegal(
          'ThesisSubmission',
          SUBMISSION_TRANSITIONS,
          'DRAFT',
          'PUBLISHED',
        ),
      ).toThrow(InvalidStateTransitionException);
    });

    it('rejects transitioning out of REJECTED', () => {
      expect(() =>
        validator.assertLegal(
          'ThesisSubmission',
          SUBMISSION_TRANSITIONS,
          'REJECTED',
          'DRAFT',
        ),
      ).toThrow(InvalidStateTransitionException);
    });
  });

  describe('IllRequest', () => {
    it('allows the full happy path', () => {
      const path: Array<[IllRequestStatus, IllRequestStatus]> = [
        ['SUBMITTED', 'UNDER_REVIEW'],
        ['UNDER_REVIEW', 'REQUESTED_EXTERNALLY'],
        ['REQUESTED_EXTERNALLY', 'FULFILLED'],
        ['FULFILLED', 'DELIVERED'],
        ['DELIVERED', 'RETURN_DUE'],
        ['RETURN_DUE', 'RETURNED'],
      ];
      for (const [from, to] of path) {
        expect(() =>
          validator.assertLegal(
            'IllRequest',
            ILL_REQUEST_TRANSITIONS,
            from,
            to,
          ),
        ).not.toThrow();
      }
    });

    it('rejects FULFILLED -> RETURN_DUE, skipping DELIVERED', () => {
      expect(() =>
        validator.assertLegal(
          'IllRequest',
          ILL_REQUEST_TRANSITIONS,
          'FULFILLED',
          'RETURN_DUE',
        ),
      ).toThrow(InvalidStateTransitionException);
    });
  });

  describe('isLegal (non-throwing check)', () => {
    it('returns true/false without throwing', () => {
      expect(validator.isLegal(LOAN_TRANSITIONS, 'ACTIVE', 'RETURNED')).toBe(
        true,
      );
      expect(validator.isLegal(LOAN_TRANSITIONS, 'RETURNED', 'ACTIVE')).toBe(
        false,
      );
    });
  });
});
