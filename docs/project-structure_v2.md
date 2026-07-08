# University Library Portal — Backend Project Structure

Scope: web portal / OPAC + institutional repository + license gateway.
No RFID, no barcode hardware, no physical circulation desk integration.
Auth is SSO-consuming (relying party), not SSO-owning.

Stack: Java 21, Spring Boot 3.x, PostgreSQL, JPA/Hibernate (JOINED inheritance for the Resource hierarchy).

---

## 1. Top-Level Layout

```
university-library-backend/
├── pom.xml
├── README.md
├── .env.example
├── docker-compose.yml                 # postgres + app, local dev only
├── src/
│   ├── main/
│   │   ├── java/com/university/library/
│   │   │   ├── LibraryApplication.java
│   │   │   ├── config/
│   │   │   ├── security/
│   │   │   ├── resource/
│   │   │   ├── loan/
│   │   │   ├── reservation/
│   │   │   ├── thesis/
│   │   │   ├── journal/
│   │   │   ├── ill/                   # inter-library loan
│   │   │   ├── member/
│   │   │   ├── notification/
│   │   │   ├── audit/
│   │   │   ├── search/
│   │   │   └── common/
│   │   └── resources/
│   │       ├── application.yml
│   │       ├── application-dev.yml
│   │       ├── application-prod.yml
│   │       └── db/migration/          # Flyway
│   └── test/
│       └── java/com/university/library/
└── docs/
    └── erd.md
```

---

## 2. Package-by-Package Breakdown

Each domain package follows the same internal shape: `entity/`, `repository/`, `service/`, `controller/`, `dto/`. Listed below per package, only where it diverges or where specific files matter.

### 2.1 `config/`
```
config/
├── JpaConfig.java
├── OpenApiConfig.java
├── CorsConfig.java
├── SchedulingConfig.java              # enables @Scheduled for overdue/embargo jobs
└── AsyncConfig.java                   # @EnableAsync + thread pool for notification events
```

> **Sync vs async for notification events, decided.** The `notification/event/` classes are consumed by `@Async @EventListener` handlers, not synchronous ones — a slow SES call must not block the HTTP thread that triggered it (e.g. a reservation fulfillment holding the request open while email sends). `AsyncConfig` defines the bounded thread pool that backs this. Without it, `@Async` silently falls back to the default `SimpleAsyncTaskExecutor` (unbounded thread creation), which is a real production footgun — naming the pool explicitly is the point.

### 2.2 `security/`
This is the SSO-relying-party boundary discussed earlier — the app never owns credentials, only consumes identity claims.

```
security/
├── SecurityConfig.java                # @PreAuthorize enabled, stateless session
├── jwt/
│   ├── JwtAuthFilter.java             # reads incoming token, populates SecurityContext
│   ├── JwtClaims.java                 # studentId, role, faculty, department
│   └── JwtValidator.java              # validates signature against university IdP public key
├── MockIdentityProviderController.java # DEV ONLY — issues fake SSO tokens locally
└── role/
    ├── Role.java                      # enum: STUDENT, FACULTY, LIBRARIAN, ADMIN
    └── RoleHierarchyConfig.java
```

> `MockIdentityProviderController` exists only so the project is runnable end-to-end without a real university IdP. It is explicitly excluded from any `prod` profile — worth a comment in the doc explaining this is the simulated SSO boundary, not a real auth system.

> **The mock → real-IdP swap seam, made concrete.** The claim "the mock slots out without changing consumption logic" only holds if the seam is specified. `JwtValidator` resolves the signing key through a `PublicKeyProvider` interface with two implementations: a dev implementation reading the mock's static key from config, and a prod implementation fetching the university IdP's rotating public keys from its **JWKS endpoint** (`/.well-known/jwks.json`), cached with periodic refresh. Only the active `PublicKeyProvider` bean changes between profiles — `JwtValidator`, `JwtAuthFilter`, and everything downstream stay identical. This is the exact boundary where portfolio-project auth usually turns out to be fake in a way that doesn't generalize; naming JWKS-vs-static-key as the swap point is what makes it real.

### 2.3 `resource/` — the abstract hierarchy
This is the core domain modeling package. Matches the `Resource (abstract)` hierarchy from the design notes.

