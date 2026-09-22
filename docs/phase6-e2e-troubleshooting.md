# Phase 6 e2e troubleshooting audit

Post-mortem of the e2e collapse after the Handlebars portal landed, and how it was fixed (commit `4463dc2`).

## Symptom

After Phase 6, `npm run test:e2e` collapsed: **27 failed / 37**. Almost every failure was the same:

```
issueToken → POST /auth/mock-idp/token → expected 201, got 403
```

Portal/search suites looked healthier; API/auth looked broken. That pattern pointed at **shared setup**, not domain logic.

## Root cause

Phase 6 CSRF was applied with `forRoutes('*')` and exempted via `req.path`. Under Nest/Express middleware mounting, `req.path` can be wrong for `/auth/mock-idp/...`, so the exempt check failed, CSRF threw `ForbiddenException`, and token issuance failed — cascading into nearly all API/auth tests.

## Fixes (commit `4463dc2`)

| Change | Verdict |
|--------|---------|
| Scope CSRF to web controllers (+ `/`) instead of `*` | Right place to fix |
| Exempt via `originalUrl` / `url`, not only `req.path` | Correct diagnosis |
| Broaden exempt prefix to `/auth` (and `/api`) | Safe for mock IdP |
| Shared `registerViewPartials` for Nest + e2e | Fixed nested `{{> search/...}}` naming |

Files touched:

- `backend/src/web/middleware/csrf.middleware.ts`
- `backend/src/web/web.module.ts`
- `backend/src/web/hbs-partials.ts` (new)
- `backend/src/main.ts`
- `backend/test/e2e-setup.ts`

Re-run after the fix: **37/37 green**.

## Two bugs in one commit

The commit message correctly names CSRF as the cascade breaker. The same change also fixed Handlebars nested partial registration (`search/results`, `resources/summary-*`, etc.). Treat them as **two independent Phase 6 issues**:

1. CSRF middleware incorrectly intercepting `/auth/mock-idp/token`
2. `hbs.registerPartials` by directory not registering nested names the templates use

## Gaps still open

1. **`Cannot set headers after they are sent` on `forbidden.hbs`**  
   Still logged on the CSRF-rejection portal test. `WebExceptionFilter` is global (`APP_FILTER`) and can render HTML after a response was already started. The filter already JSON-exits `/api` and `/auth/mock-idp`, but this noise remains. Follow-up: guard on `headersSent`, or don’t catch CSRF middleware failures with HTML render.

2. **Defense in depth is slightly redundant**  
   Controller scoping *and* path exempt *and* `/auth` prefix — fine for safety. A regression test that asserts `POST /auth/mock-idp/token` without CSRF still returns 201 would lock the lesson in.

## Related issues from the same session (not this failure)

| Issue | Resolution |
|-------|------------|
| `vite.config` pulled into Nest watch / TS2307 | Exclude from `tsconfig` (commit `cbedf58`) |
| Prisma `P1001` against local Postgres | Docker not running (ops, not a test bug) |
| Misread terminal as failing | Older 403 scrollback vs later green run (`last_exit_code: 0`) |

## Bottom line

Diagnosis was right; the CSRF fix was the real unblocker; partials registration was a necessary second fix. Remaining item is cleanup of the double-write / headers-sent noise on CSRF 403 HTML rendering — tests pass despite it.
