import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecordAuditInput {
  entityType: string;
  entityId: bigint;
  action: string;
  actorMemberId?: bigint | null;
  oldValue?: unknown;
  newValue?: unknown;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditInput): Promise<void> {
    await this.prisma.auditLogEntry.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorMemberId: input.actorMemberId ?? null,
        oldValue:
          input.oldValue === undefined
            ? undefined
            : (input.oldValue as Prisma.InputJsonValue),
        newValue:
          input.newValue === undefined
            ? undefined
            : (input.newValue as Prisma.InputJsonValue),
      },
    });
  }
}
