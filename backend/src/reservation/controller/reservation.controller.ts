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
import { ReservationQueueService } from '../service/reservation-queue.service';
import { EnqueueReservationRequestDto } from '../dto/enqueue-reservation-request.dto';
import { ReservationResponse, toReservationResponse } from '../dto/reservation-response.dto';

@Controller('api/reservations')
@UseGuards(JwtAuthGuard, LoadMemberGuard)
export class ReservationController {
  constructor(
    private readonly reservationQueueService: ReservationQueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async enqueue(
    @Body() body: EnqueueReservationRequestDto,
    @CurrentMember() member: Member,
  ): Promise<ReservationResponse> {
    const reservation = await this.reservationQueueService.enqueue(
      BigInt(body.resourceId),
      member.id,
    );
    return toReservationResponse(reservation);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentMember() member: Member,
  ): Promise<ReservationResponse> {
    const existing = await this.prisma.reservation.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Reservation ${id.toString()} was not found.`);
    }
    const isOwner = existing.memberId === member.id;
    const isStaff = member.role === Role.LIBRARIAN || member.role === Role.ADMIN;
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('You may only cancel your own reservations.');
    }

    const reservation = await this.reservationQueueService.cancel(id);
    return toReservationResponse(reservation);
  }
}
