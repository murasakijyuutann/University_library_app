import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EMAIL_SENDER } from './email-sender.port';
import { LoggingEmailSender } from './logging-email-sender';
import { NotificationDispatcher } from './notification.dispatcher';

/**
 * Phase 7.2 — async (@OnEvent) notification dispatch with delivery-status rows.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    NotificationDispatcher,
    LoggingEmailSender,
    { provide: EMAIL_SENDER, useExisting: LoggingEmailSender },
  ],
  exports: [NotificationDispatcher, EMAIL_SENDER],
})
export class NotificationModule {}
