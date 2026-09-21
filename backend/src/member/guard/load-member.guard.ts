import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Member } from '@prisma/client';
import { JwtClaims } from '../../security/jwt/jwt-claims';
import { MemberService } from '../service/member.service';

/**
 * Resolves the JWT's `sub` claim (an SSO subject id) to an actual `Member`
 * row and attaches it to `request.member`, so downstream handlers get the
 * internal bigint id foreign keys actually need — rather than every
 * controller re-deriving it. Must run AFTER JwtAuthGuard (order matters:
 * `@UseGuards(JwtAuthGuard, LoadMemberGuard)`).
 *
 * A valid token for an identity with no provisioned Member row is a genuine,
 * distinct failure mode from "not authenticated" (SSO login succeeding is not
 * the same as being a recognized library member) — surfaced here as 401
 * rather than silently creating a row on the fly, since member provisioning
 * is out of this project's scope (see docs' "designed, not built" pattern).
 */
@Injectable()
export class LoadMemberGuard implements CanActivate {
  constructor(private readonly memberService: MemberService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtClaims; member?: Member }>();
    const claims = request.user;
    if (!claims) {
      return false;
    }

    const member = await this.memberService.findBySsoSubjectId(claims.sub);
    if (!member) {
      throw new UnauthorizedException(
        `No Member is provisioned for identity "${claims.sub}".`,
      );
    }

    request.member = member;
    return true;
  }
}
