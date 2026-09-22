import { ResourcePresenter } from './resource.presenter';
import { RESOURCE_TEMPLATE } from '../view-models/resource-page.view-model';
import { ResourceEntity } from '../../resource/entity/resource.types';

describe('ResourcePresenter (Phase 6.2)', () => {
  const presenter = new ResourcePresenter();

  const base = {
    id: BigInt(1),
    title: 'Sample',
    description: null,
    department: 'Computer Science',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  const cases: ResourceEntity[] = [
    {
      ...base,
      resourceType: 'PHYSICAL_BOOK',
      detail: {
        isbn: '1',
        author: 'A',
        publisher: null,
        publicationYear: 2020,
        callNumber: null,
      },
    },
    {
      ...base,
      resourceType: 'THESIS',
      detail: {
        studentMemberId: BigInt(9),
        degreeType: 'PHD',
        embargoUntil: null,
      },
    },
    {
      ...base,
      resourceType: 'JOURNAL_ARTICLE',
      detail: {
        doi: '10.1/x',
        volume: '1',
        issue: '2',
        pageRange: null,
        journalId: null,
        licenseId: null,
      },
    },
    {
      ...base,
      resourceType: 'RESEARCH_REPORT',
      detail: { departmentScope: 'Engineering', reportYear: 2021 },
    },
    {
      ...base,
      resourceType: 'RARE_MATERIAL',
      detail: { readingRoomOnly: true, handlingNotes: null },
    },
  ];

  it.each(cases)('maps $resourceType to an exhaustive template', (entity) => {
    const vm = presenter.toPageViewModel(entity);
    expect(vm.type).toBe(entity.resourceType);
    expect(presenter.templateFor(vm)).toBe(RESOURCE_TEMPLATE[vm.type]);
    expect(vm.detailUrl).toBe(`/resources/${entity.id.toString()}`);
  });

  it('RESOURCE_TEMPLATE covers every ResourcePageViewModel type', () => {
    const keys = Object.keys(RESOURCE_TEMPLATE).sort();
    expect(keys).toEqual([
      'JOURNAL_ARTICLE',
      'PHYSICAL_BOOK',
      'RARE_MATERIAL',
      'RESEARCH_REPORT',
      'THESIS',
    ]);
  });
});
