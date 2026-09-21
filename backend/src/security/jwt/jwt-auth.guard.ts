import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Stateless request auth (project-structure_v3.md §2.2): runs per-request,
 * delegates to JwtStrategy to verify the token and attach typed claims to
 * `request.user`. A request without a valid token is rejected with 401 by
 * the underlying passport-jwt strategy — no custom logic needed here.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
