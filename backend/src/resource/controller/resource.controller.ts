import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../security/jwt/jwt-auth.guard';
import { Roles } from '../../security/role/roles.decorator';
import { RolesGuard } from '../../security/role/roles.guard';
import { LoadMemberGuard } from '../../member/guard/load-member.guard';
import { CurrentMember } from '../../member/current-member.decorator';
import { ParseBigIntPipe } from '../../common/pipe/parse-bigint.pipe';
import { AccessPolicyResolver } from '../service/access-policy.resolver';
import { ResourceService } from '../service/resource.service';
import { AccessDecision } from '../entity/access-decision.types';
import {
  CreateJournalArticleRequestDto,
  CreatePhysicalBookRequestDto,
  CreateRareMaterialRequestDto,
  CreateResearchReportRequestDto,
  CreateThesisRequestDto,
} from '../dto/create-resource-request.dto';
import { ResourceResponse, toResourceResponse } from '../dto/resource-response.dto';
import type { Member } from '@prisma/client';

/**
 * Thin controllers over the Phase 1-3 domain services (build-guide.md Phase
 * 4.1) — GET routes for discovery/access, POST routes for cataloguing (the
 * librarian-facing side of the own-vs-route model; see
 * data-provenance-and-ingestion_v2.md). All routes require a valid JWT;
 * cataloguing additionally requires LIBRARIAN or ADMIN.
 */
@Controller('api/resources')
@UseGuards(JwtAuthGuard)
export class ResourceController {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly accessPolicyResolver: AccessPolicyResolver,
  ) {}

  @Get(':id')
  async getById(@Param('id', ParseBigIntPipe) id: bigint): Promise<ResourceResponse> {
    const resource = await this.resourceService.findById(id);
    if (!resource) {
      throw new NotFoundException(`Resource ${id.toString()} was not found.`);
    }
    return toResourceResponse(resource);
  }

  @Get(':id/access')
  @UseGuards(LoadMemberGuard)
  async getAccessDecision(
    @Param('id', ParseBigIntPipe) id: bigint,
    @CurrentMember() member: Member,
  ): Promise<AccessDecision> {
    const resource = await this.resourceService.findById(id);
    if (!resource) {
      throw new NotFoundException(`Resource ${id.toString()} was not found.`);
    }
    return this.accessPolicyResolver.resolve({ id: member.id, faculty: member.faculty }, resource);
  }

  @Post('physical-books')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @UseGuards(RolesGuard)
  async createPhysicalBook(@Body() body: CreatePhysicalBookRequestDto): Promise<ResourceResponse> {
    const created = await this.resourceService.createPhysicalBook(body);
    return toResourceResponse(created);
  }

  @Post('theses')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @UseGuards(RolesGuard)
  async createThesis(@Body() body: CreateThesisRequestDto): Promise<ResourceResponse> {
    const created = await this.resourceService.createThesis({
      title: body.title,
      description: body.description,
      department: body.department,
      studentMemberId: BigInt(body.studentMemberId),
      degreeType: body.degreeType,
      embargoUntil: body.embargoUntil ? new Date(body.embargoUntil) : undefined,
    });
    return toResourceResponse(created);
  }

  @Post('journal-articles')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @UseGuards(RolesGuard)
  async createJournalArticle(
    @Body() body: CreateJournalArticleRequestDto,
  ): Promise<ResourceResponse> {
    const created = await this.resourceService.createJournalArticle({
      title: body.title,
      description: body.description,
      department: body.department,
      doi: body.doi,
      volume: body.volume,
      issue: body.issue,
      pageRange: body.pageRange,
      journalId: body.journalId ? BigInt(body.journalId) : undefined,
      licenseId: body.licenseId ? BigInt(body.licenseId) : undefined,
    });
    return toResourceResponse(created);
  }

  @Post('research-reports')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @UseGuards(RolesGuard)
  async createResearchReport(
    @Body() body: CreateResearchReportRequestDto,
  ): Promise<ResourceResponse> {
    const created = await this.resourceService.createResearchReport(body);
    return toResourceResponse(created);
  }

  @Post('rare-materials')
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @UseGuards(RolesGuard)
  async createRareMaterial(@Body() body: CreateRareMaterialRequestDto): Promise<ResourceResponse> {
    const created = await this.resourceService.createRareMaterial(body);
    return toResourceResponse(created);
  }
}
