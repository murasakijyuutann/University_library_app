import { ConflictException } from '@nestjs/common';

/**
 * Thrown when an optimistic-lock conditional update (`updateMany` on
 * `where: { id, version }`) affects zero rows — the affected-row count is the
 * concurrency signal (see build-guide.md Phase 2.2, project-structure_v3.md §2.5):
 * someone else already transitioned this row's version first. This is the clean,
 * typed outcome callers should see instead of a raw zero-rows-affected result.
 */
export class ConcurrentModificationException extends ConflictException {
  constructor(entityType: string, id: bigint | number | string) {
    super(
      `${entityType} with id ${id.toString()} was concurrently modified by another request — retry with fresh state.`,
    );
  }
}
