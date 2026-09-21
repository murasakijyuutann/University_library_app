import { Controller, Get, UseGuards } from '@nestjs/common';
import { Member } from '@prisma/client';
import { JwtAuthGuard } from '../../security/jwt/jwt-auth.guard';
import { LoadMemberGuard } from '../guard/load-member.guard';
import { CurrentMember } from '../current-member.decorator';
import { MemberProfileResponse, toMemberProfileResponse } from '../dto/member-profile.dto';

@Controller('api/members')
@UseGuards(JwtAuthGuard, LoadMemberGuard)
export class MemberController {
  @Get('me')
  me(@CurrentMember() member: Member): MemberProfileResponse {
    return toMemberProfileResponse(member);
  }
}
