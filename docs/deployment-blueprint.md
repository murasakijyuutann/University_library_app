# Deployment Blueprint & CI/CD Pipeline — University Library Portal

## Framing

This document describes the deployment architecture and CI/CD reasoning as a design exercise. Live, fully-running deployment may not be fully realized — but the constraints, ordering decisions, and tradeoffs documented below reflect the actual decisions that would govern a production rollout of this system. The goal is to demonstrate that the operational implications of the architecture were thought through, independent of whether every piece is currently running.

---

## 1. Compute: ECS Fargate

### What the workload looks like

The NestJS (Node.js) backend is a stateless, containerizable service (JWT-based auth means no server-side session state). It also runs scheduled background jobs in-process — `OverdueCheckScheduler`, `ReservationExpiryScheduler`, `EmbargoExpiryScheduler` — via `@nestjs/schedule` `@Cron`.

### Why Fargate over raw EC2

EC2 means owning the box: OS patching, manual security group management, instance failure recovery, sizing for peak load even though a project at this traffic scale rarely needs it. None of that operational burden teaches anything about *this domain* — it's generic sysadmin work layered on top of a software architecture project.

Fargate removes the server entirely: define a task (container + CPU/memory), AWS runs it. For a stateless NestJS service this is a clean match — no idle box running 24/7, and the operational complexity that remains (Dockerfile, task definition, service config) is transferable infrastructure-as-code knowledge, directly relevant to the project.

### The scheduled-job placement question

Running `@Cron` jobs inside a long-lived Fargate service works, but is arguably not the architecturally cleanest fit — a scheduled job doesn't need a server sitting idle between executions. The more correct pattern is **EventBridge Scheduler triggering a Lambda or a one-off ECS task** per job run. For this project's scope, in-app `@Cron` is the accepted simplification — documented here as a known tradeoff, not an oversight. (Node caveat: a single Node process runs schedulers on one event loop; if multiple Fargate tasks run, the schedulers must be guarded against double-firing — a distributed lock or single-scheduler task — the same double-run concern the blue/green section raises.)

---

## 2. Database: RDS for PostgreSQL

### What the workload needs

JOINED inheritance integrity, foreign key constraints (`Loan` references valid `Member` and `ResourceCopy`), and specifically pessimistic row locking (`SELECT ... FOR UPDATE`) for the concurrent last-copy-reservation problem.

### Why RDS over self-managed Postgres on EC2

Self-managing Postgres means owning backups, failover, patching, and connection pooling directly — generic DBA work that doesn't teach anything about library domain modeling, which is the actual point of this project. RDS provides automated backups, point-in-time recovery, and Multi-AZ failover as configuration rather than code, keeping engineering effort concentrated on `AccessPolicyResolver` and the state machines rather than WAL archiving correctness.

### Connection pooling under ephemeral compute

Fargate tasks scaling up or down each open new database connections; Postgres has a hard connection limit, and Prisma holds its own per-instance connection pool — so multiple tasks multiply connections quickly. **RDS Proxy** sits in front of RDS specifically to pool and reuse connections across ephemeral compute — directly relevant once the API runs as stateless, horizontally-scalable containers each with a Prisma pool.

### Cost/correctness tradeoff, stated explicitly

RDS is not free-tier-forever. The honest alternative — a single Postgres container running alongside the app in Fargate or Docker Compose for a demo — reintroduces the backup/failover ownership problem RDS exists to solve. This is a genuine, deliberate tradeoff between architectural correctness and cost, not a default.

---

## 3. Object Storage: S3

### What needs it

Thesis PDF uploads (`Thesis.filePath`) and potentially digitized research report files — binary blobs that should not live in the relational database. Storing large files as `bytea` columns is a known anti-pattern: it bloats backups and degrades query performance with no real benefit over a dedicated object store.

### The pre-signed upload pattern

The correct pattern: the backend generates a pre-signed S3 URL, the frontend uploads directly to S3 using that URL, and the backend stores only the resulting S3 key in `thesis.file_path`. The Node service never touches the file bytes — this avoids a 50MB multipart upload tying up the event loop for the duration of the transfer (doubly relevant on Node, where a blocked event loop stalls all concurrent requests, not just one thread).

