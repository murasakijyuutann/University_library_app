# Documentation

Design and build artifacts for the University Library Portal. The project overview, status, and quick start live in the root [`README.md`](../README.md).

## Read in this order (recommended)

1. **[`data-provenance-and-ingestion_v2.md`](data-provenance-and-ingestion_v2.md)** — own vs route; what the system *is*
2. **[`stack-decision_v2.md`](stack-decision_v2.md)** — NestJS / Prisma / Postgres / Handlebars+HTMX and the inheritance tradeoff
3. **[`project-structure_v3.md`](project-structure_v3.md)** — modules, API surface, schema
4. **[`build-guide.md`](build-guide.md)** — phased implementation and exit criteria
5. **[`search-design.md`](search-design.md)** + **[`search-interface-contract.md`](search-interface-contract.md)** — before Phase 5
6. **[`deployment-blueprint.md`](deployment-blueprint.md)** + **[`aws-cloud-infrastructure-plan.md`](aws-cloud-infrastructure-plan.md)** — ops shape (design / proposed)

## Full map

| Document | Role |
|---|---|
| [`build-guide.md`](build-guide.md) | Task-level build order (Phases 0–7) |
| [`data-provenance-and-ingestion_v2.md`](data-provenance-and-ingestion_v2.md) | Foundational own-vs-route model |
| [`project-structure_v3.md`](project-structure_v3.md) | Backend layout and SQL schema |
| [`entity-reference_v2.md`](entity-reference_v2.md) | Entity catalogue in prose |
| [`stack-decision_v2.md`](stack-decision_v2.md) | Technology choices and tradeoffs |
| [`search-design.md`](search-design.md) | Why faceted retrieval, not intent prediction |
| [`search-interface-contract.md`](search-interface-contract.md) | Swappable `UnifiedSearchService` contract |
| [`deployment-blueprint.md`](deployment-blueprint.md) | Production deploy / CI reasoning |
| [`aws-cloud-infrastructure-plan.md`](aws-cloud-infrastructure-plan.md) | Concrete AWS plan (not yet provisioned) |

## Historical / superseded

Unversioned or older drafts kept for history — prefer the `_v2` / `_v3` files above:

- `project-structure.md`, `project-structure_v2.md`
- `entity-reference.md`
- `stack-decision.md`
- `data-provenance-and-ingestion.md`
- `schema.prisma` (mirror; live schema is `backend/prisma/schema.prisma`)
