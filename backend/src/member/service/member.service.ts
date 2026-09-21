import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySsoSubjectId(ssoSubjectId: string) {
    return this.prisma.member.findUnique({ where: { ssoSubjectId } });
  }

  async findById(id: bigint) {
    return this.prisma.member.findUnique({ where: { id } });
  }
}
