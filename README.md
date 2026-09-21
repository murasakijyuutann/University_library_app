# University Library Portal

A university library **discovery and access** platform — the web-facing layer students, faculty, and librarians use to find, access, reserve, and contribute academic resources.

It is **not** a circulation-desk system: no barcode scanners, no RFID, no hardware. It answers *"what does the library have, can I access it, and how?"*

---

## What this project is trying to achieve

University libraries manage resources whose **access contracts are genuinely different**:

| Resource | Access reality |
|---|---|
| Physical book | Borrow / return / hold against copies |
| Thesis | Embargo + submission workflow; institution owns the content |
| Journal article | Licensed route to a publisher — never hosted here |
| Research report | Department-scoped institutional output |
| Rare material | Supervised reading-room access only |
| ILL request | Material the library does not hold |

Most library software flattens these into one “item” with a type column. That forces embargoes, licenses, and supervised access into brittle conditionals. This project’s goal is the opposite:

> **Model access-contract differences in the domain** — hierarchy, policy resolver, and state machines — so correctness lives in the model, not in accumulated special cases.

Two equal goals shape the stack:

1. **Senior-level domain modeling** of a real institutional problem (own vs route, licenses, embargoes, concurrency).
2. **A substantial TypeScript learning vehicle** — NestJS + Prisma + (planned) React — under enough pressure that types, modules, and tests matter.

---

## Status

**Backend Phases 0–4 are complete.** Search (Phase 5), the SPA (Phase 6), and operational hardening (Phase 7) are next.

| Phase | Focus | Status |
|---|---|---|
| 0 | Scaffolding, Postgres, Testcontainers, boundary lint | Done |
| 1 | Hand-modeled resource hierarchy + discriminated unions | Done |
| 2 | Loan / reservation concurrency under real races | Done |
| 3 | `AccessPolicyResolver` + state-transition validators | Done |
| 4 | REST API + JWT SSO relying-party + mock IdP | Done |
| 5 | Faceted search behind `UnifiedSearchService` | Next |
| 6 | Vite / React / TypeScript SPA | Planned |
| 7 | Audit, notifications, policy-as-data, deploy | Planned |

Build order and exit criteria: [`docs/build-guide.md`](docs/build-guide.md).

### What works today (backend)

- Five resource subtypes with atomic base+subtype creation
- Borrow / return, reservation queue, thesis & ILL state machines
- Per-type access decisions (embargo, license scope, department, supervised-only)
- Authenticated API (`JwtAuthGuard`, roles, member provisioning check)
- Dev mock IdP with a `PublicKeyProvider` seam (static key ↔ JWKS)
- Unit, integration (Testcontainers), and e2e (Supertest) coverage

Swagger (when the API is running): `http://localhost:3000/api/docs`

---

## Core idea: own vs route

The system is an **institutional repository** for what the university owns, plus a **license-and-metadata layer** that routes members to external licensed content. It is not a warehouse of the world’s papers.

Details: [`docs/data-provenance-and-ingestion_v2.md`](docs/data-provenance-and-ingestion_v2.md).

---

## Stack

| Layer | Choice |
|---|---|
| API | NestJS (TypeScript) |
| ORM / DB | Prisma + PostgreSQL |
| Auth | JWT relying party (mock IdP in dev; JWKS-ready for real SSO) |
| Frontend | Vite + React + TypeScript *(Phase 6)* |
| Search | Postgres FTS behind a swappable contract *(Phase 5)* |

**Honest tradeoff:** Prisma has no table inheritance. The six-table resource hierarchy is hand-modeled (shared PK 1:1), with the create invariant owned by a service transaction and exhaustiveness enforced by a TypeScript discriminated union. That cost is intentional — see [`docs/stack-decision_v2.md`](docs/stack-decision_v2.md).

---

## Repository layout

```
├── README.md                 ← you are here
├── backend/                  ← NestJS API (Phases 0–4 live here)
│   ├── prisma/               ← schema + migrations
│   ├── src/                  ← domain modules (resource, loan, …)
│   └── test/                 ← unit / integration / e2e
└── docs/                     ← design & build docs (see map below)
```

---

## Quick start (backend)

Requires Node.js, Docker (for Postgres and Testcontainers).

```bash
cd backend
cp .env.example .env
npm install
npm run db:up                 # local Postgres via Docker Compose
npx prisma migrate deploy
npm run start:dev             # http://localhost:3000
```

Smoke the auth boundary:

```bash
# Issue a fake SSO token (dev only)
curl -s -X POST http://localhost:3000/auth/mock-idp/token \
  -H "Content-Type: application/json" \
  -d "{\"sub\":\"demo-student\",\"role\":\"STUDENT\"}"

# Then GET /api/members/me with Authorization: Bearer <token>
# (member row must be provisioned for that SSO sub)
```

### Tests

```bash
cd backend
npm test                      # unit
npm run test:integration      # Testcontainers + real Postgres
npm run test:e2e              # full API + auth against Testcontainers
```

---

## Architecture seams (why growth stays cheap)

- **Access** — one `AccessPolicyResolver` for all five resource types
- **Transitions** — shared `StateTransitionValidator` for loan / reservation / thesis / ILL
- **Auth** — consume identity; swap mock static key → IdP JWKS without rewriting guards
- **Search** *(Phase 5)* — `UnifiedSearchService` so Postgres FTS can later yield to OpenSearch
- **Deploy** — production-shaped blueprint (ECS/RDS/S3), not yet provisioned

---

## Documentation map

Prefer the **current** versions (`*_v2` / `_v3` where they exist). Older unversioned copies are historical.

| Doc | What it covers |
|---|---|
| [`docs/build-guide.md`](docs/build-guide.md) | Phased build order and exit criteria — **start here to implement** |
| [`docs/data-provenance-and-ingestion_v2.md`](docs/data-provenance-and-ingestion_v2.md) | Own vs route; what the system fundamentally *is* |
| [`docs/project-structure_v3.md`](docs/project-structure_v3.md) | Modules, API shape, schema |
| [`docs/entity-reference_v2.md`](docs/entity-reference_v2.md) | Entities and relationships in prose |
| [`docs/stack-decision_v2.md`](docs/stack-decision_v2.md) | Why NestJS / Prisma / Postgres / React |
| [`docs/search-design.md`](docs/search-design.md) | Retrieval across dissimilar types; what search deliberately skips |
| [`docs/search-interface-contract.md`](docs/search-interface-contract.md) | Exact `UnifiedSearchService` contract |
| [`docs/deployment-blueprint.md`](docs/deployment-blueprint.md) | Production deploy / CI reasoning |
| [`docs/aws-cloud-infrastructure-plan.md`](docs/aws-cloud-infrastructure-plan.md) | Concrete AWS layout (proposed, not provisioned) |

Index: [`docs/README.md`](docs/README.md).

---

## Destination

A portal that is honest about academic access complexity, correct in how it models it, and structured so the next steps — richer search, a typed SPA, real institutional SSO and cloud deploy — are extensions behind existing seams, not a rewrite.
