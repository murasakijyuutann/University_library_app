export const LOAN_OVERDUE_EVENT = 'loan.overdue';
export const RESERVATION_READY_EVENT = 'reservation.ready';
export const EMBARGO_LIFTED_EVENT = 'thesis.embargo_lifted';

export interface LoanOverdueEvent {
  loanId: bigint;
  memberId: bigint;
  dueAt: Date;
}

export interface ReservationReadyEvent {
  reservationId: bigint;
  memberId: bigint;
  resourceId: bigint;
}

export interface EmbargoLiftedEvent {
  submissionId: bigint;
  memberId: bigint;
}
