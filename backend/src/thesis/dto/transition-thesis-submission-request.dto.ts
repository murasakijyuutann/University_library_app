import { SubmissionStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class TransitionThesisSubmissionRequestDto {
  @IsEnum(SubmissionStatus)
  to!: SubmissionStatus;
}
