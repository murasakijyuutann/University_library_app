import { ReservationQueueService } from '../../src/reservation/service/reservation-queue.service';
import { ResourceService } from '../../src/resource/service/resource.service';
import { IntegrationTestContext } from './testcontainers-setup';

// Phase 2.4 (build-guide.md) — the queue-position race. Two members racing to
// join the same resource's hold queue must not collide on `queue_position`;
// the `uq_active_queue_position` DB constraint (not application coordination)
// is what makes that true, and ReservationQueueService retries against it.
describe('ReservationQueueService — queue-position race (Phase 2.4)', () => {
  let ctx: IntegrationTestContext;
  let resourceService: ResourceService;
  let reservationQueueService: ReservationQueueService;

  beforeAll(async () => {
    ctx = await IntegrationTestContext.start();
    resourceService = new ResourceService(ctx.prisma);
    reservationQueueService = new ReservationQueueService(ctx.prisma);
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

  it('two concurrent enqueues for the same resource land on distinct, gapless positions', async () => {
    const book = await resourceService.createPhysicalBook({
      title: 'Popular Book',
    });
    const [memberA, memberB] = await Promise.all([
      createMember('queuer-a'),
      createMember('queuer-b'),
    ]);

    const [reservationA, reservationB] = await Promise.all([
      reservationQueueService.enqueue(book.id, memberA.id),
      reservationQueueService.enqueue(book.id, memberB.id),
    ]);

    const positions = [
      reservationA.queuePosition,
      reservationB.queuePosition,
    ].sort();
    expect(positions).toEqual([1, 2]);

    const rowCount = await ctx.prisma.reservation.count({
      where: { resourceId: book.id },
    });
    expect(rowCount).toBe(2);
  });

  it('a third enqueue after two existing reservations takes position 3', async () => {
    const book = await resourceService.createPhysicalBook({
      title: 'Another Popular Book',
    });
    const memberA = await createMember('seq-a');
    const memberB = await createMember('seq-b');
    const memberC = await createMember('seq-c');

    await reservationQueueService.enqueue(book.id, memberA.id);
    await reservationQueueService.enqueue(book.id, memberB.id);
    const third = await reservationQueueService.enqueue(book.id, memberC.id);

    expect(third.queuePosition).toBe(3);
  });
});
