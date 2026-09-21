import {
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role, SubmissionStatus, type Member } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../security/jwt/jwt-auth.guard';
import { Roles } from '../../security/role/roles.decorator';
import { RolesGuard } from '../../security/role/roles.guard';
import { LoadMemberGuard } from '../../member/guard/load-member.guard';
import { CurrentMember } from '../../member/current-member.decorator';
import { ParseBigIntPipe } from '../../common/pipe/parse-bigint.pipe';
import { ThesisSubmissionService } from '../service/thesis-submission.service';
import { CreateThesisSubmissionRequestDto } from '../dto/create-thesis-submission-request.dto';
import { TransitionThesisSubmissionRequestDto } from '../dto/transition-thesis-submission-request.dto';
import { ThesisSubmissionResponse, toThesisSubmissionResponse } from '../dto/thesis-submission-response.dto';

/**
 * Thin controller over the minimal ThesisSubmissionService (Phase 3's scope
 * note applies here too: the full supervisor-approval workflow is later
 * work). One authorization nuance is worth being explicit about rather than
 * leaving wide open: `DRAFT -> SUBMITTED` is the *student's own* action; every
 * other transition (review, approval, embargo, publish) is staff-only
 * (FACULTY as supervisor, LIBRARIAN, ADMIN). That split is enforced here in
 * the handler, not via a single static `@Roles(...)`, because the legal actor
 * depends on the target state.
 */
@Controller('api/thesis-submissions')
@UseGuards(JwtAuthGuard, LoadMemberGuard)
export class ThesisSubmissionController {
  constructor(
    private readonly thesisSubmissionService: ThesisSubmissionService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(Role.STUDENT)
  @UseGuards(RolesGuard)
  async createDraft(
    @Body() body: CreateThesisSubmissionRequestDto,
    @CurrentMember() member: Member,
  ): Promise<ThesisSubmissionResponse> {
    const submission = await this.thesisSubmissionService.createDraft({
      studentMemberId: member.id,
      degreeType: body.degreeType,
    });
    return toThesisSubmissionResponse(submission);
  }

  @Post(':id/transition')
  async transition(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: TransitionThesisSubmissionRequestDto,
    @CurrentMember() member: Member,
  ): Promise<ThesisSubmissionResponse> {
    const existing = await this.prisma.thesisSubmission.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`ThesisSubmission ${id.toString()} was not found.`);
    }

    const isStaff = member.role === Role.FACULTY || member.role === Role.LIBRARIAN || member.role === Role.ADMIN;
    if (body.to === SubmissionStatus.SUBMITTED) {
      const isOwningStudent = member.role === Role.STUDENT && existing.studentMemberId === member.id;
      if (!isOwningStudent) {
        throw new ForbiddenException('Only the submitting student may submit their own draft.');
      }
    } else if (!isStaff) {
      throw new ForbiddenException('Only a supervisor or librarian may make this transition.');
    }

    const submission = await this.thesisSubmissionService.transition(id, body.to);
    return toThesisSubmissionResponse(submission);
  }
}
