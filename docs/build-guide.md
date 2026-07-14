# Build Guide — University Library Portal

## What this document is

This is the detailed, task-level expansion of `implementation-plan.md`. Where that document gives the phase summaries and the reasoning behind the ordering, this one is what you actually work from: concrete tasks per phase, in sequence, with explicit exit criteria and the dependencies that make the order non-negotiable.

It stays a single document on purpose. The phases are tightly dependent — Phase 3 builds on Phase 2's entities, which build on Phase 1's hierarchy — so splitting them into separate files would invite exactly the cross-file drift this project has otherwise been careful to avoid. Read it top to bottom; that *is* the build order.

**How to use it.** Each phase lists tasks in dependency order. A task is done when its check passes, not when the code "looks right." The exit criteria at the end of each phase are the honest gate — the risk that phase exists to retire is dead when those are green, and the next phase should not start before then. Resist working ahead: the value of risk-first is entirely lost if you start Phase 4 while Phase 2's concurrency is still unproven.

**Conventions used below.**
- *Task* — a concrete unit of work.
- *Check* — how you know the task is actually done (usually a test).
- *Teaches* — the TypeScript/NestJS concept the task is a natural vehicle for, since this project doubles as a learning path.
- *Depends on* — what must already be green before starting.

---

## Phase 0 — Scaffolding that makes everything else testable

**Risk retired:** "can I even run and test this stack end to end."
**Why first:** the hard risks ahead are only *provable* against real Postgres, so the harness that runs real Postgres must exist before the risky code does.

### Tasks

**0.1 — Initialize the NestJS project.**
Scaffold a NestJS app (`nest new`), TypeScript configured. Establish the module directory layout from the project structure (`resource/`, `loan/`, etc. as empty modules wired into `app.module.ts`).
*Check:* `npm run start` boots an empty app that responds on a health route.
*Teaches:* NestJS module system, dependency injection container, bootstrap.

**0.2 — Turn on strict mode and the lint gates now, while empty.**
Enable `strict` in `tsconfig` (including `strictNullChecks`, `noImplicitAny`). Add ESLint with rules banning `any` and unchecked casts. The point of doing this on an empty project is that every subsequent line is born under the gate rather than retrofitted.
*Check:* a deliberately-added `const x: any = 1;` fails lint in CI.
*Teaches:* the discipline that separates professional TypeScript from "JavaScript with types" — strict null handling from line one.

**0.3 — Connect Prisma to a real Postgres via Docker Compose.**
Docker Compose file running Postgres. Prisma initialized, `DATABASE_URL` from env, `PrismaService` as a global injectable provider with connect/disconnect lifecycle hooks. One trivial model to prove the pipeline (it can be deleted after).
*Check:* `prisma migrate dev` applies against the container; `PrismaService` connects on boot.
*Teaches:* Prisma schema/generate/migrate cycle; NestJS lifecycle hooks; provider scoping.

**0.4 — Wire Testcontainers-for-Node on day one.**
Set up `@testcontainers/postgresql` so integration tests spin up real, disposable Postgres, apply migrations (`prisma migrate deploy`), and tear down. Write one trivial integration test that inserts and reads a row against the container.
*Check:* the integration test runs green in CI, spinning up and tearing down its own Postgres.
*Teaches:* integration-testing discipline; why mocked ORMs miss real query/constraint bugs — the reasoning behind everything in Phases 1–2.

**0.5 — Add the dependency-cruiser module-boundary check, empty.**
Configure `dependency-cruiser` (or the ESLint boundary equivalent) with the search-API-must-not-import-persistence rule from the search contract, even though those modules don't exist yet. It guards from the moment they do.
*Check:* a deliberate forbidden import fails the build.
*Teaches:* architecture-as-a-build-constraint; the difference between "we agreed not to" and "you can't."

### Phase 0 exit criteria
App boots and connects to Postgres; one Testcontainers integration test is green in CI; `strict`, the `any` ban, and the dependency-cruiser boundary check are all active and demonstrably failing on violations. Nothing domain-specific exists yet — that is correct.

---

## Phase 1 — The resource hierarchy, in isolation

**Risk retired:** "does the hand-modeled Prisma hierarchy actually work — the thing the whole stack choice bets on."
**Why now:** it is the single biggest uncertainty and everything else sits on top of it. Prove it before building on it.
**Depends on:** Phase 0 (needs the Testcontainers harness to prove anything).

### Tasks

