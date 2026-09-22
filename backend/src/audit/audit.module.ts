import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLogService } from './service/audit-log.service';

/**
 * Phase 7.1 — cross-cutting audit trail.
 * Coverage boundary: docs/audit-coverage.md
 */
@Module({
  imports: [PrismaModule],
  providers: [
    AuditLogService,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditLogService],
})
export class AuditModule {}
