import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberModule } from '../member/member.module';
import { ResourceModule } from '../resource/resource.module';
import { ReservationQueueService } from './service/reservation-queue.service';
import { ReservationController } from './controller/reservation.controller';

// Phase 2 (build-guide.md): FIFO enqueue, protected by the
// uq_active_queue_position DB constraint, lives on ReservationQueueService.
// Expiry/cascade-to-next-in-queue scheduling is later work. Phase 4 adds the
// thin controller over it; enqueue consults AccessPolicyResolver first.
@Module({
  imports: [SecurityModule, MemberModule, ResourceModule],
  controllers: [ReservationController],
  providers: [ReservationQueueService],
  exports: [ReservationQueueService],
})
export class ReservationModule {}
