import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberModule } from '../member/member.module';
import { LoanService } from './service/loan.service';
import { LoanController } from './controller/loan.controller';

// Phase 2 (build-guide.md): borrow (pessimistic last-copy grab) and return
// (optimistic copy-availability transition) live on LoanService. Renewal
// (which must consult ReservationQueueService) is later work. Phase 4 adds
// the thin controller over it.
@Module({
  imports: [SecurityModule, MemberModule],
  controllers: [LoanController],
  providers: [LoanService],
  exports: [LoanService],
})
export class LoanModule {}
