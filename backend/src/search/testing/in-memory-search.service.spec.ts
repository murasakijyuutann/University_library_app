import { MAX_PAGE_SIZE } from '../api';
import { InMemorySearchDocument, InMemorySearchService } from './in-memory-search.service';
import { registerUnifiedSearchContractTests } from './unified-search.contract-tests';

const CORPUS: InMemorySearchDocument[] = [
  {
    summary: {
      id: '1',
      type: 'PHYSICAL_BOOK',
      title: 'Introduction to Algorithms',
      accessStatus: 'AVAILABLE',
      department: 'Computer Science',
      detail: {
        isbn: '9780262046305',
        author: 'Cormen',
        publicationYear: 2022,
      },
    },
    searchableText: 'Introduction to Algorithms Cormen 9780262046305',
    year: 2022,
    language: 'en',
    degreeType: null,
  },
  {
    summary: {
      id: '2',
      type: 'JOURNAL_ARTICLE',
      title: 'Deep Learning Survey',
      accessStatus: 'LICENSE_GATED',
      department: 'Computer Science',
      detail: { doi: '10.1000/dl', volume: '12', issue: '3' },
    },
    searchableText: 'Deep Learning Survey 10.1000/dl',
    year: 2024,
    language: 'en',
    degreeType: null,
  },
  {
    summary: {
      id: '3',
      type: 'RARE_MATERIAL',
      title: 'Medieval Manuscript',
      accessStatus: 'SUPERVISED_ONLY',
      department: 'History',
      detail: { readingRoomOnly: true },
    },
    searchableText: 'Medieval Manuscript',
    year: 2020,
    language: 'en',
    degreeType: null,
  },
  {
    summary: {
      id: '4',
      type: 'THESIS',
      title: 'Algorithms for Graphs',
      accessStatus: 'AVAILABLE',
      department: 'Computer Science',
      detail: { degreeType: 'PHD', embargoUntil: null },
    },
    searchableText: 'Algorithms for Graphs',
    year: 2023,
    language: 'en',
    degreeType: 'PHD',
  },
];

describe('InMemorySearchService (Phase 5.3)', () => {
  const service = new InMemorySearchService(CORPUS);

  registerUnifiedSearchContractTests({
    getService: () => service,
    knownTitleFragment: 'Algorithms',
    knownResourceType: 'PHYSICAL_BOOK',
  });

  it('clamps oversized size identically to the contract helper', async () => {
    const result = await service.search({
      text: '',
      filters: [],
      page: { page: 1, size: 999 },
    });
    expect(result.page.size).toBe(MAX_PAGE_SIZE);
  });
});
