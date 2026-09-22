import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Member } from '@prisma/client';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { AUDITED_KEY, AuditedMeta } from './audited.decorator';
import { AuditLogService } from './service/audit-log.service';

/**
 * Nest interceptor equivalent of the old Spring AOP audit aspect
 * (project-structure_v3.md §2.11). Writes `audit_log_entry` after successful
 * handlers marked with {@link Audited}.
 *
 * Coverage limit (documented, not a bug): only transitions that flow through
 * an `@Audited()` controller handler are captured. Direct Prisma writes that
 * bypass those handlers are invisible — discipline is that all state changes
 * go through domain services invoked from decorated handlers.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditedMeta | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<
      Request & { member?: Member }
    >();

    return next.handle().pipe(
      tap({
        next: (result) => {
          void this.persist(meta, request, result);
        },
      }),
    );
  }

  private async persist(
    meta: AuditedMeta,
    request: Request & { member?: Member },
    result: unknown,
  ): Promise<void> {
    try {
      if (result === undefined || result === null) {
        return;
      }
      const entityId = meta.entityId(result);
      await this.auditLogService.record({
        entityType: meta.entityType,
        entityId,
        action: meta.action,
        actorMemberId: request.member?.id ?? null,
        oldValue: meta.oldValue?.(result),
        newValue: meta.newValue?.(result) ?? result,
      });
    } catch (error) {
      // Audit must not fail the business transaction after commit.
      this.logger.error(
        `Failed to write audit_log_entry for ${meta.entityType}/${meta.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
