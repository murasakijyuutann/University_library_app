import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailSender } from './email-sender.port';

/** Dev/default sender — logs and succeeds (no real SMTP). */
@Injectable()
export class LoggingEmailSender implements EmailSender {
  private readonly logger = new Logger(LoggingEmailSender.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(
      `Notify member ${message.toMemberId.toString()}: ${message.subject}`,
    );
  }
}
