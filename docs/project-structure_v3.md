# University Library Portal — Backend Project Structure

Scope: web portal / OPAC + institutional repository + license gateway.
No RFID, no barcode hardware, no physical circulation desk integration.
Auth is SSO-consuming (relying party), not SSO-owning.
Catalog is an English-language, Latin-script international academic collection (worldwide journal/thesis discovery, publisher metadata, DOIs) — modeled on a real university discovery layer. CJK-language records are out of scope by design; this is what lets Postgres's built-in full-text search suffice without a CJK tokenizer (see stack-decision.md §2).

Stack: Node.js + TypeScript, NestJS, PostgreSQL, Prisma. The Resource hierarchy is **hand-modeled** (Prisma has no table inheritance) as a base `resource` row plus one subtype table each, with the shared-id invariant owned by a service-layer transaction — see §2.3 and stack-decision.md §1/§2a. Frontend: Vite + React + TypeScript SPA (thin client; backend is the single auth authority — see stack-decision.md §3).

> **Note on the inheritance model vs. the schema.** The SQL in §3 is unchanged from the original relational design — the six-table JOINED structure is valid Postgres regardless of ORM. What changed with the move from Spring/JPA to NestJS/Prisma is *who owns that structure*: Hibernate generated and managed it from a `@JoinedInheritance` annotation; here it is authored explicitly in the Prisma schema as five 1:1 relations to `resource`, and the "a subtype row always shares its base row's id, created atomically" invariant lives in `ResourceService` (§2.3), not in an ORM feature. The relational design is identical; the enforcement moved from framework to service.

---

## 1. Top-Level Layout

```
university-library-backend/
├── package.json
├── tsconfig.json
├── nest-cli.json
├── README.md
├── .env.example
├── docker-compose.yml                 # postgres + app, local dev only
├── prisma/
│   ├── schema.prisma                  # datasource, generator, all models (the hand-modeled hierarchy)
│   └── migrations/                    # prisma migrate — version-controlled SQL migrations
├── src/
│   ├── main.ts                        # Nest bootstrap
│   ├── app.module.ts                  # root module, imports the domain modules below
│   ├── config/
│   ├── security/
│   ├── prisma/                        # PrismaModule + PrismaService (injectable client)
│   ├── resource/
│   ├── loan/
│   ├── reservation/
│   ├── thesis/
│   ├── journal/
│   ├── ill/                           # inter-library loan
│   ├── member/
│   ├── notification/
│   ├── audit/
│   ├── search/
│   └── common/
├── test/                              # e2e specs (Jest + Supertest)
└── docs/
    └── erd.md
```

Environment-specific configuration is supplied via `.env` files consumed by Nest's `ConfigModule` (`.env`, `.env.development`, `.env.production`) rather than framework profile YAML.

---

## 2. Module-by-Module Breakdown

Each domain module follows the NestJS shape: a `*.module.ts` wiring the module, plus `entity/` (Prisma-model-backed domain types and DTOs), `service/` (providers), `controller/`, and `dto/`. NestJS providers replace Spring `@Service` beans; controllers use Nest decorators; authorization is expressed with guards rather than `@PreAuthorize`. Listed below only where a module diverges or where specific files matter.

### 2.1 `config/` and `prisma/`
```
config/
├── configuration.ts                   # typed config loader (ConfigModule.forRoot)
├── openapi.ts                         # Swagger document setup (@nestjs/swagger)
└── cors.ts                            # CORS options

prisma/
├── prisma.module.ts                   # global module exporting PrismaService
└── prisma.service.ts                  # extends PrismaClient; onModuleInit connect / shutdown hooks
```

Scheduling and async are not separate config classes as they were under Spring. Scheduled jobs use `@nestjs/schedule` (`@Cron`/`@Interval` decorators on providers — see the scheduler services in §2.4/§2.5/§2.6). Asynchronous notification handling uses Nest's event emitter (`@nestjs/event-emitter`) with `@OnEvent` handlers.

> **Sync vs async for notification events, decided.** The `notification/event/` payloads are consumed by `@OnEvent` handlers dispatched through Nest's event emitter, not synchronously inline — a slow SES call must not block the HTTP request that triggered it (e.g. a reservation fulfillment holding the response open while email sends). The handlers run on the event emitter's async path; a bounded work queue (BullMQ over Redis) is the natural upgrade if delivery needs durability and backpressure, noted here as the seam rather than built in v1. The point that mattered under Spring — *don't block the request thread on email* — is unchanged; only the mechanism (event emitter vs `@Async`) differs.