### Embargo enforcement intersects with access control

An embargoed thesis file should not be downloadable even if a user guesses the S3 key. This requires a **private bucket with pre-signed download URLs generated only after `AccessPolicyResolver` confirms the embargo has lifted** — not public bucket ACLs. This is a deliberate design decision tied directly to the domain logic, not boilerplate storage configuration.

---

## 4. Networking

### VPC structure

RDS sits in a private subnet, reachable only from Fargate tasks within the same VPC — not publicly accessible. This is a non-negotiable boundary; exposing the database to the internet would be a real red flag in any infrastructure review, regardless of project scope.

### Outbound access for private-subnet compute

Fargate tasks in the private subnet still need outbound internet access — SMTP for notifications, calls to external APIs. A **NAT Gateway** in the public subnet, with a route from the private subnet through it, is the standard pattern. For S3 traffic specifically, a **VPC Gateway Endpoint for S3** avoids NAT entirely for that path (free, and architecturally cleaner) — relevant for the backend's metadata reads, separate from the frontend's direct pre-signed uploads which never route through the backend at all.

### API exposure

An Application Load Balancer in front of the Fargate service handles TLS termination and routing. The frontend calls the ALB's endpoint, never individual container instances directly.

---

## 5. Supporting Services

### Secrets and configuration — AWS Secrets Manager

Database credentials, the JWT signing/validation key, S3 access, and SMTP credentials should never live as plaintext environment variables in a Fargate task definition — that's secret material visible to anyone with read access to ECS configuration. Secrets Manager injects values at container start via ARN reference, never stored in the task definition or Docker image, and centralizes rotation.

This applies uniformly across environments: even the dev-only `MockIdentityProviderController`'s signing key should be sourced the same way a real IdP's public key would be in production, so the dev-to-prod transition doesn't require rewriting how secrets are consumed.

### DNS and TLS — Route 53, ACM

Route 53 for DNS; ACM for the TLS certificate attached to the ALB listener. The frontend is a static Vite/React SPA — built to static assets and served from S3 behind CloudFront (its own ACM certificate at the edge), not a running server. The backend API still needs its own subdomain (e.g. `api.<project-domain>`) with a real certificate, since the SPA makes HTTPS calls to it directly.

### Logging and monitoring — CloudWatch

Fargate ships container stdout/stderr to CloudWatch Logs by default; the Nest logger should be configured for structured JSON output (e.g. `nestjs-pino`) so logs remain queryable. CloudWatch Alarms should cover, at minimum: ECS task health/restart count, RDS CPU/connection count, and a custom alarm tied to scheduler job execution — the `audit_log_entry` table provides a natural place to log scheduler runs, which CloudWatch can alarm against if an expected job doesn't fire.

"How do you know if it's broken" is a fair question for any backend system — this layer exists specifically to have an answer.

### Email — Amazon SES

The natural fit for `EmailNotificationService`'s actual delivery mechanism — AWS-native, integrates with Secrets Manager, avoids running a mail server or introducing a third-party service when already inside AWS. Note: SES starts in sandbox mode (verified recipients only) until production access is requested — relevant if this is ever demoed live to reviewers.

---

## 6. Deployment Architecture Diagram

```
                    ┌──────────────────┐
                    │  Route 53 (DNS)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼──────────┐
                    │  Vite/React SPA   │
                    │  (S3 + CloudFront)│
                    └────────┬──────────┘
                             │ HTTPS
                    ┌────────▼─────────┐
                    │  ALB + ACM (TLS) │
                    └────────┬─────────┘
                             │
                    ┌────────▼──────────────┐      ┌──────────────────┐
                    │  ECS Fargate          │◄─────┤  ECR (images)    │
                    │  (NestJS / Node)      │      └──────────────────┘
                    └──┬────────┬───────┬───┘              ▲
                       │        │       │                  │ push on deploy
          ┌────────────▼──┐  ┌──▼────┐  │          ┌───────┴───────────┐
          │  RDS          │  │  S3   │  │          │  GitHub Actions   │
          │  (private,    │  │       │  │          │  (CI/CD)          │
          │  via NAT)     │  │       │  │          └───────────────────┘
          └───────────────┘  └───────┘  │
                       │                │
                  ┌────▼────┐    ┌──────▼───────┐
                  │ Secrets │    │  SES (email) │
                  │ Manager │    └──────────────┘
                  └─────────┘
                       │
                  ┌────▼──────────┐
                  │  CloudWatch   │
                  │  (logs/alarms)│
                  └───────────────┘
```

