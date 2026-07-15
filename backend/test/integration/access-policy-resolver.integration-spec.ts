import { AccessPolicyResolver } from '../../src/resource/service/access-policy.resolver';
import { ResourceService } from '../../src/resource/service/resource.service';
import { MemberContext } from '../../src/member/entity/member.types';
import { IntegrationTestContext } from './testcontainers-setup';

// Phase 3.1 (build-guide.md) — AccessPolicyResolver: every resource type's
// access contract, including the deny paths (expired/unscoped license, wrong
// faculty, active embargo, department mismatch, and the always-denied
// supervised-only rare material).
describe('AccessPolicyResolver (Phase 3.1)', () => {
  let ctx: IntegrationTestContext;
  let resourceService: ResourceService;
  let resolver: AccessPolicyResolver;

  beforeAll(async () => {
    ctx = await IntegrationTestContext.start();
    resourceService = new ResourceService(ctx.prisma);
    resolver = new AccessPolicyResolver(ctx.prisma);
  }, 120_000);

  afterAll(async () => {
    await ctx.stop();
  });

  async function createMember(
    label: string,
    faculty: string | null,
  ): Promise<MemberContext> {
    const member = await ctx.prisma.member.create({
      data: {
        ssoSubjectId: `${label}-${Date.now()}-${Math.random()}`,
        fullName: label,
        email: `${label}@example.edu`,
        memberType: 'UNDERGRAD',
        role: 'STUDENT',
        faculty,
      },
    });
    return { id: member.id, faculty: member.faculty };
  }

  it('PhysicalBook — always allowed, regardless of member', async () => {
    const book = await resourceService.createPhysicalBook({
      title: 'Any Book',
    });
    const member = await createMember('book-reader', null);

    const decision = await resolver.resolve(member, book);

    expect(decision.allowed).toBe(true);
    expect(decision.status).toBe('AVAILABLE');
  });

  it('Thesis — denied while embargoed, allowed once the embargo date has passed', async () => {
    const member = await createMember('thesis-reader', null);

    const embargoed = await resourceService.createThesis({
      title: 'Embargoed Thesis',
      studentMemberId: member.id,
      embargoUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // one year out
    });
    const lifted = await resourceService.createThesis({
      title: 'Published Thesis',
      studentMemberId: member.id,
      embargoUntil: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
    });
    const noEmbargo = await resourceService.createThesis({
      title: 'Never Embargoed Thesis',
      studentMemberId: member.id,
    });

    const embargoedDecision = await resolver.resolve(member, embargoed);
    const liftedDecision = await resolver.resolve(member, lifted);
    const noEmbargoDecision = await resolver.resolve(member, noEmbargo);

    expect(embargoedDecision.allowed).toBe(false);
    expect(embargoedDecision.status).toBe('EMBARGOED');
    expect(liftedDecision.allowed).toBe(true);
    expect(liftedDecision.status).toBe('AVAILABLE');
    expect(noEmbargoDecision.allowed).toBe(true);
  });

  it('JournalArticle — denied with no license, denied outside faculty scope, allowed within scope', async () => {
    const engineeringMember = await createMember('eng-member', 'Engineering');
    const medicineMember = await createMember('med-member', 'Medicine');

    const noLicenseArticle = await resourceService.createJournalArticle({
      title: 'Unlicensed Article',
    });

    const license = await ctx.prisma.journalLicense.create({
      data: {
        publisher: 'Test Publisher',
        startsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        facultyScopes: { create: [{ faculty: 'Engineering' }] },
      },
    });
    const scopedArticle = await resourceService.createJournalArticle({
      title: 'Engineering-Scoped Article',
      licenseId: license.id,
    });

    const expiredLicense = await ctx.prisma.journalLicense.create({
      data: {
        publisher: 'Test Publisher',
        startsAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
    });
    const expiredArticle = await resourceService.createJournalArticle({
      title: 'Expired-License Article',
      licenseId: expiredLicense.id,
    });

    const noLicenseDecision = await resolver.resolve(
      engineeringMember,
      noLicenseArticle,
    );
    const scopedForEngineering = await resolver.resolve(
      engineeringMember,
      scopedArticle,
    );
    const scopedForMedicine = await resolver.resolve(
      medicineMember,
      scopedArticle,
    );
    const expiredDecision = await resolver.resolve(
      engineeringMember,
      expiredArticle,
    );

    expect(noLicenseDecision.allowed).toBe(false);
    expect(noLicenseDecision.status).toBe('LICENSE_GATED');

    expect(scopedForEngineering.allowed).toBe(true);
    expect(scopedForEngineering.status).toBe('AVAILABLE');

    expect(scopedForMedicine.allowed).toBe(false);
    expect(scopedForMedicine.status).toBe('LICENSE_GATED');

    expect(expiredDecision.allowed).toBe(false);
    expect(expiredDecision.status).toBe('LICENSE_GATED');
  });

  it('ResearchReport — denied outside the scoped department, allowed within it, allowed when unscoped', async () => {
    const engineeringMember = await createMember(
      'report-eng-member',
      'Engineering',
    );
    const medicineMember = await createMember('report-med-member', 'Medicine');

    const scopedReport = await resourceService.createResearchReport({
      title: 'Engineering Report',
      departmentScope: 'Engineering',
    });
    const unscopedReport = await resourceService.createResearchReport({
      title: 'Open Report',
    });

    const engDecision = await resolver.resolve(engineeringMember, scopedReport);
    const medDecision = await resolver.resolve(medicineMember, scopedReport);
    const unscopedDecision = await resolver.resolve(
      medicineMember,
      unscopedReport,
    );

    expect(engDecision.allowed).toBe(true);
    expect(engDecision.status).toBe('AVAILABLE');

    expect(medDecision.allowed).toBe(false);
    expect(medDecision.status).toBe('DEPARTMENT_SCOPED');

    expect(unscopedDecision.allowed).toBe(true);
  });

  it('RareMaterial — always denied self-service access, regardless of member', async () => {
    const member = await createMember('rare-reader', 'Humanities');
    const manuscript = await resourceService.createRareMaterial({
      title: 'Ancient Manuscript',
    });

    const decision = await resolver.resolve(member, manuscript);

    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe('SUPERVISED_ONLY');
  });
});
