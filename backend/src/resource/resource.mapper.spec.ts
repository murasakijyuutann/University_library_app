import {
  toJournalArticleResource,
  toPhysicalBookResource,
} from '../../src/resource/entity/resource.mapper';
import type { JournalArticle, PhysicalBook, Resource } from '@prisma/client';

// Pure unit tests for the Prisma-row -> discriminated-union mapping (no database
// needed — this is exactly the kind of logic that should NOT require Testcontainers).
describe('resource.mapper', () => {
  const baseResource: Resource = {
    id: BigInt(1),
    resourceType: 'PHYSICAL_BOOK',
    title: 'A Book',
    description: null,
    department: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('maps a PhysicalBook row onto the PhysicalBookResource shape', () => {
    const book: PhysicalBook = {
      id: BigInt(1),
      isbn: '123',
      author: 'Author',
      publisher: 'Publisher',
      publicationYear: 2020,
      callNumber: 'QA1',
    };

    const result = toPhysicalBookResource(baseResource, book);

    expect(result.resourceType).toBe('PHYSICAL_BOOK');
    expect(result.detail.isbn).toBe('123');
    expect(result.id).toBe(BigInt(1));
  });

  it('maps a JournalArticle row onto the JournalArticleResource shape', () => {
    const article: JournalArticle = {
      id: BigInt(2),
      doi: '10.1/abc',
      volume: '1',
      issue: '2',
      pageRange: '1-10',
      journalId: null,
      licenseId: null,
    };

    const result = toJournalArticleResource(
      { ...baseResource, id: BigInt(2), resourceType: 'JOURNAL_ARTICLE' },
      article,
    );

    expect(result.resourceType).toBe('JOURNAL_ARTICLE');
    expect(result.detail.doi).toBe('10.1/abc');
  });
});
