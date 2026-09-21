import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberModule } from '../member/member.module';
import { ResourceModule } from '../resource/resource.module';
import { JournalAccessController } from './controller/journal-access.controller';

// Phase 4 (build-guide.md): the license-gate resolve endpoint over
// AccessPolicyResolver. LinkResolverService (the simulated resolver/proxy
// hop) is later work — see the controller's own doc comment.
@Module({
  imports: [SecurityModule, MemberModule, ResourceModule],
  controllers: [JournalAccessController],
})
export class JournalModule {}
