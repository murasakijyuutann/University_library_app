import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitIllRequestDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  doiOrIsbn?: string;

  @IsOptional()
  @IsString()
  justification?: string;
}
