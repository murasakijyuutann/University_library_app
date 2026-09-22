import { Injectable } from '@nestjs/common';
import { Prisma, ReservationStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../../common/exception/entity-not-found.exception';
import { StateTransitionValidator } from '../../common/statemachine/state-transition.validator';
import { RESERVATION_TRANSITIONS } from '../../common/statemachine/transition-rules';
import {
  RESERVATION_READY_EVENT,
  ReservationReadyEvent,
} from '../../notification/events';

/** Active queue states — an EXPIRED/FULFILLED/CANCELLED row's position is free to reuse. */
const ACTIVE_QUEUE_STATUSES: ReservationStatus[] = [
  ReservationStatus.QUEUED,
  ReservationStatus.READY_FOR_PICKUP,
];

const MAX_ENQUEUE_ATTEMPTS = 5;

/**
 * Owns the hold-queue's FIFO position assignment (build-guide.md Phase 2.4;
 * project-structure_v3.md §2.5). Phase 7.2 adds markReadyForPickup + notify.
 */
@Injectable()
export class ReservationQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateTransitionValidator: StateTransitionValidator,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `Failed to enqueue reservation for resource ${resourceId.toString()} after ${MAX_ENQUEUE_ATTEMPTS} attempts.`,
    );
  }

  async cancel(reservationId: bigint) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) {
      throw new EntityNotFoundException('Reservation', reservationId);
    }

    this.stateTransitionValidator.assertLegal(
      'Reservation',
      RESERVATION_TRANSITIONS,
      reservation.status,
      ReservationStatus.CANCELLED,
    );

    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELLED },
    });
  }

  /** Active hold for a member on a resource — used by the portal HTMX poll. */
  async findActiveForMember(resourceId: bigint, memberId: bigint) {
    return this.prisma.reservation.findFirst({
      where: {
        resourceId,
        memberId,
        status: { in: ACTIVE_QUEUE_STATUSES },
      },
      orderBy: { queuedAt: 'desc' },
    });
  }

  /**
   * Staff/system path: QUEUED → READY_FOR_PICKUP and notify the member
   * asynchronously (Phase 7.2).
   */
  async markReadyForPickup(reservationId: bigint) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) {
      throw new EntityNotFoundException('Reservation', reservationId);
    }

    this.stateTransitionValidator.assertLegal(
      'Reservation',
      RESERVATION_TRANSITIONS,
      reservation.status,
      ReservationStatus.READY_FOR_PICKUP,
    );

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: ReservationStatus.READY_FOR_PICKUP,
        readyAt: new Date(),
      },
    });

    const event: ReservationReadyEvent = {
      reservationId: updated.id,
      memberId: updated.memberId,
      resourceId: updated.resourceId,
    };
    this.eventEmitter.emit(RESERVATION_READY_EVENT, event);
    return updated;
  }
}

function isQueuePositionCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
