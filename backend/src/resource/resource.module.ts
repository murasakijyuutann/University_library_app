import { Module } from '@nestjs/common';
import { ResourceService } from './service/resource.service';

@Module({
  providers: [ResourceService],
  exports: [ResourceService],
})
export class ResourceModule {}
