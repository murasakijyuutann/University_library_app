import { Matches } from 'class-validator';

export class EnqueueReservationRequestDto {
  /** A Resource id (the title being held, not a specific copy) — numeric string. */
  @Matches(/^\d+$/, { message: 'resourceId must be a numeric string.' })
  resourceId!: string;
}
