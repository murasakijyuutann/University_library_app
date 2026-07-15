import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ResourceModule } from './resource/resource.module';
import { LoanModule } from './loan/loan.module';
import { ReservationModule } from './reservation/reservation.module';
import { ThesisModule } from './thesis/thesis.module';
import { JournalModule } from './journal/journal.module';
import { IllModule } from './ill/ill.module';
import { MemberModule } from './member/member.module';
import { NotificationModule } from './notification/notification.module';
import { AuditModule } from './audit/audit.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Public search route throttling (Phase 5.4, build-guide.md) — bound
    // globally now, applied selectively once the search controller exists.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    ResourceModule,
    LoanModule,
    ReservationModule,
    ThesisModule,
    JournalModule,
    IllModule,
    MemberModule,
    NotificationModule,
    AuditModule,
    SearchModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
