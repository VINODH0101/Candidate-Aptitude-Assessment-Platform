# Phase 13 — Deployment Report

Final report for the production-readiness phase. This documents what was found,
changed, and verified, and what still requires manual dashboard configuration.

---

## 1. Initial architecture findings

See [`docs/PHASE_13_DEPLOYMENT_AUDIT.md`](PHASE_13_DEPLOYMENT_AUDIT.md) for the
full audit. Summary:

- npm-workspaces monorepo: `server` (Express + Prisma) and `web` (React + Vite).
- The Express app already served the built SPA and had SPA fallback — so a
  single-service production deploy was already supported in code.
- Local startup was Docker-only (`docker compose up --build`); no `npm run dev`.
- Prisma schema used only `url` (no `directUrl` for Neon).
- `CORS_ORIGIN` defaulted to `http://localhost:3000`; Vite dev port was 3000.
- No Render configuration; no root `start`/`db:*` scripts; stale
  `docs/ARCHITECTURE.md` describing a different (draft) model.

## 2. Changes implemented

1. **Docker removed** — all Docker artifacts deleted; references scrubbed from
   code comments and docs.
2. **Neon support** — `directUrl` added to the Prisma datasource.
3. **Local dev scripts** — root `dev` (concurrently), `dev:backend`,
   `dev:frontend`, `db:generate`, `db:migrate`, `db:deploy`, `db:seed`,
   `db:studio`, `start`, `start:prod`.
4. **Ports/env** — Vite dev port → 5173; `CORS_ORIGIN` default → 5173;
   `.env.example` rewritten (accurate variable set, Docker-free).
5. **Render** — `render.yaml` Blueprint added.
6. **Docs** — `README.md` and `docs/ARCHITECTURE.md` rewritten; this report and
   the audit document added.
7. **License** — MIT license added.

## 3. Files created

- `docs/PHASE_13_DEPLOYMENT_AUDIT.md`
- `docs/PHASE_13_DEPLOYMENT_REPORT.md` (this file)
- `render.yaml`
- `README.md` (rewritten)
- `LICENSE`

## 4. Files modified

- `package.json` — root scripts, `prisma.seed`, `concurrently` devDependency.
- `package-lock.json` — `concurrently` added.
- `server/prisma/schema.prisma` — `directUrl = env("DIRECT_URL")`.
- `server/src/config/env.ts` — `CORS_ORIGIN` default → `http://localhost:5173`.
- `web/vite.config.ts` — dev server port → 5173.
- `.env.example` — rewritten (Docker-free, `DIRECT_URL`, accurate variables).
- `docs/ARCHITECTURE.md` — rewritten to match the implemented system.

## 5. Files deleted

- `docker-compose.yml`
- `server/Dockerfile`
- `web/Dockerfile`
- `web/nginx.conf`
- `.dockerignore`
- `docker-build.log`
- `server/test-engine.log`, `server/test-q.log`, `server/test-results.log`
  (stale logs)

## 6. Final project structure

```
candidate-platform/
├─ package.json / package-lock.json
├─ .env.example
├─ .gitignore
├─ LICENSE
├─ README.md
├─ render.yaml
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ PHASE_13_DEPLOYMENT_AUDIT.md
│  └─ PHASE_13_DEPLOYMENT_REPORT.md
├─ server/
│  ├─ prisma/{schema.prisma, migrations/, seed.ts}
│  ├─ src/{app.ts, index.ts, config/, lib/, middleware/, modules/}
│  └─ tests/
└─ web/
   └─ src/{lib/, components/, features/, ...}
```

## 7. Local startup commands

```bash
npm install          # install dependencies
npm run db:generate  # generate Prisma Client
npm run db:migrate   # apply migrations (dev)
npm run db:seed      # idempotent seed
npm run dev          # start backend (:5000) + frontend (:5173)
```

## 8. Local database setup

1. Install PostgreSQL 16 (Windows installer).
2. Create the database:

   ```bash
   psql -U postgres -c "CREATE DATABASE aptitude_assessment;"
   ```

3. Set `DATABASE_URL` and `DIRECT_URL` in `.env` to
   `postgresql://postgres:YOUR_PASSWORD@localhost:5432/aptitude_assessment?schema=public`.
4. Run `npm run db:generate && npm run db:migrate && npm run db:seed`.

## 9. Production build command

