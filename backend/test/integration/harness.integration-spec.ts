import { IntegrationTestContext } from './testcontainers-setup';

// Phase 0.4 (build-guide.md) — the harness-proving test: insert and read a row
// against a real, disposable Postgres container. Deliberately uses the
// simplest possible model (Member) — the point is proving the pipeline
// (container -> migrate deploy -> PrismaService -> real query), not domain logic.
describe('Testcontainers harness (Phase 0.4)', () => {
  let ctx: IntegrationTestContext;

  beforeAll(async () => {
    ctx = await IntegrationTestContext.start();
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  it('inserts and reads back a row against a real, disposable Postgres container', async () => {
    const created = await ctx.prisma.member.create({
      data: {
        ssoSubjectId: 'harness-test-subject-1',
        fullName: 'Harness Test Member',
        email: 'harness@example.edu',
        memberType: 'UNDERGRAD',
        role: 'STUDENT',
      },
    });

    const found = await ctx.prisma.member.findUnique({
      where: { id: created.id },
    });

    expect(found).not.toBeNull();
    expect(found?.fullName).toBe('Harness Test Member');
    expect(found?.ssoSubjectId).toBe('harness-test-subject-1');
  });
});
