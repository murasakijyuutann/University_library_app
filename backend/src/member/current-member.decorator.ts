import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Member } from '@prisma/client';

/** Reads `request.member`, populated by `LoadMemberGuard`. */
export const CurrentMember = createParamDecorator((_data: unknown, ctx: ExecutionContext): Member => {
  const request = ctx.switchToHttp().getRequest<{ member: Member }>();
  return request.member;
});
