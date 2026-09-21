import { Role } from '@prisma/client';

/**
 * The shape of the validated JWT payload, attached to `request.user` by
 * JwtAuthGuard (project-structure_v3.md §2.2). The claims an SSO-issued token
 * is expected to carry: `sub` is the JWT subject (maps to `Member.ssoSubjectId`,
 * never a password), `role` drives RolesGuard, `faculty`/`memberType` are
 * institutional attributes AccessPolicyResolver and loan_policy consume.
 */
export interface JwtClaims {
  readonly sub: string;
  readonly role: Role;
  readonly faculty?: string;
  readonly memberType?: string;
  readonly iat?: number;
  readonly exp?: number;
}
