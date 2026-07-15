import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global module exporting PrismaService — every domain module injects
// PrismaService rather than instantiating PrismaClient itself, so the
// connection lifecycle (see prisma.service.ts) has exactly one owner.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