### 2.2 `security/`
This is the SSO-relying-party boundary — the app never owns credentials, only consumes identity claims.

```
security/
├── security.module.ts
├── jwt/
│   ├── jwt-auth.guard.ts              # Nest guard — validates token, attaches claims to request
│   ├── jwt-claims.ts                  # type: studentId, role, faculty, department
│   └── jwt.strategy.ts                # passport-jwt strategy (verifies signature)
├── mock-idp.controller.ts             # DEV ONLY — issues fake SSO tokens locally
└── role/
    ├── role.enum.ts                   # STUDENT, FACULTY, LIBRARIAN, ADMIN
    ├── roles.guard.ts                 # method-level role check
    └── roles.decorator.ts             # @Roles(...) metadata read by RolesGuard
```

Authorization that was `@PreAuthorize("...")` under Spring is expressed as a `@Roles(...)` decorator plus `RolesGuard` (and, for finer rules like "FACULTY in this department," a dedicated guard consulting `AccessPolicyResolver`). Stateless request auth: the `JwtAuthGuard` runs per-request, verifies the token, and attaches typed claims — the Nest equivalent of the old `JwtAuthFilter` populating the security context.

> `mock-idp.controller.ts` exists only so the project is runnable end-to-end without a real university IdP. It is registered only in the development configuration, never in production — this is the simulated SSO boundary, not a real auth system.

> **The mock → real-IdP swap seam, made concrete.** The claim "the mock slots out without changing consumption logic" only holds if the seam is specified. The JWT strategy resolves its signing key through a `PublicKeyProvider` interface with two implementations, selected by config: a dev implementation reading the mock's static key, and a prod implementation fetching the university IdP's rotating public keys from its **JWKS endpoint** (`/.well-known/jwks.json`), cached with periodic refresh (`jwks-rsa` or equivalent). Only the bound `PublicKeyProvider` changes between environments — the strategy, the guard, and everything downstream stay identical. This is the exact boundary where portfolio-project auth usually turns out to be fake in a way that doesn't generalize; naming JWKS-vs-static-key as the swap point is what makes it real.

### 2.3 `resource/` — the hand-modeled hierarchy
The core domain-modeling module, and the one most changed by the Prisma move. There is no ORM inheritance; the hierarchy is explicit.

```
resource/
├── entity/
│   ├── resource.types.ts              # Resource base shape + the discriminated union of subtypes
│   ├── resource-status.enum.ts        # RESOURCE-level: AVAILABLE, RESERVED, RESTRICTED, EMBARGOED
│   └── copy-status.enum.ts            # COPY-level: AVAILABLE, ON_LOAN, RESERVED, LOST
├── service/
│   ├── resource.service.ts            # OWNS the hierarchy invariant (see note) + shared read logic
│   ├── access-policy.resolver.ts      # KEY PROVIDER — resolves "can this user access this resource"
│   │                                    per the access-contract table (borrow/license/embargo/supervised)
│   └── resource-search.service.ts
├── controller/
│   └── resource.controller.ts         # GET /api/resources, GET /api/resources/:id
└── dto/
    ├── resource-summary.dto.ts        # discriminated union — see "summary DTO shape" note below
    ├── resource-detail.dto.ts
    └── access-status.dto.ts           # "available" | "license-gated" | "embargoed" | "supervised-only"
```

Data access goes through the injected `PrismaService` rather than per-entity repository classes — Prisma's generated client is the repository. Where the old design had a `ResourceRepository` for polymorphic reads and subtype repositories only where unique queries existed, the equivalent here is: shared reads live on `ResourceService` (querying `resource` and joining the needed subtype table), and subtype-specific queries (thesis-by-supervisor, article-by-DOI) are methods on the relevant domain service, not a proliferation of repository classes.

`AccessPolicyResolver` remains the single most important provider in the project — it's where the access-contract table (book vs article vs thesis vs ILL) becomes actual branching logic instead of duplicated `if` chains scattered across controllers.

> **The hierarchy invariant is now owned explicitly — this is the heart of the Prisma trade.** Because Prisma cannot express table inheritance, `resource` and the five subtype tables are five 1:1 relations, and the rule "a subtype row shares its base `resource` row's id and the two are created together atomically" has no ORM feature enforcing it. `ResourceService` owns it: subtype creation runs inside `prisma.$transaction(...)`, writing the base `resource` row and the subtype row in one atomic unit, so a failure leaves neither half. A TypeScript **discriminated union** (`resource.types.ts`, keyed on `resource_type`) gives the compiler the exhaustiveness the old Java `sealed`-hierarchy gave — adding a sixth subtype surfaces as a non-exhaustive `switch` compile error in `AccessPolicyResolver` and everywhere else that discriminates. This is the concrete "hand-model the hierarchy" work: more explicit than an annotation, and arguably more legible for it.