```bash
npm install && npm run db:generate && npm run build
```

## 10. Render start command

```bash
npm run start:prod   # = prisma migrate deploy && npm run start
```

## 11. Neon setup instructions

1. Create a Neon project + database.
2. Copy the **pooled** connection string → `DATABASE_URL`.
3. Copy the **direct** connection string → `DIRECT_URL`.
4. `DATABASE_URL` is used by Prisma Client (pooled); `DIRECT_URL` is used by
   `prisma migrate deploy` and `prisma db seed` (direct). This matches the
   Prisma `url`/`directUrl` split configured in `schema.prisma`.

## 12. Render setup instructions

See `render.yaml` and `README.md` §20. In short: New → Blueprint (or Web Service)
→ connect repo → set Build Command `npm install && npm run db:generate && npm run build`,
Start Command `npm run start:prod`, Health Check Path `/api/health`, and the
environment variables (Neon URLs, `JWT_ACCESS_SECRET`, `CORS_ORIGIN`, seed admin).

## 13. Environment variable reference

Documented in `README.md` §10 and `.env.example`. Required: `DATABASE_URL`,
`DIRECT_URL`, `JWT_ACCESS_SECRET`. Seed: `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`ADMIN_NAME` (+ optional `SEED_CANDIDATE_*`). Optional with defaults: `PORT`,
`HOST`, `NODE_ENV`, `ADMIN_SESSION_HOURS`, `CANDIDATE_SESSION_HOURS`,
`BCRYPT_ROUNDS`, `CORS_ORIGIN`, `COOKIE_SECURE`, `ASSESSMENT_DURATION_MINUTES`,
`PASS_PERCENTAGE`, `VITE_API_BASE`, `TEST_DATABASE_NAME`.

## 14. Migration and seed process

- Migrations: `npm run db:migrate` (dev) / `npm run db:deploy` (prod CI). Never
  `prisma migrate reset` or `prisma db push` in production.
- Seed: `npm run db:seed` — idempotent (never overwrites admin, settings, or the
  question bank; never deletes candidates).

## 15. Security changes

No business logic changed. Security posture confirmed via audit + tests: bcrypt,
JWT HttpOnly cookies (Secure in prod), CSRF origin allowlist, CORS allowlist,
Zod validation, DTO whitelisting (no answer keys pre-submission), rate limiting,
Helmet, DB-level integrity triggers. `CORS_ORIGIN` now defaults to the 5173 dev
origin; production must set it to the deployed HTTPS origin.

## 16. Tests executed and actual results

All run locally against a real PostgreSQL instance (Node v24.22.1, npm 12.2.1,
Prisma 6.19.3):

| Check | Command | Result |
|---|---|---|
| Prisma generate | `npm run db:generate` | ✅ generated |
| Migrations | `npm run db:deploy` | ✅ 4 migrations applied |
| Seed | `npm run db:seed` (×2) | ✅ seeded, then idempotent (all "left unchanged") |
| Unit/integration tests | `npm test` | ✅ **89/89 passed** (11 files) |
| TypeScript typecheck | `npm run typecheck` | ✅ clean |
| ESLint | `npm run lint` | ✅ clean |
| Production build | `npm run build` | ✅ server + web compiled |
| Production start (SPA + API) | `node dist/index.js` | ✅ `/api/health` 200 (db up), `/` and `/admin` serve index.html |
| Dev start | `npm run dev` | ✅ concurrently launches api (`:5000`) + web (Vite) |

## 17. Remaining manual deployment steps

These require dashboard access and real credentials, and were **not** performed:

1. Create the Neon project/database and copy the pooled + direct URLs.
2. Create the Render Web Service (or Blueprint) and connect the GitHub repo.
3. Enter secrets (`DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`,
   `CORS_ORIGIN`, `ADMIN_PASSWORD`).
4. Run `npm run db:seed` once via the Render Shell to create the initial admin.
5. Verify the live site and both candidate/admin flows.

## 18. Known limitations

- No live Render/Neon deployment was tested (no credentials available).
- The `package.json#prisma` seed config emits a Prisma 6 deprecation warning
  (non-blocking; will need a `prisma.config.ts` when migrating to Prisma 7).
- Screenshots are described but not captured in this environment (see README §22).
- `npm run db:studio` (Prisma Studio) was not launched interactively during
  verification, but uses the standard Prisma CLI.
