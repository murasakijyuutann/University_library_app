import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FacetCount,
  FacetDimension,
  FacetFilter,
  ResourceSummaryDto,
  SearchQuery,
  SearchResults,
  UnifiedSearchService,
  clampPagination,
} from '../api';
import { catalogAccessStatus } from './catalog-access-status';

/**
 * Postgres FTS backing for UnifiedSearchService (Phase 5.2, build-guide.md).
 * Translates plain SearchQuery.text via plainto_tsquery + unaccent — callers
 * never see tsquery syntax or ts_rank scores.
 */
@Injectable()
export class PostgresFtsSearchService implements UnifiedSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: SearchQuery): Promise<SearchResults> {
    const page = clampPagination(query.page);
    const text = query.text.trim();
    const filters = query.filters;

    const whereSql = this.buildWhereSql(text, filters);

    const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM resource r
      LEFT JOIN physical_book pb ON pb.id = r.id
      LEFT JOIN thesis t ON t.id = r.id
      LEFT JOIN journal_article ja ON ja.id = r.id
      LEFT JOIN research_report rr ON rr.id = r.id
      LEFT JOIN rare_material rm ON rm.id = r.id
      WHERE ${whereSql}
    `;
    const totalMatches = Number(countRows[0]?.count ?? 0n);

    const offset = (page.page - 1) * page.size;
    const rows =
      text.length > 0
        ? await this.prisma.$queryRaw<SearchRow[]>`
            SELECT
              r.id,
              r."resourceType" AS "resourceType",
              r.title,
              r.department,
              r."createdAt" AS "createdAt",
              pb.isbn,
              pb.author,
              pb."publicationYear" AS "publicationYear",
              t."degreeType" AS "degreeType",
              t."embargoUntil" AS "embargoUntil",
              ja.doi,
              ja.volume,
              ja.issue,
              rr."departmentScope" AS "departmentScope",
              rr."reportYear" AS "reportYear",
              rm."readingRoomOnly" AS "readingRoomOnly",
              COALESCE(pb."publicationYear", rr."reportYear", EXTRACT(YEAR FROM r."createdAt")::int) AS year
            FROM resource r
            LEFT JOIN physical_book pb ON pb.id = r.id
            LEFT JOIN thesis t ON t.id = r.id
            LEFT JOIN journal_article ja ON ja.id = r.id
            LEFT JOIN research_report rr ON rr.id = r.id
            LEFT JOIN rare_material rm ON rm.id = r.id
            WHERE ${whereSql}
            ORDER BY ts_rank(
              to_tsvector('english', library_unaccent(
                coalesce(r.title, '') || ' ' || coalesce(r.description, '')
              )),
              plainto_tsquery('english', library_unaccent(${text}))
            ) DESC, r."updatedAt" DESC, r.id DESC
            LIMIT ${page.size} OFFSET ${offset}
          `
        : await this.prisma.$queryRaw<SearchRow[]>`
            SELECT
              r.id,
              r."resourceType" AS "resourceType",
              r.title,
              r.department,
              r."createdAt" AS "createdAt",
              pb.isbn,
              pb.author,
              pb."publicationYear" AS "publicationYear",
              t."degreeType" AS "degreeType",
              t."embargoUntil" AS "embargoUntil",
              ja.doi,
              ja.volume,
              ja.issue,
              rr."departmentScope" AS "departmentScope",
              rr."reportYear" AS "reportYear",
              rm."readingRoomOnly" AS "readingRoomOnly",
              COALESCE(pb."publicationYear", rr."reportYear", EXTRACT(YEAR FROM r."createdAt")::int) AS year
            FROM resource r
            LEFT JOIN physical_book pb ON pb.id = r.id
            LEFT JOIN thesis t ON t.id = r.id
            LEFT JOIN journal_article ja ON ja.id = r.id
            LEFT JOIN research_report rr ON rr.id = r.id
            LEFT JOIN rare_material rm ON rm.id = r.id
            WHERE ${whereSql}
            ORDER BY r."updatedAt" DESC, r.id DESC
            LIMIT ${page.size} OFFSET ${offset}
          `;

    const results = rows.map((row) => this.toSummary(row));
    const facets = await this.computeFacets(text, filters);

    return { results, totalMatches, facets, page };
  }

  private buildWhereSql(text: string, filters: ReadonlyArray<FacetFilter>): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];

    if (text.length > 0) {
      parts.push(Prisma.sql`(
        to_tsvector('english', library_unaccent(
          coalesce(r.title, '') || ' ' || coalesce(r.description, '')
          || ' ' || coalesce(pb.author, '') || ' ' || coalesce(pb.isbn, '')
          || ' ' || coalesce(ja.doi, '')
        )) @@ plainto_tsquery('english', library_unaccent(${text}))
      )`);
    }

    for (const filter of filters) {
      parts.push(this.filterSql(filter));
    }

    return Prisma.join(parts, ' AND ');
  }

  private filterSql(filter: FacetFilter): Prisma.Sql {
    switch (filter.dimension) {
      case FacetDimension.RESOURCE_TYPE:
        return Prisma.sql`r."resourceType" = ${filter.value}::"ResourceType"`;
      case FacetDimension.DEPARTMENT:
        return Prisma.sql`r.department = ${filter.value}`;
      case FacetDimension.YEAR:
        return Prisma.sql`COALESCE(pb."publicationYear", rr."reportYear", EXTRACT(YEAR FROM r."createdAt")::int) = ${Number.parseInt(filter.value, 10)}`;
      case FacetDimension.LANGUAGE:
        // Catalog is English-only by design (stack-decision); no language column yet.
        return filter.value === 'en' ? Prisma.sql`TRUE` : Prisma.sql`FALSE`;
      case FacetDimension.DEGREE_TYPE:
        return Prisma.sql`t."degreeType" = ${filter.value}::"DegreeType"`;
      case FacetDimension.ACCESS_STATUS:
        return this.accessStatusFilterSql(filter.value);
      default:
        return Prisma.sql`TRUE`;
    }
  }

  private accessStatusFilterSql(value: string): Prisma.Sql {
    switch (value) {
      case 'AVAILABLE':
        return Prisma.sql`(
          (r."resourceType" = 'PHYSICAL_BOOK')
          OR (r."resourceType" = 'THESIS' AND (t."embargoUntil" IS NULL OR t."embargoUntil" <= CURRENT_DATE))
          OR (r."resourceType" = 'RESEARCH_REPORT' AND rr."departmentScope" IS NULL)
        )`;
      case 'EMBARGOED':
        return Prisma.sql`(r."resourceType" = 'THESIS' AND t."embargoUntil" IS NOT NULL AND t."embargoUntil" > CURRENT_DATE)`;
      case 'LICENSE_GATED':
        return Prisma.sql`r."resourceType" = 'JOURNAL_ARTICLE'`;
      case 'DEPARTMENT_SCOPED':
        return Prisma.sql`(r."resourceType" = 'RESEARCH_REPORT' AND rr."departmentScope" IS NOT NULL)`;
      case 'SUPERVISED_ONLY':
        return Prisma.sql`r."resourceType" = 'RARE_MATERIAL'`;
      default:
        return Prisma.sql`FALSE`;
    }
  }

  private async computeFacets(
    text: string,
    filters: ReadonlyArray<FacetFilter>,
  ): Promise<FacetCount[]> {
    // Facets are computed over the text-matched set with other dimensions still
    // applied — except the dimension being counted (standard faceted-search UX).
    const facets: FacetCount[] = [];

    for (const dimension of Object.values(FacetDimension)) {
      const filtersSansDimension = filters.filter((f) => f.dimension !== dimension);
      const whereSql = this.buildWhereSql(text, filtersSansDimension);

      const rows = await this.prisma.$queryRaw<Array<{ value: string; count: bigint }>>`
        SELECT ${this.facetValueExpr(dimension)} AS value, COUNT(*)::bigint AS count
        FROM resource r
        LEFT JOIN physical_book pb ON pb.id = r.id
        LEFT JOIN thesis t ON t.id = r.id
        LEFT JOIN journal_article ja ON ja.id = r.id
        LEFT JOIN research_report rr ON rr.id = r.id
        LEFT JOIN rare_material rm ON rm.id = r.id
        WHERE ${whereSql}
          AND ${this.facetValueExpr(dimension)} IS NOT NULL
        GROUP BY 1
        ORDER BY count DESC, value ASC
      `;

      for (const row of rows) {
        if (row.value === null || row.value === undefined) continue;
        facets.push({
          dimension,
          value: String(row.value),
          count: Number(row.count),
        });
      }
    }

    return facets;
  }

  private facetValueExpr(dimension: FacetDimension): Prisma.Sql {
    switch (dimension) {
      case FacetDimension.RESOURCE_TYPE:
        return Prisma.sql`r."resourceType"::text`;
      case FacetDimension.DEPARTMENT:
        return Prisma.sql`r.department`;
      case FacetDimension.YEAR:
        return Prisma.sql`COALESCE(pb."publicationYear", rr."reportYear", EXTRACT(YEAR FROM r."createdAt")::int)::text`;
      case FacetDimension.LANGUAGE:
        return Prisma.sql`'en'`;
      case FacetDimension.DEGREE_TYPE:
        return Prisma.sql`t."degreeType"::text`;
      case FacetDimension.ACCESS_STATUS:
        return Prisma.sql`(
          CASE
            WHEN r."resourceType" = 'PHYSICAL_BOOK' THEN 'AVAILABLE'
            WHEN r."resourceType" = 'THESIS' AND t."embargoUntil" IS NOT NULL AND t."embargoUntil" > CURRENT_DATE THEN 'EMBARGOED'
            WHEN r."resourceType" = 'THESIS' THEN 'AVAILABLE'
            WHEN r."resourceType" = 'JOURNAL_ARTICLE' THEN 'LICENSE_GATED'
            WHEN r."resourceType" = 'RESEARCH_REPORT' AND rr."departmentScope" IS NOT NULL THEN 'DEPARTMENT_SCOPED'
            WHEN r."resourceType" = 'RESEARCH_REPORT' THEN 'AVAILABLE'
            WHEN r."resourceType" = 'RARE_MATERIAL' THEN 'SUPERVISED_ONLY'
            ELSE 'AVAILABLE'
          END
        )`;
      default:
        return Prisma.sql`NULL`;
    }
  }

  private toSummary(row: SearchRow): ResourceSummaryDto {
    const accessStatus = catalogAccessStatus({
      resourceType: row.resourceType,
      embargoUntil: row.embargoUntil,
      departmentScope: row.departmentScope,
    });
    const id = row.id.toString();
    const base = {
      id,
      title: row.title,
      accessStatus,
      department: row.department,
    };

    switch (row.resourceType) {
      case 'PHYSICAL_BOOK':
        return {
          ...base,
          type: 'PHYSICAL_BOOK',
          detail: {
            isbn: row.isbn,
            author: row.author,
            publicationYear: row.publicationYear,
          },
        };
      case 'THESIS':
        return {
          ...base,
          type: 'THESIS',
          detail: {
            degreeType: row.degreeType,
            embargoUntil: row.embargoUntil
              ? row.embargoUntil.toISOString().slice(0, 10)
              : null,
          },
        };
      case 'JOURNAL_ARTICLE':
        return {
          ...base,
          type: 'JOURNAL_ARTICLE',
          detail: {
            doi: row.doi,
            volume: row.volume,
            issue: row.issue,
          },
        };
      case 'RESEARCH_REPORT':
        return {
          ...base,
          type: 'RESEARCH_REPORT',
          detail: {
            departmentScope: row.departmentScope,
            reportYear: row.reportYear,
          },
        };
      case 'RARE_MATERIAL':
        return {
          ...base,
          type: 'RARE_MATERIAL',
          detail: {
            readingRoomOnly: row.readingRoomOnly ?? true,
          },
        };
      default:
        return {
          ...base,
          type: 'PHYSICAL_BOOK',
          detail: { isbn: null, author: null, publicationYear: null },
        };
    }
  }
}

interface SearchRow {
  id: bigint;
  resourceType: string;
  title: string;
  department: string | null;
  createdAt: Date;
  isbn: string | null;
  author: string | null;
  publicationYear: number | null;
  degreeType: string | null;
  embargoUntil: Date | null;
  doi: string | null;
  volume: string | null;
  issue: string | null;
  departmentScope: string | null;
  reportYear: number | null;
  readingRoomOnly: boolean | null;
  year: number | null;
}
