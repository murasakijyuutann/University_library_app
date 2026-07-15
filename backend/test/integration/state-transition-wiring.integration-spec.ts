import { LoanService } from '../../src/loan/service/loan.service';
import { ReservationQueueService } from '../../src/reservation/service/reservation-queue.service';
import { ThesisSubmissionService } from '../../src/thesis/service/thesis-submission.service';
import { IllRequestService } from '../../src/ill/service/ill-request.service';
import { ResourceService } from '../../src/resource/service/resource.service';
import { StateTransitionValidator } from '../../src/common/statemachine/state-transition.validator';
import { InvalidStateTransitionException } from '../../src/common/exception/invalid-state-transition.exception';
import { IntegrationTestContext } from './testcontainers-setup';

// Phase 3.3 (build-guide.md): "an attempt to drive any entity through an
// illegal transition is blocked at the service layer" — proven here for all
// four state machines, against real Postgres.
describe('StateTransitionValidator wiring (Phase 3.3)', () => {
  let ctx: IntegrationTestContext;
  let resourceService: ResourceService;
  let loanService: LoanService;
  let reservationQueueService: ReservationQueueService;
  let thesisSubmissionService: ThesisSubmissionService;
  let illRequestService: IllRequestService;

  beforeAll(async () => {
    ctx = await IntegrationTestContext.start();
    const validator = new StateTransitionValidator();
    resourceService = new ResourceService(ctx.prisma);
    loanService = new LoanService(ctx.prisma, validator);
    reservationQueueService = new ReservationQueueService(
      ctx.prisma,
      validator,
    );
    thesisSubmissionService = new ThesisSubmissionService(
      ctx.prisma,
      validator,
    );
    illRequestService = new IllRequestService(ctx.prisma, validator);
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  async function createMember(label: string) {
    return ctx.prisma.member.create({
      data: {
        ssoSubjectId: `${label}-${Date.now()}-${Math.random()}`,
        fullName: label,
        email: `${label}@example.edu`,
        memberType: 'UNDERGRAD',
        role: 'STUDENT',
      },
    });
  }

  it('Loan — returning an already-returned loan is rejected', async () => {
    const book = await resourceService.createPhysicalBook({
      title: 'Wiring Test Book',
    });
    await ctx.prisma.resourceCopy.create({
      data: { bookId: book.id, status: 'AVAILABLE' },
    });
    const member = await createMember('loan-wiring-member');
    const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const loan = await loanService.borrowCopy(book.id, member.id, dueAt);
    await loanService.returnLoan(loan.id);

    await expect(loanService.returnLoan(loan.id)).rejects.toBeInstanceOf(
      InvalidStateTransitionException,
    );
  });

  it('Reservation — cancelling an already-cancelled reservation is rejected', async () => {
    const book = await resourceService.createPhysicalBook({
      title: 'Wiring Test Queue Book',
    });
    const member = await createMember('reservation-wiring-member');

    const reservation = await reservationQueueService.enqueue(
      book.id,
      member.id,
    );
    await reservationQueueService.cancel(reservation.id);

    await expect(
      reservationQueueService.cancel(reservation.id),
    ).rejects.toBeInstanceOf(InvalidStateTransitionException);
  });

  it('ThesisSubmission — jumping from DRAFT straight to PUBLISHED is rejected', async () => {
    const member = await createMember('thesis-wiring-member');
    const submission = await thesisSubmissionService.createDraft({
      studentMemberId: member.id,
    });

    await expect(
      thesisSubmissionService.transition(submission.id, 'PUBLISHED'),
    ).rejects.toBeInstanceOf(InvalidStateTransitionException);

    // The legal first step still works.
    const submitted = await thesisSubmissionService.transition(
      submission.id,
      'SUBMITTED',
    );
    expect(submitted.submissionStatus).toBe('SUBMITTED');
  });

  it('IllRequest — skipping straight to FULFILLED from SUBMITTED is rejected', async () => {
    const member = await createMember('ill-wiring-member');
    const request = await illRequestService.submit({
      memberId: member.id,
      title: 'A Book Elsewhere',
    });

    await expect(
      illRequestService.transition(request.id, 'FULFILLED'),
    ).rejects.toBeInstanceOf(InvalidStateTransitionException);

    const underReview = await illRequestService.transition(
      request.id,
      'UNDER_REVIEW',
    );
    expect(underReview.status).toBe('UNDER_REVIEW');
  });
});
