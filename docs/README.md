# University Library Portal

A full-stack university library discovery and access platform — the web-facing system a student, researcher, or faculty member signs into to find, access, reserve, and contribute academic resources. Not a circulation-desk system: no barcode scanners, no RFID, no hardware. The portal is the layer that answers "what does the library have, can I access it, and how."

---

## Status — in progress, TypeScript build phase

**This project is active but pre-implementation.** The design and architecture are substantially worked out (see the document set below); the build is deliberately paced to an in-progress goal: **implementing it as a TypeScript-only stack** (NestJS backend + Prisma + a React/TypeScript SPA), as a vehicle for learning TypeScript deeply while retaining a domain rich enough to be worth building.

What this means in practice:

- **The domain design is stable** — the resource hierarchy, access contracts, provenance model, and search architecture are settled and documented, and are independent of language or ORM.
- **The stack is settled on TypeScript end to end** — NestJS on the backend (chosen because the architecture was already worked out in Spring-equivalent terms, so it ports almost one-to-one), Prisma as the ORM, PostgreSQL unchanged, and a Vite/React/TypeScript SPA. The reasoning, including the honest tradeoff below, is in `stack-decision.md`.
- **The build resumes and deepens as TypeScript proficiency grows** — implementation is paced to double as the learning path, not rushed ahead of it.

### The honest tradeoff being accepted

The centerpiece of the domain design is the abstract `Resource` type with five concrete subtypes, each with a different access contract. In a Java/Spring design this maps cleanly onto Hibernate's JOINED inheritance — the single strongest argument for that stack. TypeScript's ecosystem handles this *less* gracefully: Prisma (chosen for its type safety and migration DX) has no table inheritance at all, so the six-table hierarchy is **hand-modeled** — five 1:1 relations to a base `resource` row, with the "subtype shares the base id, created atomically" invariant owned by a service-layer transaction rather than an ORM feature.

This cost is accepted on purpose. A domain that pushes against the tooling teaches more than a CRUD app that doesn't, and owning the hierarchy invariant explicitly is arguably *more* legible than an annotation that hides it. Where TypeScript is genuinely strong here — a discriminated-union model of the five resource types shared across the whole stack, end-to-end type safety from database to UI — is exactly where the learning value concentrates.

---

## Background — why this exists

University libraries sit on top of a genuinely hard access problem that most library software doesn't model well. A public library lends books: one resource type, one access rule, one lifecycle. A university library manages resources whose access contracts are fundamentally different from one another — a licensed journal the institution doesn't own, a thesis under a two-year embargo, a rare manuscript that never leaves a supervised reading room, a research report scoped to one department, an ordinary book with physical copies to lend, and inter-library requests for things the library doesn't hold at all.

Much of the software serving this space is either aging institutional infrastructure or generic library-management tooling that flattens these distinctions into a single "item" abstraction with a type column. That flattening is exactly where it breaks down: an embargo is not a due date, a license is not ownership, a supervised-access manuscript is not a reservable book. Treating them the same forces the complexity into brittle conditional logic instead of the data model, and the system becomes progressively harder to extend as the institution's needs grow.

This project is a modernization take on that problem: model the access-contract differences honestly, at the data and architecture level, so the system is correct today and extensible tomorrow — rather than correct-looking today and cornered later.

---

## Purpose

Build a university library portal whose **design reflects the real structure of academic resource access**, and whose architecture is deliberately shaped so that the hard parts (resource-type divergence, license gating, embargo enforcement, cross-type search) live in the model rather than in accumulated special-case code.

The guiding principle throughout: **domain complexity is what the design is for.** Every significant decision is made to keep genuinely different things genuinely distinct — and to keep the seams where the system will need to grow clean enough to actually grow at.

---

## What it does

For the people who use it:

