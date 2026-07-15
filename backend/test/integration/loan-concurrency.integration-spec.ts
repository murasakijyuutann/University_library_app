import { LoanService } from '../../src/loan/service/loan.service';
import { ResourceService } from '../../src/resource/service/resource.service';
import { ConcurrentModificationException } from '../../src/common/exception/concurrent-modification.exception';
import { NoAvailableCopyException } from '../../src/common/exception/no-available-copy.exception';
import { IntegrationTestContext } from './testcontainers-setup';

// Phase 2 (build-guide.md) — the concurrency core: proving the pessimistic
// last-copy grab (2.3) and the optimistic copy-return path (2.2) both hold up
// against real, simultaneous Postgres transactions — not just against a
// single-threaded happy path.
describe('LoanService — concurrency (Phase 2.2 / 2.3)', () => {
  let ctx: IntegrationTestContext;
  let resourceService: ResourceService;
  let loanService: LoanService;

  beforeAll(async () => {
    ctx = await IntegrationTestContext.start();
    resourceService = new ResourceService(ctx.prisma);
    loanService = new LoanService(ctx.prisma);
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

  it('2.3 — two simultaneous borrows racing the last available copy: exactly one wins, the other is cleanly rejected', async () => {
    const book = await resourceService.createPhysicalBook({
      title: 'Last Copy Book',
    });
    const copy = await ctx.prisma.resourceCopy.create({
      data: { bookId: book.id, status: 'AVAILABLE' },
    });

    const [memberA, memberB] = await Promise.all([
      createMember('borrower-a'),
      createMember('borrower-b'),
    ]);
    const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const results = await Promise.allSettled([
      loanService.borrowCopy(book.id, memberA.id, dueAt),
      loanService.borrowCopy(book.id, memberB.id, dueAt),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      NoAvailableCopyException,
    );

    const finalCopy = await ctx.prisma.resourceCopy.findUniqueOrThrow({
      where: { id: copy.id },
    });
    expect(finalCopy.status).toBe('ON_LOAN');
    expect(finalCopy.version).toBe(BigInt(1));

    const loanCount = await ctx.prisma.loan.count({
      where: { copyId: copy.id },
    });
    expect(loanCount).toBe(1);
  });

  it('2.2 — two simultaneous returns of the same loan: exactly one succeeds, the other sees the version conflict cleanly', async () => {
    const book = await resourceService.createPhysicalBook({
      title: 'Double Return Book',
    });
    const copy = await ctx.prisma.resourceCopy.create({
      data: { bookId: book.id, status: 'AVAILABLE' },
    });
    const member = await createMember('returner');
    const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const loan = await loanService.borrowCopy(book.id, member.id, dueAt);

    const results = await Promise.allSettled([
      loanService.returnLoan(loan.id),
      loanService.returnLoan(loan.id),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ConcurrentModificationException,
    );

    const finalCopy = await ctx.prisma.resourceCopy.findUniqueOrThrow({
      where: { id: copy.id },
    });
    expect(finalCopy.status).toBe('AVAILABLE');
    expect(finalCopy.version).toBe(BigInt(2)); // 0 -> 1 (borrow) -> 2 (return)

    const finalLoan = await ctx.prisma.loan.findUniqueOrThrow({
      where: { id: loan.id },
    });
    expect(finalLoan.status).toBe('RETURNED');
  });
});
