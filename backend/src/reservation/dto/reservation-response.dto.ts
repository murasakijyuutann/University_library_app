import { Reservation } from '@prisma/client';

export interface ReservationResponse {
  readonly id: string;
  readonly resourceId: string;
  readonly memberId: string;
  readonly queuePosition: number;
  readonly status: string;
  readonly queuedAt: string;
  readonly readyAt: string | null;
  readonly expiresAt: string | null;
}

export function toReservationResponse(reservation: Reservation): ReservationResponse {
  return {
    id: reservation.id.toString(),
    resourceId: reservation.resourceId.toString(),
    memberId: reservation.memberId.toString(),
    queuePosition: reservation.queuePosition,
    status: reservation.status,
    queuedAt: reservation.queuedAt.toISOString(),
    readyAt: reservation.readyAt ? reservation.readyAt.toISOString() : null,
    expiresAt: reservation.expiresAt ? reservation.expiresAt.toISOString() : null,
  };
}
