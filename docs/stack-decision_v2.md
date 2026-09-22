# Technology Stack Decision — University Library Portal

## Purpose of this document

This documents the architectural reasoning behind the technology choices for this project — not "what's familiar" but "what tool features map onto what domain problems," and, where a tool is *not* the strongest fit, why it was chosen anyway with eyes open. Each section states what the domain actually requires, how the chosen tool meets (or deliberately compromises on) that requirement, and where alternatives would create friction.

The case here is narrow to this domain and honest about a specific tension: this project has **two goals held equally** — demonstrate senior-level domain modeling, *and* be a substantial TypeScript codebase built to learn the language deeply. Those goals don't always point at the same tool. Where they diverge, this document says so rather than pretending a single choice serves both perfectly.

---

## 1. Backend: NestJS (Node.js + TypeScript)

### The problem it has to solve

The system models an abstract `Resource` type with five concrete subtypes (PhysicalBook, Thesis, JournalArticle, ResearchReport, RareMaterial), each with different access rules, lifecycle states, and permission requirements. This is fundamentally a type-hierarchy-with-polymorphic-behavior problem layered over a structured, relational domain — not flat CRUD. It needs dependency injection, clear module boundaries, declarative authorization, and a place for domain services (`AccessPolicyResolver`, the state-machine services) to live with discipline.

### Why NestJS fits

**Its architecture vocabulary is already the one this project was designed in.** The entire design was originally worked out in Spring terms — modules, dependency injection, decorator-driven controllers, guards for authorization, providers for services. NestJS is deliberately the "Spring of the Node world," so that structure ports almost one-to-one: Spring `@Service` → Nest provider, `@RestController` → Nest controller, `@PreAuthorize` → Nest guard, Spring module → Nest module. The senior-signal value of the project lives in that architecture, and NestJS lets it survive the language switch intact rather than being re-derived ad hoc.

**TypeScript in strict mode does real domain work across the whole stack.** The `ResourceSummaryDto` is a discriminated union across five subtypes (`type` as the discriminant); TypeScript makes rendering or handling the wrong shape for a given type a *compile error* — the same "journal article silently treated as a physical book" failure guarded on both sides of the wire. One language end to end means the discriminated-union model, the DTOs, and the validation schemas are shared vocabulary rather than re-expressed per side.

**Guards and decorators express the SSO-relying-party auth pattern declaratively.** The system validates an externally issued JWT and authorizes from its claims (`studentId`, `faculty`, `role`). A Nest guard expresses "only FACULTY in this department may access this JournalArticle" as a declarative annotation on the handler, close to how `@PreAuthorize` did — not as hand-rolled middleware branching.

**It serves the second goal directly.** A substantial NestJS + TypeScript backend is a genuine vehicle for learning the language's type system under real pressure — discriminated unions, generics, strict null handling, decorator metadata — rather than exercising TypeScript shallowly in a thin client.

### The honest compromise being accepted

The original Java argument's single strongest point was **JPA's mature JOINED-inheritance mapping** of the resource hierarchy. TypeScript's ecosystem has no equal to it, and this project's chosen ORM (Prisma, see §2a) does not support table inheritance at all. So the hierarchy — the modeling centerpiece — is **hand-modeled**: `resource` plus five subtype tables as explicit 1:1 relations, with the "every subtype shares the resource's id" invariant enforced in a **service-layer transaction**, not by an ORM inheritance feature.

This is a real cost, stated plainly: the hardest, most interesting part of the domain is the part where the tooling helps least. It's accepted deliberately, because (a) a domain that pushes against the tooling teaches more than one the tooling handles for you, and (b) owning the hierarchy invariant in an explicit, testable service is itself a defensible design artifact — arguably *more* legible than an annotation that hides the mechanism, even if more code.

### Where alternatives create friction

- **Spring Boot (Java)** — the strongest *backend-modeling* choice, and the one this design came from; JPA JOINED inheritance is purpose-built for this hierarchy. Set aside because it doesn't serve the equally-weighted goal of learning TypeScript. If backend domain modeling were the *sole* goal, this would still be the pick — that honesty matters.
- **Express** — a minimal router, not an architecture: no DI, no modules, no opinionated structure. For a domain this layered (five types, four state machines, access-policy resolution) you'd hand-roll — inconsistently — the exact structure NestJS provides. Right for small services; this isn't one.
- **Fastify** — well-designed and fast, but fundamentally a performance-focused HTTP layer, not an application-architecture framework. It offers speed this system doesn't need and omits the structure it does. Worth noting NestJS can run *on* the Fastify adapter, so its speed is available without giving up Nest's structure.
- **tRPC** — tempting for end-to-end type safety without a REST layer, but it couples client and server by design — the opposite of this project's deliberately contract-first, engine-swappable boundaries (see the search interface contract). It would fight the architecture rather than serve it.

---

## 2. Database: PostgreSQL

### The problem it has to solve

Beyond the (now hand-modeled) six-table hierarchy: a faculty-scoped many-to-many relationship (`license_faculty_scope`), potentially irregular metadata fields (audit-log payloads, future thesis metadata), a search requirement across heterogeneous resource types, and a known concurrency risk (two members racing to reserve the last copy).

