import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DeliveryStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_SENDER, EmailSender } from './email-sender.port';
import {
  EMBARGO_LIFTED_EVENT,
  EmbargoLiftedEvent,
  LOAN_OVERDUE_EVENT,
  LoanOverdueEvent,
  RESERVATION_READY_EVENT,
  ReservationReadyEvent,
} from './events';

/**
 * Async notification dispatch (Phase 7.2). Handlers never throw back into the
 * emitter path for delivery failure — FAILED is recorded instead. Retry /
 * dead-letter is deferred (BullMQ noted in docs/post-v1-deferred.md).
 */
@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  @OnEvent(LOAN_OVERDUE_EVENT)
  async onLoanOverdue(event: LoanOverdueEvent): Promise<void> {
    await this.dispatch({
      memberId: event.memberId,
      type: NotificationType.OVERDUE,
      subject: 'Library item overdue',
      body: `Loan ${event.loanId.toString()} was due ${event.dueAt.toISOString()}.`,
      payload: {
        loanId: event.loanId.toString(),
        dueAt: event.dueAt.toISOString(),
      },
    });
  }

  @OnEvent(RESERVATION_READY_EVENT)
  async onReservationReady(event: ReservationReadyEvent): Promise<void> {
    await this.dispatch({
      memberId: event.memberId,
      type: NotificationType.RESERVATION_READY,
      subject: 'Reserved item ready for pickup',
      body: `Reservation ${event.reservationId.toString()} is ready.`,
      payload: {
        reservationId: event.reservationId.toString(),
        resourceId: event.resourceId.toString(),
      },
    });
  }

  @OnEvent(EMBARGO_LIFTED_EVENT)
  async onEmbargoLifted(event: EmbargoLiftedEvent): Promise<void> {
    await this.dispatch({
      memberId: event.memberId,
      type: NotificationType.EMBARGO_LIFTED,
      subject: 'Thesis embargo lifted',
      body: `Submission ${event.submissionId.toString()} embargo has ended.`,
      payload: { submissionId: event.submissionId.toString() },
    });
  }

  private async dispatch(input: {
    memberId: bigint;
    type: NotificationType;
    subject: string;
    body: string;
    payload: Record<string, string>;
  }): Promise<void> {
    try {
      await this.emailSender.send({
        toMemberId: input.memberId,
        subject: input.subject,
        body: input.body,
      });
      await this.prisma.notificationLog.create({
        data: {
          memberId: input.memberId,
          type: input.type,
          deliveryStatus: DeliveryStatus.SENT,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Notification ${input.type} failed for member ${input.memberId.toString()}`,
        error instanceof Error ? error.message : String(error),
      );
      await this.prisma.notificationLog.create({
        data: {
          memberId: input.memberId,
          type: input.type,
          deliveryStatus: DeliveryStatus.FAILED,
          payload: {
            ...input.payload,
            error: error instanceof Error ? error.message : String(error),
          } as Prisma.InputJsonValue,
        },
      });
    }
  }
}
