import {
  Body,
  Controller,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role, type Member } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../security/jwt/jwt-auth.guard';
import { Roles } from '../../security/role/roles.decorator';
import { RolesGuard } from '../../security/role/roles.guard';
import { LoadMemberGuard } from '../../member/guard/load-member.guard';
import { CurrentMember } from '../../member/current-member.decorator';
import { ParseBigIntPipe } from '../../common/pipe/parse-bigint.pipe';
import { IllRequestService } from '../service/ill-request.service';
import { SubmitIllRequestDto } from '../dto/submit-ill-request.dto';
import { TransitionIllRequestDto } from '../dto/transition-ill-request.dto';
import { IllRequestResponse, toIllRequestResponse } from '../dto/ill-request-response.dto';
import { Audited } from '../../audit/audited.decorator';

/** Student-facing submit, librarian-facing review (project-structure_v3.md §2.8). */
@Controller('api/ill-requests')
@UseGuards(JwtAuthGuard, LoadMemberGuard)
export class IllRequestController {
  constructor(
    private readonly illRequestService: IllRequestService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async submit(
    @Body() body: SubmitIllRequestDto,
    @CurrentMember() member: Member,
  ): Promise<IllRequestResponse> {
    const request = await this.illRequestService.submit({
      memberId: member.id,
      title: body.title,
      author: body.author,
      doiOrIsbn: body.doiOrIsbn,
      justification: body.justification,
    });
    return toIllRequestResponse(request);
  }

  @Post(':id/transition')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @UseGuards(RolesGuard)
  @Audited({
    entityType: 'IllRequest',
    action: 'TRANSITION',
    entityId: (result) => BigInt((result as IllRequestResponse).id),
    newValue: (result) => result,
  })
  async transition(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: TransitionIllRequestDto,
  ): Promise<IllRequestResponse> {
    const existing = await this.prisma.illRequest.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`IllRequest ${id.toString()} was not found.`);
    }
    const request = await this.illRequestService.transition(id, body.to);
    return toIllRequestResponse(request);
  }
}
