import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Member } from '@prisma/client';
import { Request, Response } from 'express';
import { IsOptional, IsString, Matches } from 'class-validator';
import { LoadMemberGuard } from '../../member/guard/load-member.guard';
import { CurrentMember } from '../../member/current-member.decorator';
import { ParseBigIntPipe } from '../../common/pipe/parse-bigint.pipe';
import { ResourceService } from '../../resource/service/resource.service';
import { AccessPolicyResolver } from '../../resource/service/access-policy.resolver';
import { LoanService } from '../../loan/service/loan.service';
import { ReservationQueueService } from '../../reservation/service/reservation-queue.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConcurrentModificationException } from '../../common/exception/concurrent-modification.exception';
import { NoAvailableCopyException } from '../../common/exception/no-available-copy.exception';
import { WebAuthGuard } from '../guards/web-auth.guard';
import { ResourcePresenter } from '../presenters/resource.presenter';
import { LoanPolicyService } from '../../loan/service/loan-policy.service';

class BorrowFormDto {
  /** Optimistic concurrency token from the selected copy. */
  @Matches(/^\d+$/)
  copyVersion!: string;

  @Matches(/^\d+$/)
  copyId!: string;

  @IsOptional()
  @IsString()
  _csrf?: string;
}

class ReserveFormDto {
  @IsOptional()
  @IsString()
  _csrf?: string;
}

@Controller('resources')
export class WebResourceController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly accessPolicyResolver: AccessPolicyResolver,
    private readonly loanService: LoanService,
    private readonly reservationQueueService: ReservationQueueService,
    private readonly prisma: PrismaService,
    private readonly resourcePresenter: ResourcePresenter,
    private readonly loanPolicyService: LoanPolicyService,
  ) {}

  @Get(':id')
  async detail(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const entity = await this.resourceService.findById(id);
    if (!entity) {
      throw new NotFoundException(`Resource ${id.toString()} was not found.`);
    }
    const viewModel = this.resourcePresenter.toPageViewModel(entity);
    const template = this.resourcePresenter.templateFor(viewModel);

    let availableCopy: { id: string; version: string } | null = null;
    if (entity.resourceType === 'PHYSICAL_BOOK') {
      const copy = await this.prisma.resourceCopy.findFirst({
        where: { bookId: id, status: 'AVAILABLE' },
        orderBy: { id: 'asc' },
      });
      if (copy) {
        availableCopy = {
          id: copy.id.toString(),
          version: copy.version.toString(),
        };
      }
    }

    const alert = req.query.alert as string | undefined;
    res.render(template, {
      title: viewModel.title,
      csrfToken: req.res?.locals.csrfToken,
      resource: viewModel,
      availableCopy,
      alert,
      showHoldPoll: alert === 'reserved' || alert === 'conflict',
      returnPath: `/resources/${id.toString()}`,
    });
  }

  /**
   * HTMX partial: current queue position for the signed-in member.
   * Polls without a SPA — same ReservationQueueService as enqueue.
   */
  @Get(':id/hold-status')
  @UseGuards(WebAuthGuard, LoadMemberGuard)
  async holdStatus(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentMember() member: Member,
    @Res() res: Response,
  ): Promise<void> {
    const hold = await this.reservationQueueService.findActiveForMember(
      id,
      member.id,
    );
    res.render('resources/hold-status', {
      layout: false,
      resourceId: id.toString(),
      hold: hold
        ? {
            id: hold.id.toString(),
            position: hold.queuePosition,
            status: hold.status,
          }
        : null,
    });
  }

  @Post(':id/borrow')
  @UseGuards(WebAuthGuard, LoadMemberGuard)
  async borrow(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() body: BorrowFormDto,
    @CurrentMember() member: Member,
    @Res() res: Response,
  ): Promise<void> {
    const entity = await this.resourceService.findById(id);
    if (!entity) {
      throw new NotFoundException(`Resource ${id.toString()} was not found.`);
    }
    const decision = await this.accessPolicyResolver.resolve(
      { id: member.id, faculty: member.faculty },
      entity,
    );
    if (!decision.allowed) {
      res.redirect(303, `/resources/${id.toString()}?alert=access-denied`);
      return;
    }

    const copyId = BigInt(body.copyId);
    const submittedVersion = BigInt(body.copyVersion);
    const copy = await this.prisma.resourceCopy.findUnique({ where: { id: copyId } });
    if (!copy || copy.bookId !== id) {
      throw new NotFoundException('Copy was not found for this book.');
    }
    if (copy.version !== submittedVersion || copy.status !== 'AVAILABLE') {
      throw new ConflictException({
        message: 'This copy changed since the page was loaded. Refresh and try again.',
        returnTo: `/resources/${id.toString()}`,
      });
    }

    try {
      const policy = await this.loanPolicyService.requireByMemberType(
        member.memberType,
      );
      const dueAt = new Date(
        Date.now() + policy.loanDurationDays * 24 * 60 * 60 * 1000,
      );
      await this.loanService.borrowCopy(id, member.id, dueAt);
      res.redirect(303, `/resources/${id.toString()}?alert=borrowed`);
    } catch (error) {
      if (
        error instanceof NoAvailableCopyException ||
        error instanceof ConcurrentModificationException
      ) {
        throw new ConflictException({
          message:
            'Someone else borrowed or changed this copy first. Refresh and try again.',
          returnTo: `/resources/${id.toString()}`,
        });
      }
      throw error;
    }
  }

  @Post(':id/reserve')
  @UseGuards(WebAuthGuard, LoadMemberGuard)
  async reserve(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() _body: ReserveFormDto,
    @CurrentMember() member: Member,
    @Res() res: Response,
  ): Promise<void> {
    const entity = await this.resourceService.findById(id);
    if (!entity) {
      throw new NotFoundException(`Resource ${id.toString()} was not found.`);
    }
    const decision = await this.accessPolicyResolver.resolve(
      { id: member.id, faculty: member.faculty },
      entity,
    );
    if (!decision.allowed) {
      throw new ConflictException({
        message: decision.reason,
        returnTo: `/resources/${id.toString()}`,
      });
    }

    await this.reservationQueueService.enqueue(id, member.id);
    res.redirect(303, `/resources/${id.toString()}?alert=reserved`);
  }
}