**1.1 — Model the base + five subtype tables in Prisma.**
In `schema.prisma`: the `resource` base model plus `physical_book`, `thesis`, `journal_article`, `research_report`, `rare_material`, each with a primary key that is also a foreign key to `resource.id` (the shared-PK 1:1 pattern that stands in for JOINED inheritance). Include the normalized `journal` table and `journal_article`'s `journal_id` FK + citation fields.
*Check:* `prisma migrate` produces the six-table structure; a manual insert confirms a subtype row shares its base row's id.
*Teaches:* modeling inheritance by hand when the ORM lacks it; Prisma relations; why the relational design is ORM-independent.

**1.2 — Define the discriminated union in TypeScript.**
`resource.types.ts`: a discriminated union over the five subtypes keyed on `resource_type`, with a shared base shape. Add an exhaustiveness helper (the `never`-assertion pattern in the `default` branch of a discriminating switch).
*Check:* a switch over the union that omits one case fails to compile; adding a hypothetical sixth member breaks compilation exactly where exhaustiveness is asserted.
*Teaches:* discriminated unions, exhaustiveness checking, the `never` type — the single most important TypeScript pattern in the project.

**1.3 — Build `ResourceService` owning the creation invariant.**
The service method that creates a resource writes the base `resource` row and the subtype row inside one `prisma.$transaction`, so the two are atomic. This is where the "subtype never exists without its base, created together" invariant lives — because Prisma has no ORM feature to enforce it.
*Check (integration, against Testcontainers):* creating a subtype persists both rows; forcing a failure mid-transaction (e.g. a constraint violation on the subtype write) rolls back the base row too, leaving neither.
*Teaches:* Prisma interactive transactions; transaction typing; service-owned invariants as a deliberate design choice.

**1.4 — Prove exhaustiveness end to end with a read path.**
A minimal `ResourceService` read that fetches a resource and narrows it through the discriminated union to its concrete subtype, with the compiler forcing all five cases handled.
*Check:* reading each of the five types returns the correctly-narrowed shape; the narrowing is compiler-verified, not runtime-cast.
*Teaches:* type narrowing, the payoff of the discriminant at the point of consumption.

> **Optional demo pull-forward (noted, not default).** A single read-only `GET /resources/:id` could be added here for a visible milestone. It slightly dilutes risk-first purity — the API layer proper is Phase 4 — so only do this if a visible checkpoint is genuinely needed now.

### Phase 1 exit criteria
Integration tests confirm: (a) a subtype row cannot exist without its base row; (b) the creation transaction rolls back cleanly on failure, leaving neither half; (c) a missing case in the discriminated union is a compile error. The hardest bet in the stack is now proven.

---

## Phase 2 — Concurrency, on the one path that needs it

**Risk retired:** "can I actually enforce the last-copy race and the queue-position race correctly."
**Why now:** concurrency bugs surface late and hurt most; retire them under a controlled test, not in a demo.
**Depends on:** Phase 1 (needs `PhysicalBook` and the resource base to hang copies and reservations on).

### Tasks

**2.1 — Model `ResourceCopy`, `Loan`, `Reservation` in Prisma.**
Include `resource_copy.version` (for optimistic locking), the `loan` fields (`status`, `renewal_count`, timestamps), and the `reservation` table with the `UNIQUE (resource_id, queue_position)` constraint.
*Check:* migration applies; the unique constraint exists in the database.
*Teaches:* modeling concurrency controls at the schema level, not just in code.

**2.2 — Implement the optimistic-lock path for copy availability.**
Copy status transitions go through a conditional update: `updateMany` with `where: { id, version }`, then check the affected-row count — zero means someone else won the race, and the operation retries or fails. Prisma has no `@Version` annotation, so the version check is explicit in the predicate.
*Check (integration):* two concurrent updates to the same copy — exactly one succeeds, the other sees zero rows affected and handles it.
*Teaches:* optimistic locking by hand; why the affected-row count is the concurrency signal; compare-and-set thinking.

**2.3 — Implement the pessimistic path for the last-copy grab.**
The "reserve the last available copy" path uses an interactive transaction issuing a raw `SELECT ... FOR UPDATE` (via `$queryRaw`) to lock the candidate row before deciding.
*Check (integration):* fire two simultaneous last-copy reservations; assert exactly one wins and the other is cleanly rejected, not errored.
*Teaches:* pessimistic row locking; when `FOR UPDATE` is the right tool over optimistic retry; raw queries inside Prisma transactions.

