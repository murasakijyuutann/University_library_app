import {
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role, type Member } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../security/jwt/jwt-auth.guard';
import { LoadMemberGuard } from '../../member/guard/load-member.guard';
import { CurrentMember } from '../../member/current-member.decorator';
import { ParseBigIntPipe } from '../../common/pipe/parse-bigint.pipe';
import { AccessPolicyResolver } from '../../resource/service/access-policy.resolver';
import { ResourceService } from '../../resource/service/resource.service';
import { LoanService } from '../service/loan.service';
import { BorrowRequestDto } from '../dto/borrow-request.dto';
import { LoanResponse, toLoanResponse } from '../dto/loan-response.dto';

const DEFAULT_LOAN_DURATION_DAYS = 14;

@Controller('api/loans')
@UseGuards(JwtAuthGuard, LoadMemberGuard)
export class LoanController {
  constructor(
    private readonly loanService: LoanService,
    private readonly resourceService: ResourceService,
    private readonly accessPolicyResolver: AccessPolicyResolver,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async borrow(
    @Body() body: BorrowRequestDto,
    @CurrentMember() member: Member,
  ): Promise<LoanResponse> {
    const bookId = BigInt(body.bookId);
    const resource = await this.resourceService.findById(bookId);
    if (!resource) {
      throw new NotFoundException(`Resource ${body.bookId} was not found.`);
    }
    const decision = await this.accessPolicyResolver.resolve(
      { id: member.id, faculty: member.faculty },
      resource,
    );
    if (!decision.allowed) {
      throw new ForbiddenException(decision.reason);
    }

    const durationDays = body.loanDurationDays ?? DEFAULT_LOAN_DURATION_DAYS;
    const dueAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);
    const loan = await this.loanService.borrowCopy(bookId, member.id, dueAt);
    return toLoanResponse(loan);
  }

  @Post(':id/return')
  async returnLoan(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentMember() member: Member,
  ): Promise<LoanResponse> {
    const existing = await this.prisma.loan.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Loan ${id.toString()} was not found.`);
    }
    const isOwner = existing.memberId === member.id;
    const isStaff = member.role === Role.LIBRARIAN || member.role === Role.ADMIN;
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('You may only return your own loans.');
    }

    const loan = await this.loanService.returnLoan(id);
    return toLoanResponse(loan);
  }
}