---

## 7. CI/CD Pipeline

### Core question the pipeline answers

What has to be true before code reaches production, and in what order does it need to be verified? A pipeline is an ordered sequence of gates — each gate earns its place only if it prevents a real class of failure specific to this system.

### Stage 1 — Triggered on pull request (before merge)

**Backend job**

```yaml
on:
  pull_request:
    branches: [main]
    paths: ['backend/**']

jobs:
  backend-verify:
    steps:
      - checkout
      - setup-node (20)
      - run: npm ci
      - run: npm run test           # unit tests (Jest)
      - run: npm run test:e2e       # integration tests, see below
```

Unit tests alone are insufficient here specifically. Domain logic lives in `AccessPolicyResolver` and the state-machine services (`ThesisSubmissionService`, `ReservationQueueService`) — providers where a test with a mocked Prisma client can pass while the real query is subtly wrong. The hand-modeled hierarchy (base + subtype rows joined by id, written in a `prisma.$transaction`) is a known source of "works with mocks, breaks against real Postgres" failures — a mocked client never exercises the actual join or the transaction's atomicity.

This is where **Testcontainers for Node** (`@testcontainers/postgresql`) earns its place: spin up a real Postgres container during the pipeline run, apply Prisma migrations against it (`prisma migrate deploy`), and run integration tests that exercise the actual `resource` → `journal_article` → `journal_license` join chain and the base+subtype creation transaction. A mocked Prisma client cannot catch a broken hand-modeled-hierarchy write — only a test against real Postgres can.

```typescript
// integration test — real Postgres via Testcontainers for Node
let container: StartedPostgreSqlContainer;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start();
  // point Prisma at the container, run `prisma migrate deploy`
  // tests then run against real schema, real joins, real constraints
});

afterAll(async () => { await container.stop(); });
```

**Frontend job**

```yaml
  frontend-verify:
    steps:
      - checkout
      - setup-node (20)
      - run: npm ci
      - run: npm run typecheck   # tsc --noEmit
      - run: npm run lint
      - run: npm test
```

The typecheck step carries extra weight here: `ResourceSummaryDto` is a type-agnostic shape across five resource subtypes. A frontend type error in that shape could mean a journal article rendering as if it were a physical book, silently. TypeScript strictness is doing real domain-correctness work in this case, not just style enforcement.

**Merge gate**: both jobs must pass. No "fix it after merge" exception — the gate's value depends on it being non-optional.

### Stage 2 — Triggered on merge to main

**The ordering problem.** Deploying new app code and running a new Prisma migration cannot happen simultaneously without risking a window where old code runs against new schema, or new code against old schema. The pipeline encodes ordering explicitly:

```
1. Build & push image to ECR (tagged with commit SHA, not "latest")
2. Run `prisma migrate deploy` against RDS
3. ONLY IF migration succeeds → update ECS service to new image
4. Health check the new deployment
5. ONLY IF healthy → mark deployment complete
   IF unhealthy → automatic rollback to previous task definition
```

**Why tag by commit SHA, not `latest`.** If step 5 fails and rollback is needed, "redeploy the previous version" must reference something concrete. `latest` is a moving target — by definition, latest *is* the broken thing at that point. The previous ECS task definition revision should reference the previous commit SHA's image explicitly.

**Why migration-before-deploy, not the reverse.** Deploying new app code first — code expecting a column the migration hasn't added yet — produces immediate runtime failures the moment a request hits that code path (e.g. `EmbargoExpiryScheduler` querying a column that doesn't exist). Migration-first guarantees the schema is always a superset of what any currently-running app version needs. This follows the standard "expand, don't contract" migration philosophy: new columns are added before old code stops needing the old shape, never the reverse.

**The health check gate, made concrete.** A `/health` endpoint (via `@nestjs/terminus`) should check more than process liveness:

