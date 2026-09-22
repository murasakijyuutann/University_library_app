# Audit coverage boundary (Phase 7.1)

`AuditInterceptor` is a Nest global interceptor that writes `audit_log_entry`
rows after successful HTTP handlers marked with `@Audited()`.

## What is captured

State transitions that flow:

```
controller (@Audited) → domain service → Prisma → response → interceptor write
```

Decorated today:

| Handler | entityType | action |
|---------|------------|--------|
| `POST /api/loans` | Loan | BORROW |
| `POST /api/loans/:id/return` | Loan | RETURN |
| `POST /api/loans/:id/renew` | Loan | RENEW |
| `POST /api/reservations` | Reservation | ENQUEUE |
| `POST /api/reservations/:id/cancel` | Reservation | CANCEL |
| `POST /api/thesis-submissions/:id/transition` | ThesisSubmission | TRANSITION |
| `POST /api/ill-requests/:id/transition` | IllRequest | TRANSITION |

## Known limitation (not a bug)

A state change made via a **direct Prisma write** that bypasses decorated
handlers is invisible to the interceptor. The same limit applies to portal HTML
POST handlers that call services without `@Audited`, and to background jobs
that mutate state without going through those routes.

Mitigation is discipline: controllers and schedulers invoke domain services,
and mutation HTTP endpoints that matter for the audit trail carry `@Audited`.
This is the Nest equivalent of the Spring AOP pointcut boundary described in
`project-structure_v3.md` §2.11.