### Why PostgreSQL fits

**Native, well-optimized support for the multi-table join pattern the hierarchy produces.** Whether the six tables are generated by an ORM or hand-modeled, queries like `SELECT ... FROM resource JOIN journal_article ... JOIN journal_license ...` are exactly the join shape Postgres's planner handles well. The database choice is entirely independent of the ORM change — the DDL is the same relational design either way.

**`JSONB` columns provide an escape hatch for irregular data without abandoning relational integrity** — indexed and queryable, unlike a plain text blob. Relevant for `audit_log_entry` before/after values and any future semi-structured metadata.

**Built-in full-text search (`tsvector`/`tsquery`) is a genuine fit here, not a hedge.** The catalog is an English-language international academic collection (worldwide journal/thesis discovery, publisher metadata, DOIs), so Postgres's default text-search configuration tokenizes it correctly and covers the `UnifiedSearchService` requirement without introducing Elasticsearch as separate infrastructure. The one extension worth adding is **`unaccent`**, for diacritic-insensitive matching ("Muller" ↔ "Müller", "Jose" ↔ "José") — the real multilingual requirement of a Latin-script international catalog. A second search service would be unjustified overhead at this scope.

> **Scope note:** this assumes an English-language, Latin-script catalog. It deliberately does **not** target CJK-language records — Postgres's built-in parser can't tokenize Japanese/Chinese (no whitespace boundaries), which would require `pgroonga` or `pg_bigm`. Out of scope by design, stated so the assumption is explicit rather than accidental.

**Well-documented row-level locking directly addresses the concurrent-reservation problem.** `SELECT ... FOR UPDATE` is the well-trodden pattern for "don't let two members reserve the last copy." Under Prisma this is expressed via an interactive transaction issuing the locking read (raw `SELECT ... FOR UPDATE` where needed), rather than JPA's `@Lock(LockModeType.PESSIMISTIC_WRITE)` — same database primitive, different ORM surface.

### Where alternatives create friction

