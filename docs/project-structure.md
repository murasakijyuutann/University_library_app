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
└── SchedulingConfig.java              # enables @Scheduled for overdue/embargo jobs
```

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
│   └── ResourceStatus.java            # enum: AVAILABLE, ON_LOAN, RESERVED, RESTRICTED, EMBARGOED
├── repository/
│   ├── ResourceRepository.java
│   ├── PhysicalBookRepository.java
│   ├── ThesisRepository.java
│   ├── JournalArticleRepository.java
│   └── ResearchReportRepository.java
├── service/
│   ├── ResourceService.java           # shared logic across all types
│   ├── AccessPolicyResolver.java      # KEY CLASS — resolves "can this user access this resource"
│   │                                    per the access-contract table (borrow/license/embargo/supervised)
│   └── ResourceSearchService.java
├── controller/
│   └── ResourceController.java        # GET /api/resources, GET /api/resources/{id}
└── dto/
    ├── ResourceSummaryDto.java        # for search results — type-agnostic shape
    ├── ResourceDetailDto.java
    └── AccessStatusDto.java           # "available" | "license-gated" | "embargoed" | "supervised-only"
```

`AccessPolicyResolver` is the single most important class in the project — it's where the access-contract table (book vs article vs thesis vs ILL) becomes actual branching logic instead of duplicated `if` chains scattered across controllers.

### 2.4 `loan/` — physical book lifecycle
```
loan/
├── entity/
│   ├── Loan.java
│   └── LoanStatus.java                # enum: ACTIVE, RETURNED, OVERDUE, LOST
├── repository/LoanRepository.java
├── service/
│   ├── LoanService.java
│   └── OverdueCheckScheduler.java     # @Scheduled job, flips ACTIVE → OVERDUE, triggers fines
├── controller/LoanController.java
└── dto/LoanRequestDto.java, LoanStatusDto.java
```

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
│   └── Fine.java
├── repository/MemberRepository.java, FineRepository.java
├── service/
│   ├── MemberService.java
│   └── FineCalculationService.java
├── controller/MemberController.java   # /api/members/me, /api/members/{id}/fines
└── dto/MemberProfileDto.java
```

### 2.10 `notification/`
```
notification/
├── entity/NotificationLog.java
├── service/
│   ├── NotificationService.java       # interface
│   └── EmailNotificationService.java  # implementation — reservation ready, overdue, embargo lifted
└── event/
    ├── ReservationReadyEvent.java
    ├── OverdueEvent.java
    └── ThesisPublishedEvent.java
```

### 2.11 `audit/`
```
audit/
├── entity/AuditLogEntry.java
├── service/AuditLogService.java
└── aspect/AuditLoggingAspect.java     # AOP — logs state transitions across loan/thesis/ill
```

### 2.12 `search/`
```
search/
├── service/
│   └── UnifiedSearchService.java      # queries across Resource subtypes, returns
│                                         polymorphic ResourceSummaryDto list
└── controller/SearchController.java   # GET /api/search?q=...&type=...
```

### 2.13 `common/`
```
common/
├── exception/
│   ├── GlobalExceptionHandler.java
│   ├── ResourceNotFoundException.java
│   ├── AccessDeniedDomainException.java
│   └── InvalidStateTransitionException.java
├── pagination/PageResponse.java
└── BaseEntity.java                    # id, createdAt, updatedAt, @MappedSuperclass
```

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
    book_id         BIGINT NOT NULL REFERENCES physical_book(id),
    barcode_label   VARCHAR(50),                  -- label only, no scanner integration
    status          VARCHAR(20) NOT NULL,          -- AVAILABLE, ON_LOAN, RESERVED, LOST
    shelf_location  VARCHAR(100)
);

CREATE TABLE thesis (
    id                  BIGINT PRIMARY KEY REFERENCES resource(id),
    student_member_id   BIGINT NOT NULL REFERENCES member(id),
    supervisor_member_id BIGINT REFERENCES member(id),
    degree_type         VARCHAR(50),               -- BACHELOR, MASTER, PHD
    submission_status   VARCHAR(30) NOT NULL,
    embargo_until       DATE,
    file_path           VARCHAR(500),
    submitted_at        TIMESTAMP
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
    member_type     VARCHAR(20) NOT NULL,           -- UNDERGRAD, GRADUATE, FACULTY, STAFF
    faculty         VARCHAR(150),
    role            VARCHAR(20) NOT NULL,            -- STUDENT, FACULTY, LIBRARIAN, ADMIN
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

-- ============================================================
-- LOAN
-- ============================================================

CREATE TABLE loan (
    id              BIGSERIAL PRIMARY KEY,
    copy_id         BIGINT NOT NULL REFERENCES resource_copy(id),
    member_id       BIGINT NOT NULL REFERENCES member(id),
    status          VARCHAR(20) NOT NULL,            -- ACTIVE, RETURNED, OVERDUE, LOST
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
    expires_at      TIMESTAMP
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
    old_value       TEXT,
    new_value       TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE notification_log (
    id              BIGSERIAL PRIMARY KEY,
    member_id       BIGINT NOT NULL REFERENCES member(id),
    type            VARCHAR(50) NOT NULL,            -- RESERVATION_READY, OVERDUE, EMBARGO_LIFTED
    sent_at         TIMESTAMP NOT NULL DEFAULT now(),
    payload         TEXT
);
```

---

## 4. Notes on Decisions Reflected in This Structure

- **`AccessPolicyResolver`** centralizes the access-contract table from the design doc — every resource type's access rule lives in one resolvable place, not scattered across controllers.
- **`MockIdentityProviderController`** exists purely to make the SSO boundary runnable locally; it's a stand-in for the real university IdP, clearly separated and excluded from prod config.
- **`LinkResolverService`** is a deliberate simulation, not a real publisher integration — it demonstrates the architectural pattern (gate + route through internal resolver) without needing actual EZproxy/OpenURL infrastructure.
- **Schedulers** (`OverdueCheckScheduler`, `ReservationExpiryScheduler`, `EmbargoExpiryScheduler`) are the background-job layer driving state transitions that aren't triggered by direct user action.
- **`resource_type` discriminator column** on the base `resource` table is kept even though JOINED inheritance technically infers type from join presence — having it as a real column simplifies search/filter queries significantly.
- Barcode/RFID hardware is explicitly out of scope; `barcode_label` exists as a data field only, not as an integration point.

---

## 5. Not Yet Decided (deliberately deferred)

- Roles/permissions matrix detail (who can transition which state) — sketched as enums here, full matrix not yet drawn
- Whether `ResourceCopy` status and `Loan` status are kept in sync via service logic or DB triggers
- Optimistic vs pessimistic locking for concurrent reservation/loan creation on the last available copy
- Full state machine diagrams for `SubmissionStatus`, `IllRequestStatus`, `ReservationStatus` transitions