```
resource/
├── entity/
│   ├── Resource.java                  # @Entity, @Inheritance(strategy = InheritanceType.JOINED)
│   ├── PhysicalBook.java              # extends Resource
│   ├── Thesis.java                    # extends Resource
│   ├── JournalArticle.java            # extends Resource
│   ├── ResearchReport.java            # extends Resource
│   ├── RareMaterial.java              # extends Resource
│   ├── ResourceCopy.java              # physical copy tracking (1 Resource : N Copies)
│   ├── ResourceStatus.java            # RESOURCE-level enum: AVAILABLE, RESERVED, RESTRICTED, EMBARGOED
│   └── CopyStatus.java                # COPY-level enum: AVAILABLE, ON_LOAN, RESERVED, LOST
├── repository/
│   ├── ResourceRepository.java        # polymorphic queries across ALL subtypes (default read path)
│   ├── ResourceCopyRepository.java    # availability checks — queried constantly, was missing
│   ├── ThesisRepository.java          # subtype repo ONLY where unique query needs exist
│   └── JournalArticleRepository.java  # subtype repo ONLY where unique query needs exist
├── service/
│   ├── ResourceService.java           # shared logic across all types
│   ├── AccessPolicyResolver.java      # KEY CLASS — resolves "can this user access this resource"
│   │                                    per the access-contract table (borrow/license/embargo/supervised)
│   └── ResourceSearchService.java
├── controller/
│   └── ResourceController.java        # GET /api/resources, GET /api/resources/{id}
└── dto/
    ├── ResourceSummaryDto.java        # for search results — see "summary DTO shape" note below
    ├── ResourceDetailDto.java
    └── AccessStatusDto.java           # "available" | "license-gated" | "embargoed" | "supervised-only"
```

`AccessPolicyResolver` is the single most important class in the project — it's where the access-contract table (book vs article vs thesis vs ILL) becomes actual branching logic instead of duplicated `if` chains scattered across controllers.

> **Repository rule, stated so the list is principled rather than ad-hoc.** With JOINED inheritance, subtypes are read polymorphically through `ResourceRepository` by default. A per-subtype repository exists **only** where that subtype has queries the base repo can't express — `ThesisRepository` (find by supervisor, by embargo date) and `JournalArticleRepository` (find by DOI, by license). `PhysicalBook`, `ResearchReport`, and `RareMaterial` have no such needs and deliberately get **no** dedicated repository — they're reached via `ResourceRepository`. The earlier draft listed four of five subtype repos, which was neither the "all" nor the "only-where-needed" rule; this is the rule.

> **Two status enums, not one, because they describe different scopes.** The earlier single `ResourceStatus` mixed resource-level states (`RESTRICTED`, `EMBARGOED` — properties of the *title*) with copy-level states (`ON_LOAN`, `LOST` — properties of a *physical instance*). A single enum makes invalid states expressible (a *copy* marked `EMBARGOED` is meaningless; a *title* marked `LOST` is meaningless). Splitting into `ResourceStatus` and `CopyStatus` makes those invalid states unrepresentable. See also the copy/loan consistency note in §4.

> **Summary DTO shape — a deliberate fork, now decided.** A single flat `ResourceSummaryDto` across five subtypes forces either many always-null fields (`isbn` null for a thesis, `embargoUntil` null for a book) or loss of type-specific detail in search results — and the deployment doc flags the concrete failure mode (a journal article rendering as a physical book). Decision: `ResourceSummaryDto` carries the shared fields (`id`, `type`, `title`, `accessStatus`) plus a small typed `detail` sub-object per subtype, rather than a flat bag of nullable columns. The `type` discriminator drives which `detail` shape the frontend renders, and the TypeScript side mirrors this as a discriminated union — which is what makes the frontend `typecheck` gate in the deployment doc actually load-bearing.

### 2.4 `loan/` — physical book lifecycle
```
loan/
├── entity/
│   ├── Loan.java                      # includes renewal_count (renewals are capped)
│   └── LoanStatus.java                # enum: ACTIVE, RETURNED, OVERDUE, LOST
├── repository/LoanRepository.java
├── service/
│   ├── LoanService.java               # borrow, return, renew
│   └── OverdueCheckScheduler.java     # @Scheduled job, flips ACTIVE → OVERDUE, triggers fines
├── controller/LoanController.java     # includes POST /api/loans/{id}/renew
└── dto/LoanRequestDto.java, LoanStatusDto.java
```

> **Renewals are now modeled, and they cross two subsystems.** Real libraries cap renewals and — the interesting part — **block renewal if another member has the item reserved**. So `LoanService.renew()` must consult `ReservationQueueService`: a renewal is only legal when `renewal_count < max` *and* no active `QUEUED` reservation exists for that resource. This is a genuinely non-trivial bit of domain logic that ties `loan/` and `reservation/` together, and the renewal cap / loan duration are policy values that belong in `loan_policy` (see §2.9), not hardcoded constants.

