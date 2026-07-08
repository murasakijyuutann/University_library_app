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

**Built-in full-text search (`tsvector`/`tsquery`) is a genuine fit here, not a hedge.** The catalog is an English-language international academic collection (worldwide journal/thesis discovery, publisher metadata, DOIs — the domain this project is modeled on), so Postgres's default text-search configuration tokenizes it correctly and covers the `UnifiedSearchService` requirement without introducing Elasticsearch as a separate infrastructure component. The one extension worth adding is **`unaccent`**, so diacritic-insensitive matching works ("Muller" ↔ "Müller", "Jose" ↔ "José") — which is the actual multilingual requirement of a Latin-script international catalog. A second search service would be unjustified overhead at this scope.

> **Scope note:** this assumes an English-language, Latin-script catalog. It deliberately does **not** target CJK-language records — Postgres's built-in parser can't tokenize Japanese/Chinese (no whitespace boundaries), which would require `pgroonga` or `pg_bigm`. That's out of scope by design, stated here so the assumption is explicit rather than accidental.

**Well-documented row-level locking semantics directly address the concurrent-reservation problem.** `SELECT ... FOR UPDATE`, accessible via Spring Data JPA's `@Lock(LockModeType.PESSIMISTIC_WRITE)`, is a known, well-trodden pattern for "don't let two users reserve the last copy."

### Where alternatives create friction

- **MySQL** — functionally workable, but weaker on two things this project actually uses: `JSONB` querying/indexing (MySQL's `JSON` type is less capable), and the `unaccent` + full-text combination for the Latin-script catalog. The choice is on technical fit, not ecosystem fashion.
- **MongoDB** — wrong fit. The data is fundamentally relational (`Loan` must reference a valid `Member` and `ResourceCopy`; `Thesis` must reference a valid `Member` as student) — a document store doesn't enforce this referential integrity natively, and the constraint would have to be hand-rolled in application code instead.

---

## 3. Frontend: Vite + React + TypeScript (SPA)

### The problem it has to solve

The frontend consumes an API whose access decisions are all made and enforced by the Spring Boot backend. It needs to render five heterogeneous resource types without conflating them (a journal article must not render as if it were a physical book), hold and send a JWT on authenticated requests, and provide interactive views (live reservation queues, librarian dashboards). Crucially, almost none of this system's genuine complexity — access rules, state machines, inheritance, concurrency — lives in the frontend; it lives in the backend. The frontend's job is to be a correct, type-safe, low-friction client, not a second place where authorization is reasoned about.

### Why a plain Vite SPA fits

**The backend is the single auth authority, and an SPA keeps it that way.** Enforcement lives on Spring Boot regardless of frontend framework. An SPA simply doesn't fetch gated content until the backend authorizes the request — and the backend never returns restricted content without a valid token. There is no second server-side trust boundary to design, secure, and keep in sync with the real one. The frontend holds the JWT and attaches it; that's the whole auth surface.

**TypeScript does real domain work here — this is where it earns its place.** The `ResourceSummaryDto` is a discriminated union across five subtypes (`type` as the discriminant). TypeScript makes rendering the wrong shape for a given type a *compile error*, which is exactly the "journal article silently rendering as a physical book" failure the CI typecheck gate is meant to catch. This is the frontend's one genuinely load-bearing correctness property, and a plain React SPA supports it fully.

**One rendering mode is the right amount of mode for this app.** Gated academic access is not SEO-indexed, so server-side rendering buys nothing here — there is no public, crawlable surface that needs pre-rendering. Client-rendering everything, with the backend gating data, matches the domain without adding a rendering-strategy matrix the app doesn't need.

**Faster to a finished, demonstrable build.** The project's value is backend domain depth; the frontend should reach "working demo" with the least incidental infrastructure. A Vite SPA drops SSR servers, a second deploy target, and framework-specific auth plumbing — surface area that isn't the point of the project.

### Where alternatives create friction

- **Next.js (App Router)** — its headline advantages don't pay off here. Server Components "not leaking restricted UI" reduces to almost nothing once the backend is the enforcement point and the SPA simply doesn't fetch gated data. SSR/ISR matters for *public, indexable* pages, which a gated academic tool doesn't have. And **NextAuth in front of a Spring Boot JWT backend is a notoriously fiddly integration** (session ownership, token refresh, and weak SAML support — awkward precisely because real institutional SSO is typically Shibboleth/SAML). It adds a second auth surface to model the very boundary the backend already owns. Next.js would be the right call only if showcasing modern-frontend technique (RSC/SSR/streaming) were itself a goal of the project — which, for a backend-depth portfolio piece, it isn't.
- **Vue/Nuxt or Angular** — both bring SSR-first framings this app doesn't need; Angular additionally carries heavier tooling than the scope justifies. Same reasoning as Next.js: SSR is a cost without a payoff here.

### Supporting libraries

- **React Router** — client-side routing for the SPA's views (catalog search, resource detail, thesis submission, librarian dashboard).
- **TanStack Query** — now the primary data-fetching layer (not a fallback): caching, request dedup, and polling for the live reservation queue. Carries more weight here than it did under an SSR framing.
- **Auth: a lightweight token holder, not a framework.** The JWT from the (mock, later real) IdP is stored and attached to API calls via an Axios/fetch interceptor; refresh is a single call against the backend. No NextAuth — the backend's `PublicKeyProvider` seam (static key in dev, JWKS in prod) is the only place IdP specifics live, and the frontend stays ignorant of them.
- **Zod** — schema validation shared between frontend forms and API request/response shaping, matching backend DTOs; pairs naturally with the discriminated-union summary type.

---

## 4. The honest caveat

This is not a claim that there is only one correct stack. Django + PostgreSQL would handle the backend inheritance well too, and Vue instead of React on the frontend loses little. What makes this specific combination the strongest for this project is that each backend component's standout feature (JPA inheritance, Postgres JSONB + row locking + Latin-script FTS) maps onto a problem this domain actually has — and the frontend is deliberately kept thin, because this domain's complexity is almost entirely server-side. A heavier frontend framework (Next.js and its SSR/RSC machinery) would add surface area without a matching problem to solve, since there is no public indexable content and the backend is the sole auth authority. The frontend choice is therefore *subtractive by design* — the honest move is the lighter tool, not the more impressive one.

The one condition that flips this: if demonstrating modern-frontend technique (SSR, React Server Components, streaming) were itself an explicit goal, Next.js becomes correct and its complexity becomes the point. For a portfolio piece whose purpose is senior-level backend domain modeling with a working full-stack demo, it isn't.

If the domain were simple CRUD with one uniform access rule for every user, this entire argument collapses and an even lighter stack would be the more honest choice. The justification holds only because the resource hierarchy and access-contract variance are real, demonstrated requirements — not assumed ones.
