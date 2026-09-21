# Backend — University Library Portal

NestJS + Prisma + PostgreSQL API for the university library portal.

Project overview, goals, phase status, and documentation map: **[../README.md](../README.md)**.

## Setup

```bash
cp .env.example .env
npm install
npm run db:up
npx prisma migrate deploy
npm run start:dev
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api/docs`
- Health: `GET /health`

## Scripts

| Command | Purpose |
|---|---|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile |
| `npm test` | Unit tests |
| `npm run test:integration` | Testcontainers integration tests |
| `npm run test:e2e` | API + auth e2e (Testcontainers) |
| `npm run boundaries:check` | dependency-cruiser module boundaries |
| `npm run db:up` / `db:down` | Local Postgres via Docker Compose |

Auth in development uses `POST /auth/mock-idp/token` (see root README). Configure JWT via `.env` (`JWT_PUBLIC_KEY_SOURCE`, `MOCK_IDP_SIGNING_SECRET`, `JWKS_URI`).