**2.4 — Prove the queue-position race.**
Enqueue logic that assigns `queue_position`, protected by the unique constraint so two racing enqueues cannot both take the same slot.
*Check (integration):* two concurrent enqueues for the same resource — both succeed with distinct positions, or one retries; neither collides.
*Teaches:* using database constraints as concurrency enforcement rather than application-level coordination.

### Phase 2 exit criteria
A test fires two simultaneous reservations at the last available copy and asserts exactly one wins; a test confirms the queue-position uniqueness constraint rejects a colliding enqueue. Both locking strategies are proven against real Postgres.

---

## Phase 3 — Access policy and state machines (the domain's brain)

**Risk retired:** "does the access-contract and transition-legality logic hold together across all five types without scattering into duplicated conditionals."
**Why now:** high design risk (easy to get subtly wrong), so build and test it in isolation before any controller depends on it.
**Depends on:** Phase 1 (the hierarchy it resolves access over) and Phase 2 (the state-bearing entities it validates transitions for).

### Tasks

**3.1 — Build `AccessPolicyResolver`.**
One provider that, given a member and a resource, resolves the access decision per the access-contract table: borrow (physical), license-gated (journal, checking faculty scope + concurrent limit + validity window), embargo (thesis, checking `embargo_until` and submission status), department-scoped (research report), supervised-only (rare material). The discriminated union from Phase 1 drives exhaustive per-type handling.
*Check:* unit + integration tests cover every resource type's access contract, including the deny paths (expired license, wrong faculty, active embargo, unpublished thesis).
*Teaches:* centralizing scattered logic behind one resolver; exhaustive union handling doing real domain work; strategy-like dispatch in TypeScript.

**3.2 — Build `StateTransitionValidator` and the transition-rules map.**
A generic validator holding, per state machine (loan, reservation, submission, ILL), the legal-transition map (`Map<State, Set<State>>` in `transition-rules.ts`). Each service asks it before transitioning; an illegal move throws `InvalidStateTransitionException`.
*Check:* tests assert every legal transition passes and a representative set of illegal ones (e.g. `QUEUED → FULFILLED` skipping `READY_FOR_PICKUP`) are rejected.
*Teaches:* generics over enum-typed state; modeling a state machine as data rather than scattered `if`s; the same "one owner" pattern as the access resolver.

**3.3 — Wire the validators into the entity services.**
`LoanService`, `ReservationQueueService`, `ThesisSubmissionService`, `IllRequestService` each consult `StateTransitionValidator` at their transition points, and access-gated reads consult `AccessPolicyResolver`.
*Check:* an attempt to drive any entity through an illegal transition is blocked at the service layer, with the exception surfacing correctly.
*Teaches:* composing domain services around shared policy providers; keeping controllers thin by putting rules in services.

### Phase 3 exit criteria
Tests cover every access contract (borrow / license / embargo / department / supervised) and every legal and illegal state transition per machine, with illegal transitions raising `InvalidStateTransitionException`. The hard domain core is complete and proven — everything after this is comparatively routine.

---

## Phase 4 — API layer over the proven core

**Risk retired:** "is the API surface correct and the auth boundary sound."
**Why now:** the domain underneath is already trustworthy, so this phase isolates exposure-and-auth concerns from domain concerns.
**Depends on:** Phase 3 (exposes the proven core; guards call the access resolver).

### Tasks

**4.1 — Build controllers over the domain services.**
NestJS controllers for resources, loans, reservations, theses, journals, ILL, members — thin, delegating to the Phase 1–3 services. DTOs validated at the boundary with Zod (or `class-validator`).
*Check:* e2e tests (Supertest) hit each route and get correct responses against a Testcontainers-backed app.
*Teaches:* NestJS controllers, request/response DTOs, validation pipes, boundary validation.

