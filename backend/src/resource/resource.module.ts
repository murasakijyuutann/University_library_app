import { Module } from '@nestjs/common';
import { ResourceService } from './service/resource.service';
import { AccessPolicyResolver } from './service/access-policy.resolver';

@Module({
  providers: [ResourceService, AccessPolicyResolver],
  exports: [ResourceService, AccessPolicyResolver],
})
export class ResourceModule {}