> **Two status enums, not one, because they describe different scopes.** A single `ResourceStatus` would mix resource-level states (`RESTRICTED`, `EMBARGOED` — properties of the *title*) with copy-level states (`ON_LOAN`, `LOST` — properties of a *physical instance*), making invalid states expressible (a *copy* marked `EMBARGOED` is meaningless; a *title* marked `LOST` is meaningless). Splitting into `ResourceStatus` and `CopyStatus` makes those invalid states unrepresentable. See also the copy/loan consistency note in §4.

> **Summary DTO shape — a deliberate fork, now decided.** A single flat `ResourceSummaryDto` across five subtypes forces either many always-null fields (`isbn` null for a thesis, `embargoUntil` null for a book) or loss of type-specific detail in search results — and the deployment doc flags the concrete failure mode (a journal article rendering as a physical book). Decision: `ResourceSummaryDto` carries the shared fields (`id`, `type`, `title`, `accessStatus`) plus a small typed `detail` sub-object per subtype, expressed as a **discriminated union** on `type`. Because the backend is also TypeScript, this exact union type is shared with the frontend rather than re-described — the discriminant drives which `detail` shape the client renders, and rendering the wrong shape is a compile error on both sides. This shared-types boundary is where the single-language stack earns its keep.

### 2.4 `loan/` — physical book lifecycle
```
loan/
├── entity/
│   ├── loan.types.ts                  # includes renewalCount (renewals are capped)
│   └── loan-status.enum.ts            # ACTIVE, RETURNED, OVERDUE, LOST
├── service/
│   ├── loan.service.ts                # borrow, return, renew
│   └── overdue-check.scheduler.ts     # @Cron job, flips ACTIVE → OVERDUE, triggers fines
├── controller/loan.controller.ts      # includes POST /api/loans/:id/renew
└── dto/loan-request.dto.ts, loan-status.dto.ts
```

> **Renewals are modeled, and they cross two subsystems.** Real libraries cap renewals and — the interesting part — **block renewal if another member has the item reserved**. So `LoanService.renew()` must consult `ReservationQueueService`: a renewal is only legal when `renewalCount < max` *and* no active `QUEUED` reservation exists for that resource. This is genuinely non-trivial domain logic tying `loan/` and `reservation/` together, and the renewal cap / loan duration are policy values that belong in `loan_policy` (see §2.9), not hardcoded constants.

### 2.5 `reservation/` — hold queue
```
reservation/
├── entity/
│   ├── reservation.types.ts
│   └── reservation-status.enum.ts     # QUEUED, READY_FOR_PICKUP, EXPIRED, FULFILLED, CANCELLED
├── service/
│   ├── reservation-queue.service.ts   # FIFO queue logic per Resource
│   └── reservation-expiry.scheduler.ts # @Cron — cascades to next-in-queue on 48hr expiry
├── controller/reservation.controller.ts
└── dto/reservation.dto.ts
```

