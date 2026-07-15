import { Module } from '@nestjs/common';
import { IllRequestService } from './service/ill-request.service';

// Phase 3 (build-guide.md): the IllRequestStatus state machine (minimal seam)
// lives on IllRequestService. The librarian-facing review workflow and
// external fulfillment integration are later work.
@Module({
  providers: [IllRequestService],
  exports: [IllRequestService],
})
export class IllModule {}
