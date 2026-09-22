# Documentation

Design and build artifacts for the University Library Portal.

**Root [`README.md`](../README.md):** deployment and full productization are postponed pending a serious rebuild.

Former root overview (goals, phases, quick start): [`project-overview.md`](project-overview.md).

## Read in this order (recommended)

1. **[`project-overview.md`](project-overview.md)** — goals, phase status, quick start (archived root README)
2. **[`data-provenance-and-ingestion_v2.md`](data-provenance-and-ingestion_v2.md)** — own vs route; what the system *is*
3. **[`stack-decision_v2.md`](stack-decision_v2.md)** — NestJS / Prisma / Postgres / Handlebars+HTMX and the inheritance tradeoff
4. **[`project-structure_v3.md`](project-structure_v3.md)** — modules, API surface, schema
5. **[`build-guide.md`](build-guide.md)** — phased implementation and exit criteria
6. **[`search-design.md`](search-design.md)** + **[`search-interface-contract.md`](search-interface-contract.md)** — before Phase 5
7. **[`deployment-blueprint.md`](deployment-blueprint.md)** + **[`aws-cloud-infrastructure-plan.md`](aws-cloud-infrastructure-plan.md)** — ops shape (design / proposed)
8. **[`audit-coverage.md`](audit-coverage.md)** + **[`post-v1-deferred.md`](post-v1-deferred.md)** — Phase 7 audit boundary and deferred log

## Full map

| Document | Role |
|---|---|
| [`project-overview.md`](project-overview.md) | Former root README — goals, status, quick start |
| [`build-guide.md`](build-guide.md) | Task-level build order (Phases 0–7) |
| [`data-provenance-and-ingestion_v2.md`](data-provenance-and-ingestion_v2.md) | Foundational own-vs-route model |
| [`project-structure_v3.md`](project-structure_v3.md) | Backend layout and SQL schema |
| [`entity-reference_v2.md`](entity-reference_v2.md) | Entity catalogue in prose |
| [`stack-decision_v2.md`](stack-decision_v2.md) | Technology choices and tradeoffs |
| [`search-design.md`](search-design.md) | Why faceted retrieval, not intent prediction |
| [`search-interface-contract.md`](search-interface-contract.md) | Swappable `UnifiedSearchService` contract |
| [`deployment-blueprint.md`](deployment-blueprint.md) | Production deploy / CI reasoning |
| [`aws-cloud-infrastructure-plan.md`](aws-cloud-infrastructure-plan.md) | Concrete AWS plan (not yet provisioned) |
| [`phase6-e2e-troubleshooting.md`](phase6-e2e-troubleshooting.md) | CSRF / Handlebars e2e collapse post-mortem |
| [`audit-coverage.md`](audit-coverage.md) | Phase 7.1 audit interceptor coverage boundary |
| [`post-v1-deferred.md`](post-v1-deferred.md) | Phase 7.5 closed / deferred decision log |

## Historical / superseded

Unversioned or older drafts kept for history — prefer the `_v2` / `_v3` files above:

- `project-structure.md`, `project-structure_v2.md`
- `entity-reference.md`
- `stack-decision.md`
- `data-provenance-and-ingestion.md`
- `schema.prisma` (mirror; live schema is `backend/prisma/schema.prisma`)
