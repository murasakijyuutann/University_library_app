import { execFileSync } from 'child_process';
import * as path from 'path';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Phase 0.4 (build-guide.md): "Wire Testcontainers-for-Node on day one."
 *
 * Spins up a real, disposable Postgres container, applies the project's actual
 * Prisma migrations against it (`prisma migrate deploy` — not `db push`, so the
 * same migration history that runs in production is what integration tests
 * exercise), and hands back a PrismaService wired to that container (the same
 * type every domain service is injected with in the running app, so tests
 * exercise the real dependency shape). This is the harness every Phase 1+
 * integration test (the hierarchy invariant, the concurrency races) runs
 * against — a mocked Prisma client cannot catch a broken hand-modeled-hierarchy
 * write; only a test against real Postgres can.
 */
export class IntegrationTestContext {
  private constructor(
    private readonly container: StartedPostgreSqlContainer,
    readonly prisma: PrismaService,
  ) {}

  static async start(): Promise<IntegrationTestContext> {
    const container = await new PostgreSqlContainer(
      'postgres:16-alpine',
    ).start();
    const databaseUrl = container.getConnectionUri();

    const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
    // Invoke the local Prisma CLI's JS entry directly via `node`, rather than
    // through `npx`/a shell — npx resolves to a .cmd wrapper on Windows, and a
    // workspace path containing spaces breaks shell-quoted argument passing.
    // execFileSync with an explicit argv array has no such ambiguity.
    const prismaCliEntry = path.resolve(
      __dirname,
      '../../node_modules/prisma/build/index.js',
    );
    execFileSync(
      process.execPath,
      [prismaCliEntry, 'migrate', 'deploy', '--schema', schemaPath],
      {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      },
    );

    const prisma = new PrismaService({
      datasources: { db: { url: databaseUrl } },
    });
    await prisma.$connect();

    return new IntegrationTestContext(container, prisma);
  }

  async stop(): Promise<void> {
    await this.prisma.$disconnect();
    await this.container.stop();
  }
}