- **Discovery** — search across every resource type at once (books, theses, journal articles, research reports, rare materials), with faceted filtering by type, department, year, language, and access status, and relevance ranking that respects where a match occurred.
- **Access** — resolve a resource to the right access path for its type: borrow/reserve a physical book, download a thesis subject to embargo rules, route to a licensed journal article through a license-and-scope check, or request a supervised-access rare material.
- **Reservation** — join a hold queue for unavailable copies, with position tracking and time-bound pickup once ready.
- **Contribution** — submit a thesis through its approval workflow (student → supervisor review → librarian cataloguing → publication), including embargo requests.
- **Inter-library loan** — request material the library doesn't hold, tracked from submission through external fulfillment to return.

For the institution:

- Role-aware access (student / faculty / librarian / admin) built on consumed SSO identity, not a home-grown login.
- License management with concurrent-user limits, faculty scoping, and validity windows.
- Auditable state transitions and member notifications across the resource lifecycle.

---

## The problem it solves

Concretely, the system is built to get right the things a flattened "item" model gets wrong:

- **Different resources have different access contracts** — and the model encodes that as a real type hierarchy, so a new resource type is a new subtype with its own contract, not another branch in a growing conditional.
- **Licensed access is not ownership** — journal access is governed by a license with scope, limits, and an expiry, and can simply stop existing when a subscription lapses; the model treats that as a first-class fact.
- **Access can be time-gated by academic process** — embargoes restrict a thesis from public view for reasons a due date can't express, and enforcement is tied to that, not to circulation.
- **Search has to span structurally dissimilar records** — the hard search problem is ranking relevance across types that don't share fields, and the design targets that rather than pretending intent-prediction is the goal.
- **Identity belongs to the university, not the app** — the portal consumes an SSO-issued identity and authorizes from its claims, rather than owning credentials it has no business holding.

---

## Direction and destination

The project is built as a **blueprint that scales past its own first version** — the near-term implementation is deliberately scoped, but the seams are placed so growth is a change behind an interface, not a rewrite.

The clearest example is search: it starts on PostgreSQL full-text search, but the entire retrieval layer sits behind a `UnifiedSearchService` interface designed so a dedicated index (Elasticsearch/OpenSearch) can replace the engine — including facet counting — without callers noticing. The interface contract is enforced (compile-time and build-time) specifically so that "simple now, index later" stays a low-cost swap rather than an aspiration.

The same stretch-to-the-future intent runs through the rest of the architecture:

- **Deployment** is designed as a production blueprint (containerized backend, managed database, object storage for documents, secrets management, CI/CD with migration-ordering and safe-rollout reasoning) — documented as a design exercise whether or not every piece is live, so the operational thinking is legible independent of execution.
- **Auth** is modeled as an SSO relying-party from day one, so moving from a local mock identity provider to a real institutional IdP is a configuration boundary, not a redesign.
- **Extensibility** is a first-class concern — new resource types, a real search index, a query-log-driven autocomplete capability (captured now, built later) are all anticipated in the structure rather than retrofitted.

**Destination:** a university library portal that is honest about the domain's real complexity, correct in how it models access, and structured so that the paths it will most plausibly need to grow along — more resource types, heavier search, real institutional integration — are already clear, clean, and open.

---

## Document map

This repository is documentation-forward; the reasoning behind each decision is captured as standalone artifacts:

- **Project structure** — package layout, file tree, and the full SQL schema.
- **Data provenance & ingestion** — the foundational own-vs-route distinction: what the system is the source of truth for (the institutional repository) versus what it holds metadata for and routes to (licensed external content). Read this first for what the system fundamentally *is*.
- **Entity reference** — every entity's purpose, fields, and relationships in prose, plus a text-first relationship map.
- **ERD** — the entity-relationship diagrams (logical specialization view and physical six-table view of the resource hierarchy).
- **Stack decision** — why NestJS + Prisma + PostgreSQL + Vite/React, argued from domain fit and the TypeScript-learning goal.
- **Deployment blueprint** — the production-shaped deployment architecture and CI/CD pipeline reasoning.
- **Search design** — how search works and, as importantly, what it deliberately doesn't attempt.
- **Search interface contract** — the exact `UnifiedSearchService` contract and the mechanisms that keep the retrieval engine swappable.

Each document assumes the ones it depends on rather than re-arguing them, and is written to stand on its own for the reader who needs only that piece.
