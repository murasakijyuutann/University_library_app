import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MemberType, Role } from '@prisma/client';

/**
 * DEV ONLY — the request shape for the mock IdP's fake token issuance. A real
 * IdP would never accept "log in as whoever you say you are"; this exists
 * purely to make the SSO-relying-party boundary runnable locally (see
 * mock-idp.controller.ts and project-structure_v3.md §2.2).
 */
export class MockTokenRequestDto {
  @IsString()
  sub!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsEnum(MemberType)
  memberType?: MemberType;
}
