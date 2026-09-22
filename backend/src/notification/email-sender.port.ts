export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailMessage {
  toMemberId: bigint;
  subject: string;
  body: string;
}

/**
 * Delivery port — production would wrap SES. Tests swap in a failing sender
 * to prove FAILED rows are recorded (Phase 7.2).
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
