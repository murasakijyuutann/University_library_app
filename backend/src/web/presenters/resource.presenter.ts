import { Injectable } from '@nestjs/common';
import { ResourceEntity, assertUnreachable } from '../../resource/entity/resource.types';
import { ResourceSummaryDto } from '../../search/api';
import { catalogAccessStatus } from '../../search/service/catalog-access-status';
import {
  ResourcePageViewModel,
  RESOURCE_TEMPLATE,
} from '../view-models/resource-page.view-model';

@Injectable()
export class ResourcePresenter {
  toPageViewModel(entity: ResourceEntity): ResourcePageViewModel {
    const accessStatus = catalogAccessStatus({
      resourceType: entity.resourceType,
      embargoUntil:
        entity.resourceType === 'THESIS' ? entity.detail.embargoUntil : null,
      departmentScope:
        entity.resourceType === 'RESEARCH_REPORT'
          ? entity.detail.departmentScope
          : null,
    });
    const base = {
      id: entity.id.toString(),
      title: entity.title,
      department: entity.department,
      accessStatus,
      accessStatusLabel: labelForAccess(accessStatus),
      accessStatusTone: toneForAccess(accessStatus),
      detailUrl: `/resources/${entity.id.toString()}`,
    };

    switch (entity.resourceType) {
      case 'PHYSICAL_BOOK':
        return {
          ...base,
          type: 'PHYSICAL_BOOK',
          typeLabel: 'Physical book',
          isbn: entity.detail.isbn,
          author: entity.detail.author,
          publicationYear: entity.detail.publicationYear,
          canBorrow: accessStatus === 'AVAILABLE',
          canReserve: accessStatus === 'AVAILABLE',
        };
      case 'THESIS':
        return {
          ...base,
          type: 'THESIS',
          typeLabel: 'Thesis',
          degreeType: entity.detail.degreeType,
          embargoUntil: entity.detail.embargoUntil
            ? entity.detail.embargoUntil.toISOString().slice(0, 10)
            : null,
        };
      case 'JOURNAL_ARTICLE':
        return {
          ...base,
          type: 'JOURNAL_ARTICLE',
          typeLabel: 'Journal article',
          doi: entity.detail.doi,
          volume: entity.detail.volume,
          issue: entity.detail.issue,
        };
      case 'RESEARCH_REPORT':
        return {
          ...base,
          type: 'RESEARCH_REPORT',
          typeLabel: 'Research report',
          departmentScope: entity.detail.departmentScope,
          reportYear: entity.detail.reportYear,
        };
      case 'RARE_MATERIAL':
        return {
          ...base,
          type: 'RARE_MATERIAL',
          typeLabel: 'Rare material',
          readingRoomOnly: entity.detail.readingRoomOnly,
        };
      default:
        return assertUnreachable(entity);
    }
  }

  toSummaryViewModel(summary: ResourceSummaryDto): ResourcePageViewModel {
    const accessStatusLabel = labelForAccess(summary.accessStatus);
    const accessStatusTone = toneForAccess(summary.accessStatus);
    const base = {
      id: summary.id,
      title: summary.title,
      department: summary.department,
      accessStatus: summary.accessStatus,
      accessStatusLabel,
      accessStatusTone,
      detailUrl: `/resources/${summary.id}`,
    };

    switch (summary.type) {
      case 'PHYSICAL_BOOK':
        return {
          ...base,
          type: 'PHYSICAL_BOOK',
          typeLabel: 'Physical book',
          isbn: summary.detail.isbn,
          author: summary.detail.author,
          publicationYear: summary.detail.publicationYear,
          canBorrow: summary.accessStatus === 'AVAILABLE',
          canReserve: summary.accessStatus === 'AVAILABLE',
        };
      case 'THESIS':
        return {
          ...base,
          type: 'THESIS',
          typeLabel: 'Thesis',
          degreeType: summary.detail.degreeType,
          embargoUntil: summary.detail.embargoUntil,
        };
      case 'JOURNAL_ARTICLE':
        return {
          ...base,
          type: 'JOURNAL_ARTICLE',
          typeLabel: 'Journal article',
          doi: summary.detail.doi,
          volume: summary.detail.volume,
          issue: summary.detail.issue,
        };
      case 'RESEARCH_REPORT':
        return {
          ...base,
          type: 'RESEARCH_REPORT',
          typeLabel: 'Research report',
          departmentScope: summary.detail.departmentScope,
          reportYear: summary.detail.reportYear,
        };
      case 'RARE_MATERIAL':
        return {
          ...base,
          type: 'RARE_MATERIAL',
          typeLabel: 'Rare material',
          readingRoomOnly: summary.detail.readingRoomOnly,
        };
      default:
        return assertUnreachable(summary);
    }
  }

  templateFor(viewModel: ResourcePageViewModel): string {
    return RESOURCE_TEMPLATE[viewModel.type];
  }
}

function labelForAccess(status: string): string {
  switch (status) {
    case 'AVAILABLE':
      return 'Available';
    case 'LICENSE_GATED':
      return 'License gated';
    case 'EMBARGOED':
      return 'Embargoed';
    case 'SUPERVISED_ONLY':
      return 'Supervised only';
    case 'DEPARTMENT_SCOPED':
      return 'Department scoped';
    default:
      return status;
  }
}

function toneForAccess(status: string): 'ok' | 'warn' | 'block' {
  switch (status) {
    case 'AVAILABLE':
      return 'ok';
    case 'LICENSE_GATED':
    case 'DEPARTMENT_SCOPED':
    case 'EMBARGOED':
      return 'warn';
    default:
      return 'block';
  }
}
