import { BadRequestException, Injectable } from '@nestjs/common';
import { CopyStatus, LoanStatus, MemberType, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConcurrentModificationException } from '../../common/exception/concurrent-modification.exception';
import { EntityNotFoundException } from '../../common/exception/entity-not-found.exception';
import { NoAvailableCopyException } from '../../common/exception/no-available-copy.exception';
import { StateTransitionValidator } from '../../common/statemachine/state-transition.validator';
import { LOAN_TRANSITIONS } from '../../common/statemachine/transition-rules';
import { LoanPolicyService } from './loan-policy.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LOAN_OVERDUE_EVENT, LoanOverdueEvent } from '../../notification/events';

/** The one row `borrowCopy`'s raw `SELECT ... FOR UPDATE` needs to decide with. */
interface LockedCopyRow {
  id: bigint;
  version: bigint;
}

/**
 * Owns the concurrency-critical paths of the physical-book lifecycle
 * (build-guide.md Phase 2 / 7.3). Renewal consults `loan_policy` and blocks
 * when another member holds an active reservation on the same resource.
 */
@Injectable()
export class LoanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateTransitionValidator: StateTransitionValidator,
    private readonly loanPolicyService: LoanPolicyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async borrowCopy(bookId: bigint, memberId: bigint, dueAt: Date) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedCopyRow[]>`
        SELECT "id", "version"
        FROM "resource_copy"
        WHERE "bookId" = ${bookId} AND "status" = 'AVAILABLE'
        ORDER BY "id"
        LIMIT 1
        FOR UPDATE
      `;

      const candidate = rows[0];
      if (!candidate) {
        throw new NoAvailableCopyException(bookId);
      }

      await tx.resourceCopy.update({
        where: { id: candidate.id },
        data: { status: CopyStatus.ON_LOAN, version: { increment: 1 } },
      });

      return tx.loan.create({
        data: {
          copyId: candidate.id,
          memberId,
          status: LoanStatus.ACTIVE,
          dueAt,
        },
      });
    });
  }

  async returnLoan(loanId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id: loanId } });
      if (!loan) {
        throw new EntityNotFoundException('Loan', loanId);
      }
      this.stateTransitionValidator.assertLegal(
        'Loan',
        LOAN_TRANSITIONS,
        loan.status,
        LoanStatus.RETURNED,
      );

      const copy = await tx.resourceCopy.findUniqueOrThrow({
        where: { id: loan.copyId },
      });

      const updateResult = await tx.resourceCopy.updateMany({
        where: { id: copy.id, version: copy.version },
        data: { status: CopyStatus.AVAILABLE, version: { increment: 1 } },
      });
      if (updateResult.count === 0) {
        throw new ConcurrentModificationException('ResourceCopy', copy.id);
      }

      return tx.loan.update({
        where: { id: loanId },
        data: { status: LoanStatus.RETURNED, returnedAt: new Date() },
      });
    });
  }

  /**
   * Renew against `loan_policy.maxRenewals` and block when any other member
   * has an active QUEUED/READY hold on the resource (project-structure_v3 §2.4).
   */
  async renewLoan(loanId: bigint, memberType: MemberType) {
    const loan = await this.prisma.loan.findUnique({
      where: { id: loanId },
      include: { copy: true },
    });
    if (!loan) {
      throw new EntityNotFoundException('Loan', loanId);
    }
    if (loan.status !== LoanStatus.ACTIVE && loan.status !== LoanStatus.OVERDUE) {
      throw new BadRequestException('Only active or overdue loans can be renewed.');
    }

    const policy = await this.loanPolicyService.requireByMemberType(memberType);
    if (loan.renewalCount >= policy.maxRenewals) {
      throw new BadRequestException(
        `Renewal cap of ${policy.maxRenewals} reached for member type ${memberType}.`,
      );
    }

    const bookId = loan.copy.bookId;
    const blockingHold = await this.prisma.reservation.findFirst({
      where: {
        resourceId: bookId,
        status: {
          in: [ReservationStatus.QUEUED, ReservationStatus.READY_FOR_PICKUP],
        },
        NOT: { memberId: loan.memberId },
      },
    });
    if (blockingHold) {
      throw new BadRequestException(
        'Renewal is blocked because another member has an active reservation on this item.',
      );
    }

    const newDueAt = new Date(
      loan.dueAt.getTime() + policy.loanDurationDays * 24 * 60 * 60 * 1000,
    );
    return this.prisma.loan.update({
      where: { id: loanId },
      data: {
        renewalCount: { increment: 1 },
        dueAt: newDueAt,
        status: LoanStatus.ACTIVE,
      },
    });
  }

  /** Marks overdue loans and emits notification events (Phase 7.2). */
  async markOverdueLoans(asOf: Date = new Date()): Promise<number> {
    const overdue = await this.prisma.loan.findMany({
      where: {
        status: LoanStatus.ACTIVE,
        dueAt: { lt: asOf },
        returnedAt: null,
      },
    });
    for (const loan of overdue) {
      this.stateTransitionValidator.assertLegal(
        'Loan',
        LOAN_TRANSITIONS,
        loan.status,
        LoanStatus.OVERDUE,
      );
      await this.prisma.loan.update({
        where: { id: loan.id },
        data: { status: LoanStatus.OVERDUE },
      });
      const event: LoanOverdueEvent = {
        loanId: loan.id,
        memberId: loan.memberId,
        dueAt: loan.dueAt,
      };
      this.eventEmitter.emit(LOAN_OVERDUE_EVENT, event);
    }
    return overdue.length;
  }
}
