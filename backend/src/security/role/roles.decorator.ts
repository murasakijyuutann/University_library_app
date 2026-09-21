import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Declarative role gating (project-structure_v3.md §2.2) — the Nest analogue
 * of Spring's `@PreAuthorize("hasRole(...)")`. Read by RolesGuard.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
