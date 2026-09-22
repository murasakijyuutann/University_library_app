import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberModule } from '../member/member.module';
import { ResourceModule } from '../resource/resource.module';
import { LoanService } from './service/loan.service';
import { LoanPolicyService } from './service/loan-policy.service';
import { FineCalculationService } from './service/fine-calculation.service';
import { LoanController } from './controller/loan.controller';

// Phase 2 + 7.3: borrow/return/renew + loan_policy-driven fines.
@Module({
  imports: [SecurityModule, MemberModule, ResourceModule],
  controllers: [LoanController],
  providers: [LoanService, LoanPolicyService, FineCalculationService],
  exports: [LoanService, LoanPolicyService, FineCalculationService],
})
export class LoanModule {}