> **The concurrency story needs schema backing, not just service-layer prose.** The last-copy race and the queue-position race are real, and the locking strategy is reflected in the DDL — see the `reservation` and `resource_copy` definitions in §3, which carry a `UNIQUE (resource_id, queue_position)` constraint (two racing enqueues can't both land on position 3) and a `version` column on `resource_copy` for optimistic locking on availability transitions. Under Prisma: the optimistic path uses a conditional `updateMany` on `where: { id, version }` and checks the affected-row count (Prisma has no `@Version` annotation — the version check is explicit in the update predicate); the pessimistic "grab the last available copy" path uses an interactive transaction issuing a raw `SELECT ... FOR UPDATE` via `$queryRaw`. Naming *which* strategy guards *which* path — rather than "we'll add locking" — is the actual decision, and it's identical at the database level to the original design; only the ORM surface changed.

### 2.6 `thesis/` — submission + embargo workflow
```
thesis/
├── entity/
│   ├── thesis-submission.types.ts
│   └── submission-status.enum.ts      # DRAFT, SUBMITTED, UNDER_REVIEW,
│                                         APPROVED, REJECTED, EMBARGOED, PUBLISHED
├── service/
│   ├── thesis-submission.service.ts
│   ├── supervisor-approval.service.ts
│   └── embargo-expiry.scheduler.ts    # @Cron, flips EMBARGOED → PUBLISHED on date
├── controller/
│   ├── thesis-submission.controller.ts # student-facing: submit, check status
│   └── thesis-review.controller.ts     # librarian/supervisor-facing: approve/reject
└── dto/thesis-submission.dto.ts, embargo-request.dto.ts
```

### 2.7 `journal/` — license gate + resolver
Reflects the link-resolver / proxy pattern confirmed from the real portal (URL stays on university domain before handoff).

```
journal/
├── entity/
│   ├── journal.types.ts               # the publication series — ISSN, publisher; distinct from an article
│   ├── journal-license.types.ts       # publisher, faculty scope, concurrent-user limit, expiry
│   └── license-scope.ts               # which faculties/departments a license covers
├── service/
│   ├── license-access.service.ts      # checks: is user's faculty covered, is license active,
│   │                                    is concurrent-user cap exceeded
│   └── link-resolver.service.ts       # simulates the internal resolver/proxy hop before
│                                         "redirecting" to publisher — logs access for license
│                                         renewal analytics, doesn't actually proxy real content
├── controller/journal-access.controller.ts  # GET /api/journals/:id/resolve
└── dto/license-check-result.dto.ts
```

`LinkResolverService` is intentionally a stub/simulation — it represents the architectural decision (gate + route, don't host) without needing real publisher integrations, which is appropriate scope for this project.

> **`Thesis` (catalog record) vs `ThesisSubmission` (workflow) — the aggregate boundary, made explicit.** These are two entities for two lifecycle phases. `ThesisSubmission` (in `thesis/`) is the **workflow aggregate**: it owns the `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → EMBARGOED → PUBLISHED` state machine, the supervisor approval, and the uploaded file. `Thesis` (in `resource/`, a `Resource` subtype) is the **catalog record**: it exists in the searchable OPAC only once a submission reaches `PUBLISHED`. The transition is one-directional and explicit — on `EmbargoExpiryScheduler` (or approval-to-publish) firing, the `ThesisSubmission` **projects** a `Thesis` catalog entry (1:1, `thesis_submission.resource_id` FK, nullable until published), and that projection is one more service-layer transaction of the kind §2.3 describes. A `ThesisSubmission` in `DRAFT` has no `Thesis` and is invisible to search — which is correct: unpublished theses aren't catalog records. The same catalog-vs-workflow split applies to `JournalArticle` (catalog record) vs `JournalLicense` (the licensing concern). This boundary is the single most important structural decision in the project; everything else is layout on top of it.

### 2.8 `ill/` — inter-library loan
```
ill/
├── entity/
│   ├── ill-request.types.ts
│   └── ill-request-status.enum.ts     # SUBMITTED, UNDER_REVIEW, REQUESTED_EXTERNALLY,
│                                         FULFILLED, DELIVERED, RETURN_DUE, RETURNED, CANCELLED
├── service/ill-request.service.ts
├── controller/
│   ├── ill-request.controller.ts      # student-facing
│   └── ill-management.controller.ts   # librarian-facing
└── dto/ill-request.dto.ts
```

### 2.9 `member/`
```
member/
├── entity/
│   ├── member.types.ts                # linked to JWT subject, not a credential store
│   ├── member-type.enum.ts            # UNDERGRAD, GRADUATE, FACULTY, STAFF
│   ├── fine.types.ts
│   └── loan-policy.types.ts           # loan duration, renewal cap, fine rate, grace, max — per MemberType
├── service/
│   ├── member.service.ts
│   └── fine-calculation.service.ts    # reads LoanPolicy — no hardcoded rates
├── controller/member.controller.ts    # /api/members/me, /api/members/:id/fines
└── dto/member-profile.dto.ts
```

> **Fine and loan rules get a home instead of being hardcoded.** `FineCalculationService` and the renewal logic (§2.4) both depend on values — fine rate per day, grace period, max fine cap, loan duration, renewal cap — that vary by `MemberType` (a PhD student's loan period ≠ an undergrad's). Scattering these as constants contradicts the project's own thesis that *rules live in a resolvable place* (the same argument that justifies `AccessPolicyResolver`). A small `loan_policy` table keyed by member type is the consistent choice. `Fine` stays under `member/` (a fine belongs to a member's account) even though `fine.loan_id` references `loan` — defensible, just be ready to say why when someone expects it under `loan/`.

### 2.10 `notification/`
```
notification/
├── entity/notification-log.types.ts   # includes delivery status (SENT/FAILED/RETRYING)
├── service/
│   ├── notification.service.ts        # interface (abstract provider)
│   └── email-notification.service.ts  # @OnEvent impl — reservation ready, overdue, embargo lifted
└── event/
    ├── reservation-ready.event.ts
    ├── overdue.event.ts
    └── thesis-published.event.ts
```

> **Consumed asynchronously (Nest event emitter, see §2.1), and delivery can fail.** `notification_log` carries a delivery status so a failed SES send is visible rather than silently lost. Full retry/dead-letter handling is out of scope for v1 (documented in §5) — the natural implementation is a BullMQ queue with retry/backoff — but recording *that* a send failed is cheap and worth having: "did the overdue email actually go out" should be answerable.

### 2.11 `audit/`
```
audit/
├── entity/audit-log-entry.types.ts
├── service/audit-log.service.ts
└── audit.interceptor.ts               # Nest interceptor — logs state transitions across loan/thesis/ill
```

> **Interceptor audit is only as complete as its coverage.** `AuditInterceptor` (a Nest interceptor, the equivalent of the old Spring AOP aspect) catches state transitions made through the intercepted service methods — but a state change made via a *direct* Prisma write that bypasses those methods is invisible to it. This is a known limitation of interceptor/AOP-based auditing, not a bug: the mitigation is discipline (all state transitions go through service methods, never direct Prisma writes from controllers), and it's worth stating so the gap is a documented boundary rather than a silent hole.

### 2.12 `search/`
```
search/
├── service/
│   └── unified-search.service.ts      # queries across Resource subtypes, returns
│                                         PAGINATED PageResponse<ResourceSummaryDto>
└── controller/search.controller.ts    # GET /api/search?q=...&type=...&page=...&size=...
```

> **This is the most expensive query on the most exposed endpoint — both facts matter.** `UnifiedSearchService` runs cross-subtype joins over a potentially large `resource` table on a *public, unauthenticated* route. Two consequences: (1) it **must** return `PageResponse<ResourceSummaryDto>` with a hard max page size — an unbounded catalog search is a denial-of-service waiting to happen; (2) the public search route needs basic throttling / result caps, unlike the authenticated routes (`@nestjs/throttler` is the natural fit). The interface itself is specified in `search-interface-contract.md`, which this module implements.

### 2.13 `common/`
```
common/
├── exception/
│   ├── all-exceptions.filter.ts       # global exception filter
│   ├── resource-not-found.exception.ts
│   ├── access-denied.exception.ts
│   └── invalid-state-transition.exception.ts
├── statemachine/
│   ├── state-transition.validator.ts  # generic: is (from → to) legal for this entity?
│   └── transition-rules.ts            # declares legal transitions per state machine
└── pagination/page-response.ts        # PageResponse<T>
```

Shared timestamp/id fields (the old `BaseEntity`) live in the Prisma schema as common columns on each model rather than a mapped superclass — Prisma has no inheritance to hang a base entity on, so `id`, `createdAt`, `updatedAt` are declared per model (or via a shared Prisma schema fragment).

> **A home for transition legality, mirroring what `AccessPolicyResolver` did for access.** The project has four state machines (`LoanStatus`, `ReservationStatus`, `SubmissionStatus`, `IllRequestStatus`) and declares `InvalidStateTransitionException` — so illegal transitions are a known concept that needs an owner. Left ad hoc, "is `QUEUED → FULFILLED` legal?" becomes duplicated `if` checks across `ReservationQueueService`, `ThesisSubmissionService`, and `IllRequestService` — the exact scattering `AccessPolicyResolver` was created to avoid. `StateTransitionValidator` centralizes the legal-transition map (a `Map<State, Set<State>>` per machine in `TransitionRules`); each service asks it before transitioning and throws `InvalidStateTransitionException` on an illegal move. The state diagrams are deferred in §5, but the *place they'll live* is decided.

## 3. Database Schema (PostgreSQL)

```sql
-- ============================================================
-- RESOURCE HIERARCHY (base + subtype tables; hand-modeled, see §2.3)
-- ============================================================

CREATE TABLE resource (
    id              BIGSERIAL PRIMARY KEY,
    resource_type   VARCHAR(30) NOT NULL,        -- discriminator, also a real column for query simplicity
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    department      VARCHAR(150),
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE physical_book (
    id              BIGINT PRIMARY KEY REFERENCES resource(id),
    isbn            VARCHAR(20),
    author          VARCHAR(300),
    publisher       VARCHAR(300),
    publication_year INT,
    call_number     VARCHAR(50)
);

CREATE TABLE resource_copy (
    id              BIGSERIAL PRIMARY KEY,
    book_id         BIGINT NOT NULL REFERENCES physical_book(id),  -- NOTE: copies are physical-book-only by design;
                                                                   -- rare materials are single-instance/reading-room,
                                                                   -- so they intentionally have no resource_copy rows.
                                                                   -- Change to REFERENCES resource(id) only if another
                                                                   -- physical subtype ever needs multi-copy tracking.
    barcode_label   VARCHAR(50),                  -- label only, no scanner integration
    status          VARCHAR(20) NOT NULL,          -- CopyStatus: AVAILABLE, ON_LOAN, RESERVED, LOST
    version         BIGINT NOT NULL DEFAULT 0,     -- @Version, optimistic lock on availability transitions
    shelf_location  VARCHAR(100)
);

-- Catalog record (Resource subtype): exists ONLY once a submission is PUBLISHED.
-- Holds what the OPAC displays; the workflow lives in thesis_submission below.
CREATE TABLE thesis (
    id                  BIGINT PRIMARY KEY REFERENCES resource(id),
    student_member_id   BIGINT NOT NULL REFERENCES member(id),
    degree_type         VARCHAR(50),               -- BACHELOR, MASTER, PHD
    embargo_until       DATE                       -- display: when the full text becomes available
);

-- Workflow aggregate: owns the submission state machine, supervisor approval, and the file.
-- resource_id is NULL until PUBLISHED, at which point it projects a `thesis` catalog row (1:1).
-- (degree_type / embargo_until are intentionally the working copy here; `thesis` is the published snapshot.)
CREATE TABLE thesis_submission (
    id                   BIGSERIAL PRIMARY KEY,
    student_member_id    BIGINT NOT NULL REFERENCES member(id),
    supervisor_member_id BIGINT REFERENCES member(id),
    degree_type          VARCHAR(50),
    submission_status    VARCHAR(30) NOT NULL,      -- DRAFT..PUBLISHED (SubmissionStatus)
    embargo_until        DATE,
    file_path            VARCHAR(500),              -- private S3 key; never public bucket ACL
    submitted_at         TIMESTAMP,
    resource_id          BIGINT REFERENCES resource(id)  -- NULL until published, then FK to the thesis catalog row
);

CREATE TABLE journal (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(300) NOT NULL,
    issn            VARCHAR(20),                     -- identifies the publication series itself,
                                                       -- distinct from any single article's DOI
    publisher       VARCHAR(300)
);

CREATE TABLE journal_article (
    id              BIGINT PRIMARY KEY REFERENCES resource(id),
    doi             VARCHAR(150),                     -- resolvable identifier (via doi.org), not
                                                       -- just a label — survives the article moving
                                                       -- platforms, unlike an ISBN
    journal_id      BIGINT REFERENCES journal(id),
    volume          VARCHAR(20),                      -- citation-completeness fields: academic
    issue           VARCHAR(20),                      -- search exists to support correct citation,
    page_range      VARCHAR(30),                      -- not just "find and read"
    license_id      BIGINT REFERENCES journal_license(id)
);

CREATE TABLE journal_license (
    id                      BIGSERIAL PRIMARY KEY,
    publisher               VARCHAR(300) NOT NULL,
    concurrent_user_limit   INT,
    starts_at               DATE,
    expires_at              DATE
);

CREATE TABLE license_faculty_scope (
    license_id      BIGINT NOT NULL REFERENCES journal_license(id),
    faculty          VARCHAR(150) NOT NULL,
    PRIMARY KEY (license_id, faculty)
);

CREATE TABLE research_report (
    id              BIGINT PRIMARY KEY REFERENCES resource(id),
    department_scope VARCHAR(150),
    report_year      INT
);

CREATE TABLE rare_material (
    id                  BIGINT PRIMARY KEY REFERENCES resource(id),
    reading_room_only   BOOLEAN NOT NULL DEFAULT true,
    handling_notes       TEXT
);

-- ============================================================
-- MEMBER
-- ============================================================

CREATE TABLE member (
    id              BIGSERIAL PRIMARY KEY,
    sso_subject_id  VARCHAR(150) NOT NULL UNIQUE,  -- claim from JWT, not a password
    full_name       VARCHAR(300) NOT NULL,
    email           VARCHAR(300) NOT NULL,
    -- Two distinct axes; FACULTY appears in both by coincidence, not sameness:
    member_type     VARCHAR(20) NOT NULL,           -- AFFILIATION (drives loan_policy): UNDERGRAD, GRADUATE, FACULTY, STAFF
    faculty         VARCHAR(150),
    role            VARCHAR(20) NOT NULL,            -- PERMISSIONS (drives role guards): STUDENT, FACULTY, LIBRARIAN, ADMIN
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE fine (
    id              BIGSERIAL PRIMARY KEY,
    member_id       BIGINT NOT NULL REFERENCES member(id),
    loan_id         BIGINT REFERENCES loan(id),
    amount          NUMERIC(10,2) NOT NULL,
    reason          VARCHAR(200),
    paid            BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- Policy lives in data, not hardcoded constants (mirrors the "rules in a resolvable place" philosophy)
CREATE TABLE loan_policy (
    member_type         VARCHAR(20) PRIMARY KEY,        -- UNDERGRAD, GRADUATE, FACULTY, STAFF
    loan_duration_days  INT NOT NULL,
    max_renewals        INT NOT NULL,
    fine_per_day        NUMERIC(10,2) NOT NULL,
    grace_period_days   INT NOT NULL DEFAULT 0,
    max_fine            NUMERIC(10,2)
);

-- ============================================================
-- LOAN
-- ============================================================

CREATE TABLE loan (
    id              BIGSERIAL PRIMARY KEY,
    copy_id         BIGINT NOT NULL REFERENCES resource_copy(id),
    member_id       BIGINT NOT NULL REFERENCES member(id),
    status          VARCHAR(20) NOT NULL,            -- ACTIVE, RETURNED, OVERDUE, LOST
    renewal_count   INT NOT NULL DEFAULT 0,          -- capped per loan_policy; renewal blocked if item is reserved
    borrowed_at     TIMESTAMP NOT NULL DEFAULT now(),
    due_at          TIMESTAMP NOT NULL,
    returned_at     TIMESTAMP
);

-- ============================================================
-- RESERVATION
-- ============================================================

CREATE TABLE reservation (
    id              BIGSERIAL PRIMARY KEY,
    resource_id     BIGINT NOT NULL REFERENCES resource(id),
    member_id       BIGINT NOT NULL REFERENCES member(id),
    queue_position  INT NOT NULL,
    status          VARCHAR(20) NOT NULL,            -- QUEUED, READY_FOR_PICKUP, EXPIRED, FULFILLED, CANCELLED
    queued_at       TIMESTAMP NOT NULL DEFAULT now(),
    ready_at        TIMESTAMP,
    expires_at      TIMESTAMP,
    CONSTRAINT uq_active_queue_position UNIQUE (resource_id, queue_position)  -- two racing enqueues can't share a slot
);

-- ============================================================
-- ILL (Inter-Library Loan)
-- ============================================================

CREATE TABLE ill_request (
    id              BIGSERIAL PRIMARY KEY,
    member_id       BIGINT NOT NULL REFERENCES member(id),
    title           VARCHAR(500) NOT NULL,
    author          VARCHAR(300),
    doi_or_isbn     VARCHAR(150),
    justification   TEXT,
    status          VARCHAR(30) NOT NULL,            -- see IllRequestStatus enum
    requested_at    TIMESTAMP NOT NULL DEFAULT now(),
    fulfilled_at    TIMESTAMP,
    return_due_at   TIMESTAMP
);

-- ============================================================
-- AUDIT / NOTIFICATION
-- ============================================================

CREATE TABLE audit_log_entry (
    id              BIGSERIAL PRIMARY KEY,
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       BIGINT NOT NULL,
    action          VARCHAR(50) NOT NULL,            -- e.g. STATUS_CHANGE, CREATED
    actor_member_id BIGINT REFERENCES member(id),
    old_value       JSONB,                           -- JSONB, not TEXT — matches stack-decision.md rationale
    new_value       JSONB,                           -- (indexed/queryable structured diffs, not opaque blobs)
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE notification_log (
    id              BIGSERIAL PRIMARY KEY,
    member_id       BIGINT NOT NULL REFERENCES member(id),
    type            VARCHAR(50) NOT NULL,            -- RESERVATION_READY, OVERDUE, EMBARGO_LIFTED
    delivery_status VARCHAR(20) NOT NULL,            -- SENT, FAILED, RETRYING — so a failed send is visible
    sent_at         TIMESTAMP NOT NULL DEFAULT now(),
    payload         JSONB
);
```

---

## 4. Notes on Decisions Reflected in This Structure

- **`AccessPolicyResolver`** centralizes the access-contract table — every resource type's access rule lives in one resolvable place, not scattered across controllers.
- **`StateTransitionValidator`** does for transition legality what `AccessPolicyResolver` does for access — one owner for "is this state move legal," not duplicated `if` chains across the four state machines.
- **The hierarchy invariant lives in `ResourceService`, not an ORM feature.** Prisma has no table inheritance, so the base-plus-subtype rows are created atomically in a `prisma.$transaction`, and a TypeScript discriminated union gives compile-time exhaustiveness across subtypes. This is the deliberate cost accepted in the stack decision — the modeling centerpiece is hand-owned rather than annotation-managed (see stack-decision.md §1/§2a).
- **`Thesis` vs `ThesisSubmission`** — catalog record (Resource subtype, appears in OPAC only when published) vs workflow aggregate (owns the state machine and file). The submission projects a catalog row on publish. Same catalog-vs-workflow split as `JournalArticle` vs `JournalLicense`.
- **Copy/loan status consistency, resolved.** `resource_copy.status` and `loan.status` were two sources of truth for "is this copy out." Decision: copy availability transitions go through `LoanService` only, guarded by the `resource_copy.version` optimistic check (a conditional `updateMany` on `where: { id, version }`, verifying the affected-row count), so a returned loan and a freed copy commit in the same `prisma.$transaction`. A failed transaction leaves neither half applied rather than a copy stuck `ON_LOAN`. (DB triggers were the alternative — rejected as harder to test than service-layer logic under an integration test against real Postgres.)
- **Policy in data, not constants.** `loan_policy` holds loan duration, renewal cap, and fine parameters per member type — consistent with the "rules in a resolvable place" philosophy rather than hardcoded values in `FineCalculationService`.
- **`mock-idp.controller.ts`** exists purely to make the SSO boundary runnable locally; it's a stand-in for the real university IdP, registered only in development. The swap seam is the `PublicKeyProvider` binding (static key in dev, JWKS endpoint in prod).
- **`LinkResolverService`** is a deliberate simulation, not a real publisher integration — it demonstrates the architectural pattern (gate + route through internal resolver) without needing actual EZproxy/OpenURL infrastructure.
- **Schedulers** (`OverdueCheckScheduler`, `ReservationExpiryScheduler`, `EmbargoExpiryScheduler`) use `@nestjs/schedule` `@Cron` and are the background-job layer driving state transitions that aren't triggered by direct user action.
- **`resource_type` discriminator column** on the base `resource` table is kept as a real column (not just inferred from which subtype table has the row) because it simplifies search/filter queries significantly and is the value the TypeScript discriminated union keys on.
- **`journal` is a separate table from `journal_article`**, not a `journal_name` string on the article. A DOI identifies one article; an ISSN identifies the publication series. Normalizing the series into its own table gives journal-level metadata one home and lets many articles reference one journal by FK. `journal_article` also carries citation-completeness fields (`volume`, `issue`, `page_range`) that have no public-library equivalent.
- **Notifications are async** (Nest event emitter), and `notification_log.delivery_status` records failures so a dropped email is visible rather than silent.
- Barcode/RFID hardware is explicitly out of scope; `barcode_label` exists as a data field only, not as an integration point.

---

## 5. Not Yet Decided (deliberately deferred)

Resolved since the first draft (moved out of this list): copy/loan status consistency (§4), optimistic-vs-pessimistic locking split (§2.5), and the home for state-transition legality (§2.13). Still open:

- Roles/permissions matrix detail (who can transition which state) — sketched as enums here, full matrix not yet drawn
- Full state machine diagrams for `SubmissionStatus`, `IllRequestStatus`, `ReservationStatus` transitions — the diagrams themselves, not their code home, which is now `TransitionRules`
- Notification retry / dead-letter handling — v1 records `delivery_status` but does not automatically retry `FAILED` sends (BullMQ over Redis is the intended mechanism)
- Public-search throttling specifics — the need is named (§2.12), the exact rate-limit mechanism (bucket size, per-IP vs global via `@nestjs/throttler`) is not chosen
- `Journal.issn` uniqueness — whether to enforce a uniqueness constraint, and how to treat a journal with no ISSN yet; currently nullable and non-unique
- Whether `research_report` and `rare_material` ever need subtype-specific query methods beyond the shared `ResourceService` read path — added only if a unique query need appears
