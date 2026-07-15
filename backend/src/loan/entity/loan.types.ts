/**
 * Plain TS mirrors of the Prisma-generated Loan/Reservation enums, kept for
 * consumers that shouldn't import generated Prisma types directly (mirrors the
 * approach in resource/entity/copy-status.types.ts). Kept in sync with
 * prisma/schema.prisma by hand.
 */
export type LoanStatus = 'ACTIVE' | 'RETURNED' | 'OVERDUE' | 'LOST';

export interface Loan {
  readonly id: bigint;
  readonly copyId: bigint;
  readonly memberId: bigint;
  readonly status: LoanStatus;
  readonly renewalCount: number;
  readonly borrowedAt: Date;
  readonly dueAt: Date;
  readonly returnedAt: Date | null;
}
