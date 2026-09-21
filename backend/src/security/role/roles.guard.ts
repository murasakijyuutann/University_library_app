import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { JwtClaims } from '../jwt/jwt-claims';
import { ROLES_KEY } from './roles.decorator';

/**
 * Method-level role check (project-structure_v3.md §2.2). Runs after
 * JwtAuthGuard has already populated `request.user` — a route with no
 * `@Roles(...)` metadata is open to any authenticated member; a route with
 * `@Roles(...)` rejects any member whose JWT `role` claim isn't listed.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtClaims }>();
    const claims = request.user;
    return claims !== undefined && requiredRoles.includes(claims.role);
  }
}
