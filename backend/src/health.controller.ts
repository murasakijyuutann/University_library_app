import { Controller, Get } from '@nestjs/common';

// Phase 0.1 (build-guide.md): "an empty app that responds on a health route."
// Deliberately has no dependency on PrismaService — liveness should answer
// even if the database is briefly unreachable; a DB-aware readiness check is
// a separate, later concern.
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
