import { Module } from '@nestjs/common';
import { LoanService } from './service/loan.service';

// Phase 2 (build-guide.md): borrow (pessimistic last-copy grab) and return
// (optimistic copy-availability transition) now live on LoanService. Renewal
// (which must consult ReservationQueueService) lands in Phase 3.
@Module({
  providers: [LoanService],
  exports: [LoanService],
})
export class LoanModule {}
