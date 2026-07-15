import { NotFoundException } from '@nestjs/common';

/** Generic "entity of this type/id doesn't exist" exception (project-structure_v3.md §2.13). */
export class EntityNotFoundException extends NotFoundException {
  constructor(entityType: string, id: bigint | number | string) {
    super(`${entityType} with id ${id.toString()} was not found.`);
  }
}
