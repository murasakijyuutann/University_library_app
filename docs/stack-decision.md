# Technology Stack Decision — University Library Portal

## Purpose of this document

This documents the architectural reasoning behind the technology choices for this project — not "what's familiar" but "what tool features map onto what domain problems." Each section follows the same shape: what the domain actually requires, why a specific tool's standout feature fits that requirement, and where alternatives would create friction.

The case made here is deliberately narrow to this domain. None of these are claims of universal "best" technology — they're claims of fit, conditional on the resource-hierarchy complexity and access-rule heterogeneity this system actually has. A simpler domain would not justify this stack.

---

## 1. Backend: Spring Boot (Java 21)

### The problem it has to solve

The system models an abstract `Resource` type with five concrete subtypes (PhysicalBook, Thesis, JournalArticle, ResearchReport, RareMaterial), each with different access rules, lifecycle states, and permission requirements. This is fundamentally a type-hierarchy-with-polymorphic-behavior problem, not a flat CRUD problem.

### Why Spring Boot fits

**JPA inheritance strategies are a first-class, mature feature.** `@Inheritance(strategy = InheritanceType.JOINED)` is purpose-built for "one abstract concept, multiple concrete shapes, shared base table, type-specific extension tables" — exactly the `resource` + `physical_book`/`thesis`/`journal_article` table relationship in the schema.

**Compile-time polymorphism catches domain errors before runtime.** A method in `AccessPolicyResolver` that should handle all five `Resource` subtypes can be written so that adding a sixth type later forces an explicit decision (sealed classes, exhaustive switch) — a missing case becomes a compile error, not a production incident.

**Spring Security's `@PreAuthorize` matches the SSO-relying-party auth pattern directly.** The system validates an externally issued JWT and authorizes based on its claims (`studentId`, `faculty`, `role`) — method-level security expresses "only FACULTY in this department can access this JournalArticle" declaratively, rather than as hand-rolled middleware logic.

### Where alternatives create friction

- **Go** — no inheritance, interfaces only. The `Resource` hierarchy would need reimplementation via composition, fighting the language to express something Java expresses natively.
- **Node/Express** — no compile-time type hierarchy without TypeScript decorators (TypeORM exists but its inheritance mapping is noticeably less mature than Hibernate's).
- **Django** — genuinely competitive (model inheritance exists: abstract base, multi-table) — but Python's dynamic typing means the "did I handle all five subtypes" check happens at runtime via tests, not at compile time.

---

## 2. Database: PostgreSQL

### The problem it has to solve

Beyond the JOINED inheritance tables: a faculty-scoped many-to-many relationship (`license_faculty_scope`), potentially irregular metadata fields (audit log payloads, future thesis metadata), a search requirement across heterogeneous resource types, and a known concurrency risk (two users reserving the last copy of the same resource simultaneously).

### Why PostgreSQL fits

**Native, well-optimized support for the JOINED inheritance query pattern.** Queries like `SELECT * FROM resource JOIN journal_article ... JOIN journal_license ...` are exactly the multi-table join shape Postgres's query planner handles well.

**`JSONB` columns provide an escape hatch for irregular data without abandoning relational integrity** — indexed and queryable, unlike a plain text blob. Relevant for `audit_log_entry.old_value`/`new_value` and any future semi-structured metadata.

**Built-in full-text search (`tsvector`/`tsquery`)** may cover the `UnifiedSearchService` requirement without introducing Elasticsearch as a separate infrastructure component — meaningful at this project's scope, where a second search service is overhead without a justified need.

**Well-documented row-level locking semantics directly address the concurrent-reservation problem.** `SELECT ... FOR UPDATE`, accessible via Spring Data JPA's `@Lock(LockModeType.PESSIMISTIC_WRITE)`, is a known, well-trodden pattern for "don't let two users reserve the last copy."

### Where alternatives create friction

- **MySQL** — functionally workable, but weaker JSON querying and a slight ecosystem-signal disadvantage in current product-company hiring.
- **MongoDB** — wrong fit. The data is fundamentally relational (`Loan` must reference a valid `Member` and `ResourceCopy`; `Thesis` must reference a valid `Member` as student) — a document store doesn't enforce this referential integrity natively, and the constraint would have to be hand-rolled in application code instead.

---

## 3. Frontend: Next.js 14+ (App Router), TypeScript

### The problem it has to solve

Different resource types require different trust boundaries at render time. Public catalog search can be freely exposed. A licensed `JournalArticle`'s access decision should not be made by client-side JavaScript a user could bypass or tamper with — and different routes naturally want different rendering strategies (static/cacheable catalog search vs. dynamic auth-gated thesis access vs. fully interactive librarian dashboards).

### Why Next.js fits

**Server Components allow JWT validation and access-policy checks before any restricted content reaches the browser.** In a plain client-rendered SPA, the access check is a `fetch()` call the client makes and trusts the response of. Next.js's server-side rendering layer avoids leaking restricted-content UI state to a user who shouldn't see it, even momentarily — though enforcement itself still lives on the Spring Boot backend regardless.

**Per-route rendering strategy matches the domain's actual heterogeneity** — static/ISR for public search, dynamic server-rendered for embargo-sensitive thesis pages, client-interactive for live reservation queues. A plain Vite/React SPA offers exactly one mode (client-rendered) for everything, a mismatch with this much access-rule variance.

**Route Handlers provide a natural home for the link-resolver simulation** — a thin Next.js API route that receives a journal-article access request, confirms license/auth state against the Spring Boot backend, and only then returns the redirect. This mirrors the real "URL stays on the university domain before handoff" behavior observed from an actual university portal.

### Where alternatives create friction

- **Vite + React** — fine for client-heavy apps with simple, uniform auth. Here it means every access decision either trusts client-side logic or requires an extra round-trip and loading state for content that ideally should never render client-side at all.
- **Vue/Nuxt** — closest competitor; Nuxt has comparable SSR and API-route capability. The gap is ecosystem maturity for the specific SSO/JWT-consumption auth pattern — NextAuth's custom-provider model is more battle-tested than Nuxt's equivalent.
- **Angular** — has SSR (Angular Universal) but bolted-on rather than foundational to the framework, and meaningfully heavier tooling than this project's scope justifies.

### Supporting libraries

- **NextAuth.js (Auth.js)** — handles the JWT/SSO consumption pattern; supports a custom credential provider, which is how the dev-only `MockIdentityProviderController` slots in without changing the consumption logic for a real IdP later.
- **TanStack Query** — client-side data fetching where Server Components aren't the right fit (e.g. live reservation queue updates).
- **Zod** — schema validation shared between frontend forms and API request shaping, matching backend DTOs.

---

## 4. The honest caveat

This is not a claim that there is only one correct stack. Django + PostgreSQL + Next.js would also be defensible — Django's ORM handles inheritance well too. Nuxt instead of Next.js loses little technically. What makes this specific trio the strongest combination for this project is that each component's standout feature (JPA inheritance, Postgres JSONB + row locking, Next.js Server Components) maps onto a problem this domain actually has, not a hypothetical one.

If the domain were simple CRUD with one uniform access rule for every user, this entire argument collapses and a much lighter stack would be the more honest choice. The justification holds only because the resource hierarchy and access-contract variance are real, demonstrated requirements — not assumed ones.
