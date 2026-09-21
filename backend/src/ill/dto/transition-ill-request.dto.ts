import { IllRequestStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class TransitionIllRequestDto {
  @IsEnum(IllRequestStatus)
  to!: IllRequestStatus;
}