**4.2 — Implement the JWT relying-party auth boundary.**
`JwtAuthGuard` validating an incoming token via a passport-jwt strategy; `RolesGuard` + `@Roles()` decorator for role checks; finer per-resource checks delegating to `AccessPolicyResolver`.
*Check:* a request without a valid token is rejected; a valid token attaches typed claims; a role-gated route rejects the wrong role.
*Teaches:* NestJS guards, Passport integration, decorator metadata, the relying-party pattern (consume identity, don't own it).

**4.3 — Wire the `PublicKeyProvider` seam and the mock IdP.**
The strategy resolves its signing key through a `PublicKeyProvider` interface with two bindings: dev (static key from the mock IdP controller) and prod (JWKS endpoint fetch, cached). Register the mock IdP controller in development config only.
*Check:* dev auth works end to end via the mock IdP; the prod binding is present and unit-tested against a fake JWKS even if not live.
*Teaches:* interface-based swapping via DI tokens; environment-conditional providers; the JWKS-vs-static-key boundary that makes the SSO seam real.

### Phase 4 exit criteria
Authenticated requests flow through guards to the domain services; the mock IdP issues tokens the guard validates; the `PublicKeyProvider` swap point is in place. First demoable end-to-end slice exists.

---

## Phase 5 — Search, behind its contract

**Risk retired:** "does the retrieval interface actually stay swappable."
**Why now:** contract-isolated by design; build it once the entities it searches exist and the API can expose it.
**Depends on:** Phase 1 (the resource hierarchy it indexes) and Phase 4 (the controller layer to expose it).

### Tasks

**5.1 — Define the `UnifiedSearchService` interface exactly per the contract.**
The interface, `SearchQuery`, `SearchResults`, `FacetFilter`, `FacetCount`, `FacetDimension` — in a module with no persistence dependency (the dependency-cruiser rule from Phase 0 now guards it for real).
*Check:* the boundary rule passes; the interface module imports nothing from Prisma.
*Teaches:* contract-first design; enforcing a boundary with the build.

**5.2 — Implement the Postgres FTS backing.**
`tsvector`/`tsquery` with `unaccent`, faceted filtering, facet counts returned *with* results (never a separate call), paginated `PageResponse` with a hard max page size.
*Check (integration):* search over seeded data returns correctly-ranked, faceted, paginated results; facet counts match the result set.
*Teaches:* Postgres full-text search; why facet counts must come from the same engine as results; pagination as a DoS guard on a public route.

**5.3 — Build the `InMemorySearchService` fake as the swap-safety proof.**
A second implementation satisfying the same interface over a hardcoded list. Kept as a permanent test fixture.
*Check:* every caller test that passes against the Postgres implementation also passes against the in-memory one — proving no Postgres-specific leak crossed the boundary.
*Teaches:* the empirical test of an abstraction — an interface is only as swappable as your ability to actually swap it.

**5.4 — Add throttling to the public search route.**
`@nestjs/throttler` (or equivalent) on the unauthenticated search endpoint, with a hard result cap.
*Check:* excessive requests are throttled; oversized page requests are clamped.
*Teaches:* rate limiting; treating the one public route differently from authenticated ones.

### Phase 5 exit criteria
Search returns paginated, faceted results over real data; `InMemorySearchService` satisfies the same interface and the same caller tests pass against it; the public route is throttled and page-size-capped.

---

## Phase 6 — Frontend, in broad layers

**Risk retired:** "does the one-definition-shared-across-the-wire model actually hold in practice."
**Why now:** the API it consumes is proven and authenticated; the shared types it imports were defined back in Phase 1.
**Depends on:** Phase 4 (the API + auth boundary) and Phase 5 (search, for the catalog view).

### Tasks

**6.1 — Scaffold the Vite/React/TypeScript SPA with the shared types.**
Vite project, React Router, TanStack Query, the fetch/Axios interceptor that attaches the JWT. Import the `ResourceSummaryDto` discriminated union directly from the shared type definitions — do not re-describe it.
*Check:* the app builds under `strict`; the imported union is the exact same type the backend returns.
*Teaches:* the single-language payoff — one type definition, both sides; TanStack Query data fetching; SPA auth token handling.

**6.2 — Build catalog search (broad layer first).**
The search view over the Phase 5 endpoint: query input, facet filters, paginated results rendering each resource type through the discriminated union.
*Check:* all five resource types render with their correct type-specific summary; selecting a facet narrows results; rendering a wrong shape for a type is a compile error.
*Teaches:* discriminated-union rendering in React; facet UI; the compile-time safety net catching the "journal-as-book" bug in the UI.

**6.3 — Build resource detail.**
The per-resource detail view, narrowing to the concrete subtype and showing its type-specific fields and access status.
*Check:* each type's detail view shows the right fields; access status reflects the backend's `AccessPolicyResolver` decision.
*Teaches:* type narrowing at the component boundary; reflecting server-side authorization in the UI without re-implementing it.

**6.4 — Build the auth flow.**
Login against the mock IdP (dev), token storage, authenticated requests, role-aware UI (librarian views vs student views).
*Check:* logging in gates the right views; an expired/absent token routes to login.
*Teaches:* SPA auth lifecycle; role-conditional rendering; keeping the frontend ignorant of IdP specifics.

**6.5 — Build the workflow-heavy views last.**
Thesis submission (the multi-step workflow) and the live reservation queue (position, availability). These are the most stateful and are built last, on top of everything proven.
*Check:* a thesis can be submitted and moves through its states; the reservation queue reflects position and updates.
*Teaches:* complex client state; forms and multi-step workflows; the reservation queue as the closest thing to a real-time surface (and the natural place to later add live updates).

### Phase 6 exit criteria
The SPA renders all five resource types correctly via the shared union, authenticates against the Phase 4 boundary, and drives the thesis-submission and reservation-queue workflows end to end. The shared-types benefit is visible and enforced on both sides.

---

## Phase 7 — Cross-cutting and hardening

**Risk retired:** "can this run, be observed, and recover in a production-shaped environment."
**Why last:** none of it is on the critical path to proving the design is correct — the earlier phases did that.
**Depends on:** a working end-to-end system (Phases 4–6).

### Tasks

**7.1 — Audit interceptor.**
The Nest interceptor logging state transitions across loan/thesis/ILL/reservation into `audit_log_entry`. Document the known boundary: only transitions through intercepted service methods are captured — direct Prisma writes bypass it, so the discipline is that all state changes go through services.
*Check:* a state transition through a service produces an audit row; the coverage limitation is documented.
*Teaches:* NestJS interceptors; AOP-style cross-cutting concerns and their honest limits.

**7.2 — Asynchronous notifications with delivery status.**
Notification dispatch via the Nest event emitter (`@OnEvent`), writing `notification_log` with `delivery_status` (SENT/FAILED/RETRYING) so a dropped send is visible. Retry/dead-letter is deferred (BullMQ noted as the upgrade).
*Check:* triggering a notifiable event (reservation ready, overdue, embargo lifted) records a log row with delivery status; a simulated send failure records FAILED rather than vanishing.
*Teaches:* event-driven decoupling; not blocking the request path on I/O; recording failure as a first-class outcome.

**7.3 — Loan policy in data.**
The `loan_policy` lookup table keyed by member type (loan duration, renewal cap, fine rate, grace, max), consumed by `FineCalculationService` and the renewal logic — no hardcoded constants.
*Check:* changing a policy row changes loan/fine behavior without code changes; renewal is blocked when a reservation exists (the cross-subsystem rule).
*Teaches:* policy-as-data; the same "rules in a resolvable place" principle as the access resolver.

**7.4 — Deployment blueprint made real (or documented).**
Containerization, the CI/CD pipeline with migration-ordering (migrate before deploy), secrets management, health checks, the safe-rollout reasoning from the deployment doc. Live if feasible; documented-as-blueprint if not.
*Check:* the pipeline (or its documented form) reflects migration-before-deploy and rollback reasoning; secrets are not in code or task definitions.
*Teaches:* deployment ordering; why migration rollback is not symmetric with app rollback; secrets hygiene.

**7.5 — Close or log the deferred items.**
Public-search throttling specifics (if not fully done in 5.4), notification retry, `journal.issn` uniqueness decision, the roles/permissions matrix detail. Each either implemented or explicitly logged as post-v1 with its reasoning.
*Check:* every previously-deferred item is either done or recorded as a conscious post-v1 decision — none silently dropped.
*Teaches:* the discipline of closing the loop on deferred decisions rather than letting them rot into skew.

### Phase 7 exit criteria
Audit trail captures state transitions (with its coverage limit documented); notifications send asynchronously with failures recorded; loan policy lives in data; the deployment pipeline or blueprint reflects migration-ordering and safe-rollout; every deferred item is closed or consciously logged.

---

## The whole arc, one screen

- **Phase 0** — harness first, so the risky code is provable when it arrives.
- **Phase 1** — the hierarchy (biggest bet), proven in isolation.
- **Phase 2** — concurrency (worst-to-find bugs), proven under real races.
- **Phase 3** — access + transition logic (highest design risk), proven as pure domain.
- *— hard core complete; risk essentially retired —*
- **Phase 4** — expose it (API + auth).
- **Phase 5** — search, behind its swappable contract.
- **Phase 6** — the SPA, realizing the shared-types payoff.
- **Phase 7** — make it operable and close the loose ends.

The property that makes this plan honest: risk decreases monotonically. By the time anything is exposed or rendered, the thing underneath is already proven — the inverse of the common failure where the demo works early and the hard parts detonate late. Each phase's exit criteria are the gate; a phase is done when its risk is dead, not when its code looks finished.
