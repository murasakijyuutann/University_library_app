# Post-v1 deferred decisions (Phase 7.5)

Every item previously deferred during Phases 0–6 is either **done** in-tree or
logged here as a conscious post-v1 choice — none silently dropped.

| Item | Status | Notes |
|------|--------|-------|
| Public search throttling (5.4) | **Done** | `ThrottlerGuard` + `@Throttle` on `SearchController` (60/min). |
| Audit interceptor | **Done** | Phase 7.1; coverage limit in `docs/audit-coverage.md`. |
| Async notifications + delivery status | **Done** | Phase 7.2 `@OnEvent` → `notification_log` SENT/FAILED. |
| Notification retry / dead-letter | **Post-v1** | Upgrade path: BullMQ (or SQS) with RETRYING status; current design records FAILED visibly and stops. |
| Loan policy in data | **Done** | Phase 7.3 `loan_policy` seed + `LoanPolicyService` / renew / fines. |
| FineCalculationService | **Done** | Phase 7.3 under `loan/` (writes member-owned `Fine` rows). |
| Deployment migrate-before-deploy | **Documented + CI skeleton** | Phase 7.4 `Dockerfile`, `.github/workflows/backend-ci.yml`; live ECS not provisioned. |
| Secrets in task definitions | **Documented** | Secrets Manager ARN injection — see `deployment-blueprint.md` §5; no secrets in repo. |
| `journal.issn` uniqueness | **Post-v1** | Schema keeps separate print/electronic ISSN columns without a single unique — scholarly metadata reality. Revisit only if a concrete dedup product requirement appears. |
| Roles/permissions matrix detail | **Post-v1** | Controllers use coarse `@Roles` + handler-level actor checks (e.g. thesis submit). A full matrix (resource × action × role) can replace scattered checks later without changing JWT claims. |
| Embargo expiry scheduler → catalog projection | **Post-v1** | Event `thesis.embargo_lifted` exists for notifications; full `ThesisSubmission` → `Thesis` catalog projection remains later workflow work. |
| Reservation expiry / cascade-to-next | **Post-v1** | `markReadyForPickup` notifies; auto-expire + promote next in queue is operational polish. |
| Structured JSON logging (pino) | **Post-v1** | CloudWatch queryability noted in deployment blueprint; Nest default logger acceptable for v1. |
| Local storage PUT through Nest | **Accepted local-only** | Production uses S3 presign; `STORAGE_DRIVER=local` is explicitly a dev/e2e stand-in. |

## Closing rule

When adding a new "later" comment in code, link it here (or remove the comment when the work lands) so deferred decisions cannot rot into undocumented skew.