- **MySQL** — workable, but weaker on two things this project actually uses: `JSONB` querying/indexing (MySQL's `JSON` type is less capable) and the `unaccent` + full-text combination for the Latin-script catalog. Technical fit, not fashion.
- **MongoDB** — wrong fit. The data is fundamentally relational (`Loan` must reference a valid `Member` and `ResourceCopy`; `Thesis` must reference a valid `Member` as student). A document store doesn't enforce that referential integrity natively — it would be hand-rolled in application code, which is exactly backwards for this domain.

---

## 2a. ORM: Prisma

### The problem it has to solve

Map the relational schema to TypeScript with strong type safety, own the migration story, and — critically — provide a workable path for the resource hierarchy that Prisma can't model as inheritance.

### Why Prisma fits, and the seam it forces

**Type safety and developer experience are best-in-class, which serves the learning goal.** Prisma generates fully typed query clients from the schema; the compiler knows the shape of every row. For a project whose second purpose is learning TypeScript deeply, this keeps the type system engaged at the data layer, not just the UI.

**Migrations are explicit and version-controlled** (`prisma migrate`), which fits the deployment blueprint's migration-ordering discipline cleanly.

**The inheritance gap is met head-on, not worked around silently.** Prisma has no table inheritance, so the six-table hierarchy is modeled as `resource` plus five subtype tables with explicit 1:1 relations. The invariant "a subtype row always shares its `resource` row's id, created together atomically" is owned by a **service-layer transaction** (a resource-creation service that writes the base row and the subtype row in one `prisma.$transaction`). This is the concrete shape of the "hand-model the hierarchy" decision from §1 — and the project-structure document shows exactly where that seam lives.

### Where alternatives create friction

- **TypeORM** — closer to the Hibernate mental model (decorators, some table-inheritance support), so the *conceptual* port from the Spring design is more direct, and it could preserve an ORM-managed hierarchy. Set aside because its inheritance support is the less-loved, rougher-edged part of a less-loved ORM, and because Prisma's type safety and migration DX serve the learning goal better. The tradeoff is deliberate: give up ORM-managed inheritance (hand-model it instead) in exchange for stronger types everywhere else.
- **Raw SQL / query builder (Kysely, etc.)** — maximal control, and Kysely's type safety is excellent, but it pushes more mapping work onto every query and offers no migration framework out of the box. More friction than this project needs at its data layer.

---

## 3. Frontend: NestJS MVC + Handlebars + custom CSS + selective HTMX

### The problem it has to solve

Most portal interactions are **navigation, structured search, and state-changing forms** — not long-lived client-side workflows. The UI must render five heterogeneous resource types without conflating them, support dense staff screens (tables, facets, status badges, approval actions), and keep contested mutations (borrow, reserve, renew, approve) correct under concurrency. Access decisions and state transitions remain owned by NestJS domain services; the presentation layer formats and displays — it does not become a second authorization brain.

### Why server-rendered HTML fits (and a React SPA does not)

**The interaction shape does not earn a SPA.** Catalog search, resource detail, thesis review, and reservation actions are request/response workflows with URL-addressable state. A client-side router, global store, and API-token holder add machinery without matching need. React is unnecessary here — not because React is bad, but because this product is not a long-lived client application.

**TypeScript safety moves to view-models and presenters, not to JSX.** Handlebars templates are untyped, so exhaustiveness over the five resource types is enforced in TypeScript *before* render: presenters map domain results to a discriminated `ResourcePageViewModel` union, and a `Record<ResourcePageViewModel['type'], templateName>` mapping fails to compile if a subtype is missing. Prisma rows never enter templates; presenters own dates, labels, URLs, and *visible* actions. Visible actions are UX only — every mutation re-checks identity, authorization, and current state in the service.

**Correctness does not depend on rendering mode.** Server HTML does not magically guarantee fresh state. Contested updates still use optimistic/pessimistic concurrency (submitted `version` + conditional update / transactional lock). Stale submits return **409 Conflict** with the new state; successful POSTs redirect with **303 See Other**. HTMX may replace a partial; it must call the same service path and concurrency checks as a full form post.

**Same-origin auth fits the delivery model.** With HTML served from NestJS, prefer **HttpOnly Secure session cookies** (JWT or opaque session referencing verified SSO claims) over a JavaScript-held bearer token. State-changing forms need **CSRF protection**. The `PublicKeyProvider` seam (mock static key ↔ IdP JWKS) still validates identity at the boundary; only the transport to the browser changes.

### CSS: a small custom system, not Bootstrap or Pico

Staff screens need dense tables, facet panels, status badges, pagination, action groups, and destructive confirms. Bootstrap’s visual and component assumptions are broader than needed; Pico’s global element styling tends to get overridden until the “lightweight” win disappears. Prefer a deliberately small set of semantic primitives backed by CSS custom properties:

`button`, `button--primary|secondary|danger`, `action-group`, `form-field`, `filter-panel`, `data-table`, `status-badge`, `alert`, `pagination`, `breadcrumb`, `resource-summary`.

Vite (or equivalent) builds **assets only** — CSS and small TypeScript modules — not an application shell.

### Progressive enhancement boundaries

| Layer | Role |
|---|---|
| Handlebars | Full pages and partials; ordinary `action`/`method` forms and links first |
| HTMX (selective) | Search-result replacement, pagination, reservation-position refresh, renew/cancel, thesis status panel, dependent selects — never a separate business API |
| Vanilla TypeScript modules | Exceptional client-heavy work: presigned thesis upload, progress, cancel, retry |

No separate Express frontend. No client-side router. No global state store.

### Where alternatives create friction

- **React / Vite SPA** — correct for rich client apps; here it forces a second auth surface (JS token holder), duplicates routing already owned by Nest, and invents client state for flows that are naturally form+redirect. Previously chosen; superseded by this section.
- **Next.js** — SSR/RSC machinery and a second Node surface in front of Nest, without earning SEO or a public marketing site.
- **Bootstrap / Pico as the design system** — either too broad or too opinionated for dense library staff UI once tables, facets, and workflow actions land.
- **HTMX for everything** — becomes an ad-hoc RPC layer; constrain it to partial refresh of flows that already work as full page posts.

### Presentation layout (target)

```
src/web/
├── controllers/
├── presenters/
├── view-models/
└── views/
    ├── layouts/
    ├── partials/
    └── resources/
        ├── physical-book.hbs
        ├── thesis.hbs
        ├── journal-article.hbs
        ├── research-report.hbs
        └── rare-material.hbs
```

The existing JSON API (`/api/...`) remains useful for tooling, e2e, and any future non-HTML client; the human portal is HTML-first.

---

## 4. The honest caveat

This is not a claim of one correct stack — it's a set of choices under two goals held equally, and it's honest about where those goals pull apart.

If demonstrating **senior backend domain modeling were the sole goal**, the backend should be Spring Boot: JPA's JOINED inheritance maps the resource hierarchy more cleanly than anything in the TypeScript ecosystem, and this design was originally built around exactly that. That option is set aside not because it's weaker on the merits — it's stronger on the modeling merits — but because it doesn't serve the second, equally-weighted goal of learning TypeScript deeply. Choosing NestJS + Prisma is therefore a deliberate trade: accept a hand-modeled hierarchy (harder, more code, tooling helping less) in exchange for a TypeScript stack that is a genuine learning vehicle where types earn their keep (domain unions, view-models, API contracts).

What makes the combination coherent despite that trade: PostgreSQL's fit is unchanged (the database doesn't care which ORM maps it), NestJS preserves the architectural structure the Spring design established, and the UI now matches the product's actual interaction shape — server-rendered forms and search — instead of a SPA assumed by default. The compensating gain on the presentation side is real too: resource-type exhaustiveness is enforced in presenters and template maps, while mutation correctness stays in services and concurrency controls regardless of whether the response is a full page or an HTMX fragment.

If the domain were simple CRUD with one uniform access rule, this entire argument collapses and a far lighter stack would be the honest choice. It holds only because the resource hierarchy and access-contract variance are real, demonstrated requirements — and the hierarchy's difficulty under Prisma is, for the learning goal, a feature rather than a bug.
