import { Module } from '@nestjs/common';
import { ReservationQueueService } from './service/reservation-queue.service';

// Phase 2 (build-guide.md): FIFO enqueue, protected by the
// uq_active_queue_position DB constraint, lives on ReservationQueueService.
// Expiry/cascade-to-next-in-queue scheduling lands in a later phase.
@Module({
  providers: [ReservationQueueService],
  exports: [ReservationQueueService],
})
export class ReservationModule {}
