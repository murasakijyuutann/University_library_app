import { Module } from '@nestjs/common';
import { SecurityModule } from '../security/security.module';
import { MemberModule } from '../member/member.module';
import { ResourceService } from './service/resource.service';
import { AccessPolicyResolver } from './service/access-policy.resolver';
import { ResourceController } from './controller/resource.controller';

@Module({
  imports: [SecurityModule, MemberModule],
  controllers: [ResourceController],
  providers: [ResourceService, AccessPolicyResolver],
  exports: [ResourceService, AccessPolicyResolver],
})
export class ResourceModule {}
