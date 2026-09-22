import { DeliveryStatus, MemberType, Role } from '@prisma/client';
import * as request from 'supertest';
import { EmailSender } from '../src/notification/email-sender.port';
import { ReservationQueueService } from '../src/reservation/service/reservation-queue.service';
import { FineCalculationService } from '../src/loan/service/fine-calculation.service';
import { LoanService } from '../src/loan/service/loan.service';
import { E2E_SUBJECTS, E2eTestContext } from './e2e-setup';

describe('Phase 7 hardening', () => {
  let ctx: E2eTestContext;

  beforeAll(async () => {
    ctx = await E2eTestContext.start();
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await ctx.stop();
    }
  });

  it('7.1 — returning a loan through the API writes an audit_log_entry', async () => {
    const token = await ctx.issueToken(E2E_SUBJECTS.student, Role.STUDENT);

    const borrowed = await request(ctx.app.getHttpServer())
      .post('/api/loans')
      .set(ctx.authHeader(token))
      .send({ bookId: ctx.seed.bookId })
      .expect(201);

    const loanId = borrowed.body.id as string;

    await request(ctx.app.getHttpServer())
      .post(`/api/loans/${loanId}/return`)
      .set(ctx.authHeader(token))
      .expect(201);

    // Interceptor writes asynchronously via tap — allow a brief settle.
    await new Promise((r) => setTimeout(r, 100));

    const audits = await ctx.prisma.auditLogEntry.findMany({
      where: { entityType: 'Loan', entityId: BigInt(loanId) },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(['BORROW', 'RETURN']),
    );
    expect(audits[0].actorMemberId).toBe(ctx.seed.student.id);
  });

  it('7.2 — reservation ready emits a SENT notification_log row', async () => {
    const book = await ctx.app.get(ReservationQueueService);
    // Use a fresh book so queue is empty
    const resourceService = await import('../src/resource/service/resource.service').then(
      (m) => new m.ResourceService(ctx.prisma),
    );
    const held = await resourceService.createPhysicalBook({
      title: 'Hold Notify Book',
      isbn: '9780000000099',
      author: 'Notify Author',
    });
    await ctx.prisma.resourceCopy.create({
      data: { bookId: held.id, status: 'AVAILABLE' },
    });

    const reservation = await book.enqueue(held.id, ctx.seed.student.id);
    await book.markReadyForPickup(reservation.id);

    await waitFor(async () => {
      const rows = await ctx.prisma.notificationLog.findMany({
        where: {
          memberId: ctx.seed.student.id,
          type: 'RESERVATION_READY',
        },
      });
      return rows.length > 0 ? rows : null;
    });

    const rows = await ctx.prisma.notificationLog.findMany({
      where: { memberId: ctx.seed.student.id, type: 'RESERVATION_READY' },
    });
    expect(rows.some((r) => r.deliveryStatus === DeliveryStatus.SENT)).toBe(true);
  });

  it('7.2 — simulated send failure records FAILED rather than vanishing', async () => {
    const failing: EmailSender = {
      send: async () => {
        throw new Error('SMTP unavailable');
      },
    };

    const { NotificationDispatcher } = await import(
      '../src/notification/notification.dispatcher'
    );
    const dispatcher = new NotificationDispatcher(ctx.prisma, failing);
    await dispatcher.onReservationReady({
      reservationId: 1n,
      memberId: ctx.seed.student.id,
      resourceId: BigInt(ctx.seed.bookId),
    });

    const failed = await ctx.prisma.notificationLog.findFirst({
      where: {
        memberId: ctx.seed.student.id,
        type: 'RESERVATION_READY',
        deliveryStatus: DeliveryStatus.FAILED,
      },
      orderBy: { sentAt: 'desc' },
    });
    expect(failed).toBeTruthy();
    expect((failed?.payload as { error?: string })?.error).toMatch(/SMTP/);
  });

  it('7.3 — renew is blocked when another member has an active reservation', async () => {
    const resourceService = new (
      await import('../src/resource/service/resource.service')
    ).ResourceService(ctx.prisma);
    const book = await resourceService.createPhysicalBook({
      title: 'Renew Block Book',
      isbn: '9780000000088',
      author: 'Renew Author',
    });
    await ctx.prisma.resourceCopy.create({
      data: { bookId: book.id, status: 'AVAILABLE' },
    });

    const studentToken = await ctx.issueToken(E2E_SUBJECTS.student, Role.STUDENT);
    const loanRes = await request(ctx.app.getHttpServer())
      .post('/api/loans')
      .set(ctx.authHeader(studentToken))
      .send({ bookId: book.id.toString() })
      .expect(201);

    await ctx.app
      .get(ReservationQueueService)
      .enqueue(book.id, ctx.seed.faculty.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/loans/${loanRes.body.id}/renew`)
      .set(ctx.authHeader(studentToken))
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toMatch(/reservation/i);
      });
  });

  it('7.3 — changing loan_policy changes fine calculation without code changes', async () => {
    const fineService = ctx.app.get(FineCalculationService);
    const loanService = ctx.app.get(LoanService);

    const resourceService = new (
      await import('../src/resource/service/resource.service')
    ).ResourceService(ctx.prisma);
    const book = await resourceService.createPhysicalBook({
      title: 'Fine Policy Book',
      isbn: '9780000000077',
      author: 'Fine Author',
    });
    await ctx.prisma.resourceCopy.create({
      data: { bookId: book.id, status: 'AVAILABLE' },
    });

    const dueAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const loan = await loanService.borrowCopy(book.id, ctx.seed.student.id, dueAt);

    const before = await fineService.calculateOverdueFine(
      loan.id,
      MemberType.UNDERGRAD,
    );
    expect(before.daysCharged).toBeGreaterThan(0);

    await ctx.prisma.loanPolicy.update({
      where: { memberType: MemberType.UNDERGRAD },
      data: { finePerDay: 2.0, gracePeriodDays: 0 },
    });

    const after = await fineService.calculateOverdueFine(
      loan.id,
      MemberType.UNDERGRAD,
    );
    expect(Number(after.amount)).toBeGreaterThan(Number(before.amount));
  });
});

async function waitFor<T>(
  fn: () => Promise<T | null>,
  attempts = 20,
  delayMs = 50,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const value = await fn();
    if (value) {
      return value;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('waitFor timed out');
}
