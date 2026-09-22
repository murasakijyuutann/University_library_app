import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { DegreeType, Member, SubmissionStatus } from '@prisma/client';
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

class ConfirmUploadDto {
  @IsString()
  key!: string;

  @IsOptional()
  @IsString()
  _csrf?: string;
}

class SubmitThesisDto {
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
    const submission = await this.requireOwned(id, member);
    return {
      title: 'Thesis submission',
      csrfToken: req.res?.locals.csrfToken,
      alert: req.query.alert as string | undefined,
      submission: {
        id: submission.id.toString(),
        status: submission.submissionStatus,
        degreeType: submission.degreeType,
        filePath: submission.filePath,
        version: submission.version.toString(),
        canUpload: submission.submissionStatus === SubmissionStatus.DRAFT,
        canSubmit:
          submission.submissionStatus === SubmissionStatus.DRAFT &&
          Boolean(submission.filePath),
      },
    };
  }

  /** JSON: issue a presigned PUT URL for the browser upload module. */
  @Post(':id/upload-url')
  async uploadUrl(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentMember() member: Member,
    @Query('contentType') contentType = 'application/pdf',
  ) {
    await this.requireOwned(id, member);
    const upload = await this.thesisSubmissionService.createUploadUrl(
      id,
      contentType,
    );
    return {
      key: upload.key,
      uploadUrl: upload.uploadUrl,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }

  @Post(':id/confirm-upload')
  async confirmUpload(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: ConfirmUploadDto,
    @CurrentMember() member: Member,
    @Res() res: Response,
  ): Promise<void> {
    await this.requireOwned(id, member);
    await this.thesisSubmissionService.confirmUpload(id, body.key);
    res.redirect(303, `/thesis-submissions/${id.toString()}?alert=uploaded`);
  }

  @Post(':id/submit')
  async submit(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() _body: SubmitThesisDto,
    @CurrentMember() member: Member,
    @Res() res: Response,
  ): Promise<void> {
    await this.requireOwned(id, member);
    await this.thesisSubmissionService.transition(id, SubmissionStatus.SUBMITTED);
    res.redirect(303, `/thesis-submissions/${id.toString()}?alert=submitted`);
  }

  private async requireOwned(id: bigint, member: Member) {
    const submission = await this.thesisSubmissionService.findById(id);
    if (!submission) {
      throw new NotFoundException(`ThesisSubmission ${id.toString()} was not found.`);
    }
    if (submission.studentMemberId !== member.id) {
      throw new ForbiddenException('You may only manage your own thesis submissions.');
    }
    return submission;
  }
}
