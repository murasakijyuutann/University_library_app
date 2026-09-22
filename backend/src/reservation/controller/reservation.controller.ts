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
import { ReservationQueueService } from '../service/reservation-queue.service';
import { EnqueueReservationRequestDto } from '../dto/enqueue-reservation-request.dto';
import { ReservationResponse, toReservationResponse } from '../dto/reservation-response.dto';
import { Audited } from '../../audit/audited.decorator';

@Controller('api/reservations')
@UseGuards(JwtAuthGuard, LoadMemberGuard)
export class ReservationController {
  constructor(
    private readonly reservationQueueService: ReservationQueueService,
    private readonly resourceService: ResourceService,
    private readonly accessPolicyResolver: AccessPolicyResolver,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Audited({
    entityType: 'Reservation',
    action: 'ENQUEUE',
    entityId: (result) => BigInt((result as ReservationResponse).id),
    newValue: (result) => result,
  })
  async enqueue(
    @Body() body: EnqueueReservationRequestDto,
    @CurrentMember() member: Member,
  ): Promise<ReservationResponse> {
    const resourceId = BigInt(body.resourceId);
    const resource = await this.resourceService.findById(resourceId);
    if (!resource) {
      throw new NotFoundException(`Resource ${body.resourceId} was not found.`);
    }
    const decision = await this.accessPolicyResolver.resolve(
      { id: member.id, faculty: member.faculty },
      resource,
    );
    if (!decision.allowed) {
      throw new ForbiddenException(decision.reason);
    }

    const reservation = await this.reservationQueueService.enqueue(
      resourceId,
      member.id,
    );
    return toReservationResponse(reservation);
  }

  @Post(':id/cancel')
  @Audited({
    entityType: 'Reservation',
    action: 'CANCEL',
    entityId: (result) => BigInt((result as ReservationResponse).id),
    newValue: (result) => result,
  })
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
