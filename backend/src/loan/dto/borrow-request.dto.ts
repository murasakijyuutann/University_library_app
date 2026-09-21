import { Matches, IsOptional, IsInt, Min } from 'class-validator';

export class BorrowRequestDto {
  /** A PhysicalBook's Resource id — accepted as a numeric string. */
  @Matches(/^\d+$/, { message: 'bookId must be a numeric string.' })
  bookId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  loanDurationDays?: number;
}
