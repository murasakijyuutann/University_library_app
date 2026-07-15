export type ReservationStatus =
  'QUEUED' | 'READY_FOR_PICKUP' | 'EXPIRED' | 'FULFILLED' | 'CANCELLED';

export interface Reservation {
  readonly id: bigint;
  readonly resourceId: bigint;
  readonly memberId: bigint;
  readonly queuePosition: number;
  readonly status: ReservationStatus;
  readonly queuedAt: Date;
  readonly readyAt: Date | null;
  readonly expiresAt: Date | null;
}
