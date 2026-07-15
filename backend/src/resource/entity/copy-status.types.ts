/** Mirrors the Prisma `CopyStatus` enum as a plain TS union for consumers that
 * shouldn't import generated Prisma types directly (e.g. the search API
 * boundary, and later the frontend). Kept in sync with prisma/schema.prisma by
 * hand — there are only four members, so drift is cheap to catch in review. */
export type CopyStatus = 'AVAILABLE' | 'ON_LOAN' | 'RESERVED' | 'LOST';