```yaml
// health.controller.ts (Terminus)
//   @Get('/health')
//   check() {
//     return this.health.check([
//       () => this.db.pingCheck('database'),   // verifies real RDS connectivity,
//     ]);                                        // not just process liveness
//   }
```

ECS's ALB target group health check hits this endpoint before routing real traffic to a new task. If DB connectivity fails, ECS does not cut traffic over, and the old task continues serving requests — making rollback automatic rather than something manually triggered after the fact.

### Stage 3 — Deployment strategy

**Why this needs to be a deliberate choice.** "Update ECS service to new image" means different things depending on strategy, with real consequences for a system handling active loans and reservations.

**Rolling deployment** (ECS default) — old tasks terminate as new tasks come up, gradually. During the transition window, some requests hit old code and some hit new code simultaneously. Acceptable for stateless reads; riskier if a state machine transition's validation logic changes mid-rollout.

**Blue/green** (via CodeDeploy, integrates with ECS) — the new version is fully up and health-checked before any traffic shifts, then cutover happens cleanly (all at once or gradually, with automated rollback on error-rate spikes).

**Why blue/green is the more defensible choice here specifically**: the in-process scheduler problem. If `OverdueCheckScheduler` runs inside the app and a rolling deployment briefly has two task versions alive simultaneously, the same overdue check could run twice (double fine application), or a state transition could fire from two different code versions ambiguously. Blue/green's clean cutover avoids this. Rolling deployment is documented here as the accepted v1 simplification — naming the tradeoff explicitly is the point, even without implementing blue/green immediately.

### What's deliberately absent from a naive pipeline, and why

**Database migration rollback is not really a solvable problem, and that's stated explicitly rather than glossed over.** Prisma Migrate does not auto-generate down-migrations. Rolling back the application does not undo a schema change. This means migration files under `prisma/migrations/` require more PR-stage scrutiny than ordinary application code — a bad migration is a more expensive mistake than bad app code, because app code rolls back cleanly and schema changes generally do not.

**Secrets never touch pipeline logs.** GitHub Actions should use OIDC federation with AWS — the pipeline assumes an IAM role scoped to exactly what it needs (push to this ECR repo, update this ECS service, read these specific Secrets Manager ARNs), rather than long-lived AWS access keys stored as GitHub secrets. Long-lived keys in CI are a known attack surface; short-lived OIDC-based credentials are current best practice.

### Full pipeline flow

```
PR opened
  │
  ├─► backend-verify (Jest unit + Testcontainers-for-Node integration tests)
  └─► frontend-verify (typecheck + lint + test)
        │
        ▼ (both pass)
  Merge allowed
        │
        ▼ merge to main
  Build images, tag: SHA
        │
        ▼
  Push to ECR
        │
        ▼
  Run `prisma migrate deploy` on RDS ──► FAIL ──► pipeline stops, alert fires
        │
        ▼ success
  Deploy new ECS task def (blue/green via CodeDeploy)
        │
        ▼
  New tasks pass /health (incl. DB check)
        │
        ├─► PASS ──► traffic cutover, old tasks drain
        └─► FAIL ──► automatic rollback, old version stays live, alert fires
```

---

## 8. Honest Prioritization If Scoping Down

Not everything in this document needs to be live simultaneously for a credible deployment story.

**Non-negotiable to articulate or implement**: Secrets Manager (hardcoded credentials are a real security failure, not a style preference), basic CloudWatch logging, CI/CD via GitHub Actions (manual deploys demonstrate nothing).

**Important but defensible to simplify**: full NAT Gateway setup (Fargate could initially sit in a public subnet with tightly restricted security groups, as a documented tradeoff if cost is a constraint), SES production access (sandbox mode is acceptable for a demo).

**Genuinely deferrable**: Multi-AZ RDS failover, fine-grained CloudWatch alarm tuning — these are production-hardening concerns, not "does the architecture make sense" concerns.

---

## 9. What This Document Demonstrates

Independent of whether this is ever fully, live-deployed: the migration-ordering logic, the blue/green-vs-rolling tradeoff tied specifically to the in-process scheduler risk, and the explicit acknowledgment of where Prisma Migrate's rollback limitations live — these are the kind of details that distinguish "followed a deployment tutorial" from "understood why each gate exists and what it prevents."
