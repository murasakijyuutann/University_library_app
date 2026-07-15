import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Extends PrismaClient directly so it can be injected wherever the generated,
// fully-typed client is needed — Prisma's generated client IS the repository
// layer in this project (see project-structure_v3.md §2.3); there are no
// separate per-entity repository classes.
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres via Prisma.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
