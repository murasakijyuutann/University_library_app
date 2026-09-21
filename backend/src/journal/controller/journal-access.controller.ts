import { Controller, Get, NotFoundException, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { type Member } from '@prisma/client';
import { JwtAuthGuard } from '../../security/jwt/jwt-auth.guard';
import { LoadMemberGuard } from '../../member/guard/load-member.guard';
import { CurrentMember } from '../../member/current-member.decorator';
import { ParseBigIntPipe } from '../../common/pipe/parse-bigint.pipe';
import { ResourceService } from '../../resource/service/resource.service';
import { AccessPolicyResolver } from '../../resource/service/access-policy.resolver';
import { AccessDecision } from '../../resource/entity/access-decision.types';

/**
 * `GET /api/journals/:id/resolve` (project-structure_v3.md §2.7) — the
 * license-and-scope check a real link resolver performs before handing off to
 * the publisher. `LinkResolverService` (the simulated resolver/proxy hop
 * itself) is NOT built yet, so this deliberately returns only the access
 * decision — not a fake redirect URL — rather than fabricating the next step.
 */
@Controller('api/journals')
@UseGuards(JwtAuthGuard, LoadMemberGuard)
export class JournalAccessController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly accessPolicyResolver: AccessPolicyResolver,
  ) {}

  @Get(':id/resolve')
  async resolve(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentMember() member: Member,
  ): Promise<AccessDecision> {
    const resource = await this.resourceService.findById(id);
    if (!resource) {
      throw new NotFoundException(`Resource ${id.toString()} was not found.`);
    }
    if (resource.resourceType !== 'JOURNAL_ARTICLE') {
      throw new BadRequestException(`Resource ${id.toString()} is not a JournalArticle.`);
    }

    return this.accessPolicyResolver.resolve({ id: member.id, faculty: member.faculty }, resource);
  }
}
