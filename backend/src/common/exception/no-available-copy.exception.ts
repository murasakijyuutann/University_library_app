import { ConflictException } from '@nestjs/common';

/**
 * Thrown by the pessimistic "grab the last available copy" path (build-guide.md
 * Phase 2.3) when no AVAILABLE ResourceCopy row exists for a book at the moment
 * the `SELECT ... FOR UPDATE` is evaluated — including the case where a
 * concurrent borrow won the race for the last copy first. Deliberately a clean,
 * typed rejection rather than a raw database error or deadlock.
 */
export class NoAvailableCopyException extends ConflictException {
  constructor(bookId: bigint | number) {
    super(`No available copy of PhysicalBook ${bookId.toString()} to borrow.`);
  }
}
