import { Injectable } from '@nestjs/common';
import { CopyStatus, LoanStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConcurrentModificationException } from '../../common/exception/concurrent-modification.exception';
import { EntityNotFoundException } from '../../common/exception/entity-not-found.exception';
import { InvalidStateTransitionException } from '../../common/exception/invalid-state-transition.exception';
import { NoAvailableCopyException } from '../../common/exception/no-available-copy.exception';

/** The one row `borrowCopy`'s raw `SELECT ... FOR UPDATE` needs to decide with. */
interface LockedCopyRow {
  id: bigint;
  version: bigint;
}

/**
 * Owns the two concurrency-critical paths of the physical-book lifecycle
 * (build-guide.md Phase 2; project-structure_v3.md §2.4/§2.5/§4):
 *
 * - `borrowCopy` — the PESSIMISTIC "grab the last available copy" path. Uses an
 *   interactive transaction issuing a raw `SELECT ... FOR UPDATE` to lock the
 *   candidate row before deciding, so two racing borrowers can't both win.
 * - `returnLoan` — the OPTIMISTIC path for copy-availability transitions.
 *   `ResourceCopy` has no Prisma `@version` annotation, so the lock is a
 *   conditional `updateMany` on `where: { id, version }`, and the affected-row
 *   count (0 or 1) is the concurrency signal — not an ORM feature.
 *
 * Per the copy/loan consistency decision (project-structure_v3.md §4), a
 * returned loan and a freed copy commit in the SAME `prisma.$transaction`, so a
 * failed transaction leaves neither half applied.
 */
@Injectable()
export class LoanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pessimistic last-copy grab (build-guide.md task 2.3). Locks one AVAILABLE
   * copy row for the given book with `FOR UPDATE` before transitioning it,
   * so a concurrent second caller blocks on the same row rather than reading a
   * stale "still available" snapshot and double-borrowing it.
   */
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

      // The row is already locked by FOR UPDATE above, so this update cannot
      // race — it exists to keep `version` accurate for later optimistic
      // transitions (e.g. returnLoan), not to guard this decision itself.
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

  /**
   * Optimistic copy-availability transition (build-guide.md task 2.2), composed
   * with the loan-status flip in one transaction (project-structure_v3.md §4's
   * copy/loan consistency decision). `updateMany` on `where: { id, version }`
   * is the lock; `count === 0` means another request already won the race on
   * this exact copy, and the caller sees a clean `ConcurrentModificationException`
   * rather than a silently-stale write.
   */
  async returnLoan(loanId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id: loanId } });
      if (!loan) {
        throw new EntityNotFoundException('Loan', loanId);
      }
      if (
        loan.status !== LoanStatus.ACTIVE &&
        loan.status !== LoanStatus.OVERDUE
      ) {
        throw new InvalidStateTransitionException(
          'Loan',
          loan.status,
          LoanStatus.RETURNED,
        );
      }

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
}