### 2.5 `reservation/` — hold queue
```
reservation/
├── entity/
│   ├── Reservation.java
│   └── ReservationStatus.java         # enum: QUEUED, READY_FOR_PICKUP, EXPIRED, FULFILLED, CANCELLED
├── repository/ReservationRepository.java
├── service/
│   ├── ReservationQueueService.java   # FIFO queue logic per Resource
│   └── ReservationExpiryScheduler.java # cascades to next-in-queue on 48hr expiry
├── controller/ReservationController.java
└── dto/ReservationDto.java
```

> **The concurrency story needs schema backing, not just service-layer prose.** The last-copy race and the queue-position race are real, and the chosen locking strategy must be reflected in the DDL — see the `reservation` and `resource_copy` definitions in §3, which now carry a `UNIQUE (resource_id, queue_position)` constraint (two racing enqueues can't both land on position 3) and a `version` column on `resource_copy` for optimistic locking on availability transitions. Pessimistic (`@Lock(PESSIMISTIC_WRITE)`) is used specifically on the "grab the last available copy" path; optimistic `@Version` covers the lower-contention copy-status updates. Naming *which* strategy guards *which* path — rather than "we'll add locking" — is the actual decision.

### 2.6 `thesis/` — submission + embargo workflow
```
thesis/
├── entity/
│   ├── ThesisSubmission.java
│   └── SubmissionStatus.java          # enum: DRAFT, SUBMITTED, UNDER_REVIEW,
│                                         APPROVED, REJECTED, EMBARGOED, PUBLISHED
├── repository/ThesisSubmissionRepository.java
├── service/
│   ├── ThesisSubmissionService.java
│   ├── SupervisorApprovalService.java
│   └── EmbargoExpiryScheduler.java    # @Scheduled, flips EMBARGOED → PUBLISHED on date
├── controller/
│   ├── ThesisSubmissionController.java # student-facing: submit, check status
│   └── ThesisReviewController.java     # librarian/supervisor-facing: approve/reject
└── dto/ThesisSubmissionDto.java, EmbargoRequestDto.java
```

### 2.7 `journal/` — license gate + resolver
Reflects the link-resolver / proxy pattern confirmed from the real portal (URL stays on university domain before handoff).

```
journal/
├── entity/
│   ├── JournalLicense.java            # publisher, faculty scope, concurrent-user limit, expiry
│   └── LicenseScope.java              # enum or join table: which faculties/departments covered
├── repository/JournalLicenseRepository.java
├── service/
│   ├── LicenseAccessService.java      # checks: is user's faculty covered, is license active,
│   │                                    is concurrent-user cap exceeded
│   └── LinkResolverService.java       # simulates the internal resolver/proxy hop before
│                                         "redirecting" to publisher — logs access for license
│                                         renewal analytics, doesn't actually proxy real content
├── controller/JournalAccessController.java  # GET /api/journals/{id}/resolve
└── dto/LicenseCheckResultDto.java
```

`LinkResolverService` is intentionally a stub/simulation — it represents the architectural decision (gate + route, don't host) without needing real publisher integrations, which is appropriate scope for a portfolio piece.

> **`Thesis` (catalog record) vs `ThesisSubmission` (workflow) — the aggregate boundary, made explicit.** These are two entities for two lifecycle phases, and the relationship was previously unstated. `ThesisSubmission` (in `thesis/`) is the **workflow aggregate**: it owns the `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED/REJECTED → EMBARGOED → PUBLISHED` state machine, the supervisor approval, and the uploaded file. `Thesis` (in `resource/`, a `Resource` subtype) is the **catalog record**: it exists in the searchable OPAC only once a submission reaches `PUBLISHED`. The transition is one-directional and explicit — on `EmbargoExpiryScheduler` (or approval-to-publish) firing, the `ThesisSubmission` **projects** a `Thesis` catalog entry (1:1, `thesis_submission.resource_id` FK, nullable until published). A `ThesisSubmission` in `DRAFT` has no `Thesis` and is invisible to search — which is correct: unpublished theses aren't catalog records. The same catalog-vs-workflow split applies to `JournalArticle` (catalog record) vs `JournalLicense` (the licensing concern in `journal/`). This boundary is the single most important structural decision in the project; everything else is layout on top of it.

### 2.8 `ill/` — inter-library loan
```
ill/
├── entity/
│   ├── IllRequest.java
│   └── IllRequestStatus.java          # enum: SUBMITTED, UNDER_REVIEW, REQUESTED_EXTERNALLY,
│                                         FULFILLED, DELIVERED, RETURN_DUE, RETURNED, CANCELLED
├── repository/IllRequestRepository.java
├── service/IllRequestService.java
├── controller/
│   ├── IllRequestController.java      # student-facing
│   └── IllManagementController.java   # librarian-facing
└── dto/IllRequestDto.java
```

### 2.9 `member/`
```
member/
├── entity/
│   ├── Member.java                    # linked to JWT subject, not a credential store
│   ├── MemberType.java                # enum: UNDERGRAD, GRADUATE, FACULTY, STAFF
│   ├── Fine.java
│   └── LoanPolicy.java                # loan duration, renewal cap, fine rate, grace, max — per MemberType
├── repository/MemberRepository.java, FineRepository.java, LoanPolicyRepository.java
├── service/
│   ├── MemberService.java
│   └── FineCalculationService.java    # reads LoanPolicy — no hardcoded rates
├── controller/MemberController.java   # /api/members/me, /api/members/{id}/fines
└── dto/MemberProfileDto.java
```

> **Fine and loan rules get a home instead of being hardcoded.** `FineCalculationService` and the renewal logic (§2.4) both depend on values — fine rate per day, grace period, max fine cap, loan duration, renewal cap — that vary by `MemberType` (a PhD student's loan period ≠ an undergrad's). Scattering these as constants inside services contradicts the project's own thesis that *rules live in a resolvable place* (the same argument that justifies `AccessPolicyResolver`). A small `loan_policy` table keyed by member type is the consistent choice. `Fine` stays under `member/` (a fine belongs to a member's account) even though `fine.loan_id` references `loan` — defensible, just be ready to say why when an interviewer expects it under `loan/`.

### 2.10 `notification/`
```
notification/
├── entity/NotificationLog.java        # includes delivery status (SENT/FAILED/RETRYING)
├── service/
│   ├── NotificationService.java       # interface
│   └── EmailNotificationService.java  # @Async impl — reservation ready, overdue, embargo lifted
└── event/
    ├── ReservationReadyEvent.java
    ├── OverdueEvent.java
    └── ThesisPublishedEvent.java
```

> **Consumed asynchronously (see `AsyncConfig`, §2.1), and delivery can fail.** `notification_log` now carries a delivery status so a failed SES send is visible rather than silently lost. Full retry/dead-letter handling is out of scope for v1 (documented in §5), but recording *that* a send failed is cheap and worth having — "did the overdue email actually go out" should be answerable.

### 2.11 `audit/`
```
audit/
├── entity/AuditLogEntry.java
├── service/AuditLogService.java
└── aspect/AuditLoggingAspect.java     # AOP — logs state transitions across loan/thesis/ill
```

> **AOP audit is only as complete as its pointcut.** `AuditLoggingAspect` catches state transitions made through the annotated service methods — but a state change made via a *direct* `repository.save()` that bypasses those methods is invisible to the aspect. This is a known limitation of AOP-based auditing, not a bug: the mitigation is discipline (all state transitions go through service methods, never direct repository writes from controllers), and it's worth stating so the gap is a documented boundary rather than a silent hole.

### 2.12 `search/`
```
search/
├── service/
│   └── UnifiedSearchService.java      # queries across Resource subtypes, returns
│                                         PAGINATED PageResponse<ResourceSummaryDto>
└── controller/SearchController.java   # GET /api/search?q=...&type=...&page=...&size=...
```

> **This is the most expensive query on the most exposed endpoint — both facts matter.** `UnifiedSearchService` runs cross-subtype joins over a potentially large `resource` table on a *public, unauthenticated* route. Two consequences the earlier draft didn't thread through: (1) it **must** return `PageResponse<ResourceSummaryDto>` with a hard max page size — an unbounded catalog search is a denial-of-service waiting to happen; (2) the public search route needs basic throttling / result caps, unlike the authenticated routes. Pagination isn't just present as a `common/` class — it has to actually appear in this signature, which is where it was previously missing.

### 2.13 `common/`
```
common/
├── exception/
│   ├── GlobalExceptionHandler.java
│   ├── ResourceNotFoundException.java
│   ├── AccessDeniedDomainException.java
│   └── InvalidStateTransitionException.java
├── statemachine/
│   ├── StateTransitionValidator.java  # generic: is (from → to) legal for this entity?
│   └── TransitionRules.java           # declares legal transitions per state machine
├── pagination/PageResponse.java
└── BaseEntity.java                    # id, createdAt, updatedAt, @MappedSuperclass
```

> **A home for transition legality, mirroring what `AccessPolicyResolver` did for access.** The project has four state machines (`LoanStatus`, `ReservationStatus`, `SubmissionStatus`, `IllRequestStatus`) and already declares `InvalidStateTransitionException` — which means illegal transitions are a known concept with no owner. Left as-is, "is `QUEUED → FULFILLED` legal?" becomes ad-hoc `if` checks duplicated across `ReservationQueueService`, `ThesisSubmissionService`, and `IllRequestService` — the exact scattering `AccessPolicyResolver` was created to avoid for access rules. `StateTransitionValidator` centralizes the legal-transition map (e.g. `Map<State, Set<State>>` per machine in `TransitionRules`); each service asks it before transitioning and throws `InvalidStateTransitionException` on an illegal move. This is the structural consequence of the state diagrams being deferred in §5 — the diagrams are deferred, but the *place they'll live* is decided.

---

## 3. Database Schema (PostgreSQL, JOINED inheritance)

```sql
-- ============================================================
-- RESOURCE HIERARCHY (JOINED inheritance)
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

CREATE TABLE journal_article (
    id              BIGINT PRIMARY KEY REFERENCES resource(id),
    doi             VARCHAR(150),
    publisher       VARCHAR(300),
    journal_name    VARCHAR(300),
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
    role            VARCHAR(20) NOT NULL,            -- PERMISSIONS (drives @PreAuthorize): STUDENT, FACULTY, LIBRARIAN, ADMIN
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

- **`AccessPolicyResolver`** centralizes the access-contract table from the design doc — every resource type's access rule lives in one resolvable place, not scattered across controllers.
- **`StateTransitionValidator`** does for transition legality what `AccessPolicyResolver` does for access — one owner for "is this state move legal," not duplicated `if` chains across the four state machines.
- **`Thesis` vs `ThesisSubmission`** — catalog record (Resource subtype, appears in OPAC only when published) vs workflow aggregate (owns the state machine and file). The submission projects a catalog row on publish. Same catalog-vs-workflow split as `JournalArticle` vs `JournalLicense`.
- **Copy/loan status consistency, resolved.** `resource_copy.status` and `loan.status` were two sources of truth for "is this copy out." Decision: copy availability transitions go through `LoanService` only, guarded by the `resource_copy.version` optimistic lock, so a returned loan and a freed copy commit in the same transaction. A failed transaction leaves neither half applied rather than a copy stuck `ON_LOAN`. (DB triggers were the alternative — rejected as harder to test than service-layer logic under Testcontainers.)
- **Policy in data, not constants.** `loan_policy` holds loan duration, renewal cap, and fine parameters per member type — consistent with the "rules in a resolvable place" philosophy rather than hardcoded values in `FineCalculationService`.
- **`MockIdentityProviderController`** exists purely to make the SSO boundary runnable locally; it's a stand-in for the real university IdP, clearly separated and excluded from prod config. The swap seam is the `PublicKeyProvider` bean (static key in dev, JWKS endpoint in prod).
- **`LinkResolverService`** is a deliberate simulation, not a real publisher integration — it demonstrates the architectural pattern (gate + route through internal resolver) without needing actual EZproxy/OpenURL infrastructure.
- **Schedulers** (`OverdueCheckScheduler`, `ReservationExpiryScheduler`, `EmbargoExpiryScheduler`) are the background-job layer driving state transitions that aren't triggered by direct user action.
- **`resource_type` discriminator column** on the base `resource` table is kept even though JOINED inheritance technically infers type from join presence — having it as a real column simplifies search/filter queries significantly.
- **Notifications are async** (`AsyncConfig`), and `notification_log.delivery_status` records failures so a dropped email is visible rather than silent.
- Barcode/RFID hardware is explicitly out of scope; `barcode_label` exists as a data field only, not as an integration point.

---

## 5. Not Yet Decided (deliberately deferred)

Resolved since the first draft (moved out of this list): copy/loan status consistency (§4), optimistic-vs-pessimistic locking split (§2.5), and the home for state-transition legality (§2.13). Still open:

- Roles/permissions matrix detail (who can transition which state) — sketched as enums here, full matrix not yet drawn
- Full state machine diagrams for `SubmissionStatus`, `IllRequestStatus`, `ReservationStatus` transitions — the diagrams themselves, not their code home, which is now `TransitionRules`
- Notification retry / dead-letter handling — v1 records `delivery_status` but does not automatically retry `FAILED` sends
- Public-search throttling specifics — the need is named (§2.12), the exact rate-limit mechanism (bucket size, per-IP vs global) is not chosen
- Whether `research_report` and `rare_material` ever need per-subtype repositories — currently reached via `ResourceRepository`, revisited only if a unique query need appears
