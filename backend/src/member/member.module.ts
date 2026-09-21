import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberService } from './service/member.service';
import { LoadMemberGuard } from './guard/load-member.guard';
import { MemberController } from './controller/member.controller';

// Phase 4 (build-guide.md): MemberService resolves a JWT's `sub` claim to a
// Member row; LoadMemberGuard is the reusable seam every other domain
// controller uses to get `@CurrentMember()`. Fines and loan_policy-driven
// fine calculation are later work.
@Module({
  imports: [SecurityModule],
  controllers: [MemberController],
  providers: [MemberService, LoadMemberGuard],
  exports: [MemberService, LoadMemberGuard],
})
export class MemberModule {}
