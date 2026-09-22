import { BadRequestException, Injectable } from '@nestjs/common';
import { MemberType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../../common/exception/entity-not-found.exception';
import { LoanPolicyService } from './loan-policy.service';

/**
 * Fine amounts come from `loan_policy` (Phase 7.3) — never hardcoded rates.
 * Creates `Fine` rows (member-owned account charges) using policy parameters.
 */
@Injectable()
export class FineCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loanPolicyService: LoanPolicyService,
  ) {}

  async calculateOverdueFine(
    loanId: bigint,
    memberType: MemberType,
    asOf: Date = new Date(),
  ): Promise<{ amount: Prisma.Decimal; daysCharged: number }> {
    const loan = await this.prisma.loan.findUnique({ where: { id: loanId } });
    if (!loan) {
      throw new EntityNotFoundException('Loan', loanId);
    }
    if (loan.returnedAt) {
      throw new BadRequestException(
        'Returned loans are not fined via overdue calculation.',
      );
    }

    const policy = await this.loanPolicyService.requireByMemberType(memberType);
    const msPerDay = 24 * 60 * 60 * 1000;
    const rawDays = Math.floor(
      (asOf.getTime() - loan.dueAt.getTime()) / msPerDay,
    );
    const daysCharged = Math.max(0, rawDays - policy.gracePeriodDays);
    if (daysCharged === 0) {
      return { amount: new Prisma.Decimal(0), daysCharged: 0 };
    }

    let amount = policy.finePerDay.mul(daysCharged);
    if (policy.maxFine !== null && amount.greaterThan(policy.maxFine)) {
      amount = policy.maxFine;
    }
    return { amount, daysCharged };
  }

  async createOverdueFine(
    loanId: bigint,
    memberId: bigint,
    memberType: MemberType,
    asOf: Date = new Date(),
  ) {
    const { amount, daysCharged } = await this.calculateOverdueFine(
      loanId,
      memberType,
      asOf,
    );
    if (daysCharged === 0 || amount.equals(0)) {
      return null;
    }
    return this.prisma.fine.create({
      data: {
        memberId,
        loanId,
        amount,
        reason: `Overdue ${daysCharged} day(s)`,
      },
    });
  }
}
