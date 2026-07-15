import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Active queue states — an EXPIRED/FULFILLED/CANCELLED row's position is free to reuse. */
const ACTIVE_QUEUE_STATUSES: ReservationStatus[] = [
  ReservationStatus.QUEUED,
  ReservationStatus.READY_FOR_PICKUP,
];

const MAX_ENQUEUE_ATTEMPTS = 5;

/**
 * Owns the hold-queue's FIFO position assignment (build-guide.md Phase 2.4;
 * project-structure_v3.md §2.5). The read-then-write here (read the current
 * max position, then insert at max + 1) has a genuine race window between two
 * concurrent enqueues — the fix is NOT application-level coordination (a mutex,
 * a queue) but the database itself: `reservation`'s
 * `UNIQUE (resourceId, queuePosition)` constraint (see prisma/schema.prisma)
 * makes a colliding position a constraint violation (Postgres error P2002),
 * which this method catches and retries against the now-current max — the
 * database enforces the invariant; this method just reacts to it.
 */
@Injectable()
export class ReservationQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(resourceId: bigint, memberId: bigint) {
    for (let attempt = 0; attempt < MAX_ENQUEUE_ATTEMPTS; attempt++) {
      const current = await this.prisma.reservation.aggregate({
        where: { resourceId, status: { in: ACTIVE_QUEUE_STATUSES } },
        _max: { queuePosition: true },
      });
      const nextPosition = (current._max.queuePosition ?? 0) + 1;

      try {
        return await this.prisma.reservation.create({
          data: {
            resourceId,
            memberId,
            queuePosition: nextPosition,
            status: ReservationStatus.QUEUED,
          },
        });
      } catch (error) {
        if (isQueuePositionCollision(error)) {
          continue; // another enqueue took `nextPosition` first — recompute and retry
        }
        throw error;
      }
    }

    throw new Error(
      `Failed to enqueue reservation for resource ${resourceId.toString()} after ${MAX_ENQUEUE_ATTEMPTS} attempts.`,
    );
  }
}

function isQueuePositionCollision(error: unknown): boolean {
  // P2002 is Prisma's generic "unique constraint violation" code. `reservation`
  // has exactly one unique constraint (`uq_active_queue_position`), so the code
  // alone is unambiguous here — the exact shape of `error.meta.target` differs
  // across Prisma versions/providers and isn't worth depending on.
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
