import { Loan } from '@prisma/client';

export interface LoanResponse {
  readonly id: string;
  readonly copyId: string;
  readonly memberId: string;
  readonly status: string;
  readonly renewalCount: number;
  readonly borrowedAt: string;
  readonly dueAt: string;
  readonly returnedAt: string | null;
}

export function toLoanResponse(loan: Loan): LoanResponse {
  return {
    id: loan.id.toString(),
    copyId: loan.copyId.toString(),
    memberId: loan.memberId.toString(),
    status: loan.status,
    renewalCount: loan.renewalCount,
    borrowedAt: loan.borrowedAt.toISOString(),
    dueAt: loan.dueAt.toISOString(),
    returnedAt: loan.returnedAt ? loan.returnedAt.toISOString() : null,
  };
}
