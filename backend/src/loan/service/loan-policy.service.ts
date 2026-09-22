import { Injectable, NotFoundException } from '@nestjs/common';
import { MemberType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LoanPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async requireByMemberType(memberType: MemberType) {
    const policy = await this.prisma.loanPolicy.findUnique({
      where: { memberType },
    });
    if (!policy) {
      throw new NotFoundException(
        `No loan_policy row for member type ${memberType}. Seed policies before circulating.`,
      );
    }
    return policy;
  }
}
