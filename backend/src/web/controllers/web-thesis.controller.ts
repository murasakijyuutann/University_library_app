import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { DegreeType, Member } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Request, Response } from 'express';
import { LoadMemberGuard } from '../../member/guard/load-member.guard';
import { CurrentMember } from '../../member/current-member.decorator';
import { ParseBigIntPipe } from '../../common/pipe/parse-bigint.pipe';
import { ThesisSubmissionService } from '../../thesis/service/thesis-submission.service';
import { WebAuthGuard } from '../guards/web-auth.guard';

class CreateThesisDraftDto {
  @IsOptional()
  @IsEnum(DegreeType)
  degreeType?: DegreeType;

  @IsOptional()
  @IsString()
  _csrf?: string;
}

@Controller('thesis-submissions')
@UseGuards(WebAuthGuard, LoadMemberGuard)
export class WebThesisController {
  constructor(private readonly thesisSubmissionService: ThesisSubmissionService) {}

  @Get('new')
  @Render('thesis/new')
  newForm(@Req() req: Request) {
    return {
      title: 'New thesis submission',
      csrfToken: req.res?.locals.csrfToken,
      degreeTypes: Object.values(DegreeType),
    };
  }

  @Post()
  async create(
    @Body() body: CreateThesisDraftDto,
    @CurrentMember() member: Member,
    @Res() res: Response,
  ): Promise<void> {
    const submission = await this.thesisSubmissionService.createDraft({
      studentMemberId: member.id,
      degreeType: body.degreeType,
    });
    res.redirect(303, `/thesis-submissions/${submission.id.toString()}`);
  }

  @Get(':id')
  @Render('thesis/detail')
  async detail(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Req() req: Request,
    @CurrentMember() member: Member,
  ) {
    const submission = await this.thesisSubmissionService.findById(id);
    if (!submission) {
      throw new NotFoundException(`ThesisSubmission ${id.toString()} was not found.`);
    }
    if (submission.studentMemberId !== member.id) {
      throw new ForbiddenException('You may only view your own thesis submissions.');
    }
    return {
      title: 'Thesis submission',
      csrfToken: req.res?.locals.csrfToken,
      submission: {
        id: submission.id.toString(),
        status: submission.submissionStatus,
        degreeType: submission.degreeType,
      },
    };
  }
}
