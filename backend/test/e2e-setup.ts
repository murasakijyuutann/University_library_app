import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { Member, MemberType, Role } from '@prisma/client';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { join } from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ResourceService } from '../src/resource/service/resource.service';
import { registerViewPartials } from '../src/web/hbs-partials';
import { IntegrationTestContext } from './integration/testcontainers-setup';

export const E2E_MOCK_IDP_SECRET = 'e2e-test-mock-idp-secret';

export const E2E_SUBJECTS = {
  student: 'e2e-student-subject',
  librarian: 'e2e-librarian-subject',
  admin: 'e2e-admin-subject',
  faculty: 'e2e-faculty-subject',
  unprovisioned: 'e2e-unprovisioned-subject',
} as const;

export interface E2eSeedData {
  student: Member;
  librarian: Member;
  admin: Member;
  faculty: Member;
  bookId: string;
}

/**
 * Boots the full Nest app (API + Phase 6 HTML) against Testcontainers Postgres.
 */
export class E2eTestContext {
  private integrationCtx!: IntegrationTestContext;
  app!: INestApplication;
  seed!: E2eSeedData;

  get prisma() {
    return this.integrationCtx.prisma;
  }

  static async start(): Promise<E2eTestContext> {
    const ctx = new E2eTestContext();
    await ctx.bootstrap();
    return ctx;
  }

  private async bootstrap(): Promise<void> {
    this.integrationCtx = await IntegrationTestContext.start();

    process.env.DATABASE_URL = this.integrationCtx.databaseUrl;
    process.env.NODE_ENV = 'development';
    process.env.JWT_PUBLIC_KEY_SOURCE = 'static';
    process.env.MOCK_IDP_SIGNING_SECRET = E2E_MOCK_IDP_SECRET;
    process.env.STORAGE_DRIVER = 'local';
    process.env.STORAGE_LOCAL_SIGNING_SECRET = E2E_MOCK_IDP_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(this.integrationCtx.prisma)
      .compile();

    const app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.use(express.urlencoded({ extended: true }));

    const viewsPath = join(__dirname, '..', 'src', 'web', 'views');
    const publicPath = join(__dirname, '..', 'src', 'web', 'public');
    app.setBaseViewsDir(viewsPath);
    app.setViewEngine('hbs');
    registerViewPartials(viewsPath);
    app.useStaticAssets(publicPath);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    this.app = app;

    this.seed = await this.seedData();
  }

  async stop(): Promise<void> {
    await this.app.close();
    await this.integrationCtx.stop();
  }

  private async seedData(): Promise<E2eSeedData> {
    const prisma = this.integrationCtx.prisma;
    const resourceService = new ResourceService(prisma);

    const [student, librarian, admin, faculty] = await Promise.all([
      prisma.member.create({
        data: {
          ssoSubjectId: E2E_SUBJECTS.student,
          fullName: 'E2E Student',
          email: 'e2e-student@example.edu',
          memberType: MemberType.UNDERGRAD,
          role: Role.STUDENT,
          faculty: 'Computer Science',
        },
      }),
      prisma.member.create({
        data: {
          ssoSubjectId: E2E_SUBJECTS.librarian,
          fullName: 'E2E Librarian',
          email: 'e2e-librarian@example.edu',
          memberType: MemberType.FACULTY,
          role: Role.LIBRARIAN,
        },
      }),
      prisma.member.create({
        data: {
          ssoSubjectId: E2E_SUBJECTS.admin,
          fullName: 'E2E Admin',
          email: 'e2e-admin@example.edu',
          memberType: MemberType.FACULTY,
          role: Role.ADMIN,
        },
      }),
      prisma.member.create({
        data: {
          ssoSubjectId: E2E_SUBJECTS.faculty,
          fullName: 'E2E Faculty',
          email: 'e2e-faculty@example.edu',
          memberType: MemberType.FACULTY,
          role: Role.FACULTY,
        },
      }),
    ]);

    const book = await resourceService.createPhysicalBook({
      title: 'E2E Test Book',
      isbn: '9780000000001',
      author: 'E2E Author',
    });
    await prisma.resourceCopy.create({
      data: { bookId: book.id, status: 'AVAILABLE' },
    });

    return {
      student,
      librarian,
      admin,
      faculty,
      bookId: book.id.toString(),
    };
  }

  async issueToken(
    sub: string,
    role: Role,
    options?: { faculty?: string; memberType?: MemberType },
  ): Promise<string> {
    const response = await request(this.app.getHttpServer())
      .post('/auth/mock-idp/token')
      .send({
        sub,
        role,
        faculty: options?.faculty,
        memberType: options?.memberType,
      })
      .expect(201);

    return response.body.accessToken as string;
  }

  authHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
  }
}
