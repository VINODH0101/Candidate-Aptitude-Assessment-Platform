# Phase 13 — Deployment Audit

> Prepared before any modifications. This documents the state of the repository
> at the start of Phase 13 (deployment readiness), the assumptions found, and
> the proposed changes. No destructive changes are made by this document.

---

## 1. Existing architecture

A single-tenant **Aptitude Assessment Platform** implemented as an npm-workspaces
monorepo with two applications:

- `server/` — Node.js + Express + TypeScript + Prisma (PostgreSQL). REST API under
  `/api/*`, stateless except for the JWT cookies it issues.
- `web/` — React 18 + TypeScript + Vite + Tailwind + shadcn-style UI + TanStack
  Query + Recharts. SPA with client-side routing.

### Runtime topology (as built)

```
Browser (React SPA)
   │  (dev) Vite dev server, /api proxied to :5000
   │  (prod) same-origin Express serving built SPA + /api
   ▼
Express API (server) ── Prisma ──▶ PostgreSQL 16
```

- The backend already serves the built React SPA (`server/src/app.ts` →
  `resolveWebDistDir()`) with an SPA fallback, so a **single-service** production
  deploy is already supported in code.
- The existing Docker packaging (being removed) ran three services: `db`,
  `server`, and `web` (nginx). The `server` image already ran the whole app
  single-service (API + static SPA); the `web` image was a separate nginx host
  that reverse-proxied `/api` to `server`.

### Layering (backend)

```
route → Zod validation → controller (HTTP only) → service (business rules, transactions) → Prisma → PostgreSQL
```

Modules: `candidates` (auth + profile), `admin-auth`, `admin` (overview),
`questions`, `settings`, `assessment` (candidate attempt engine + grading),
`attempts`, `results`, `analytics`. Cross-cutting: `config/env`, `lib/*`,
`middleware/*`.

### Database model (actual, post-migrations)

Models: `Admin`, `Candidate`, `Question`, `TestAttempt`, `CandidateAnswer`,
`AppSetting`. Enums: `Gender`, `Category`, `Difficulty`, `AttemptStatus`,
`AttemptResult`, `Qualification`.

- Exactly one attempt per candidate (`TestAttempt.candidateId` unique).
- Max 10 active questions, enforced by a DB trigger + advisory lock
  (`enforce_max_active_questions`).
- Attempts snapshot question text/options/correct-index at start
  (`TestAttempt.questionSnapshots`), so later question edits cannot change
  historical results.
- Scoring: `+2` correct, `-1` incorrect, `0` unanswered; `netScore`,
  `percentage`, `result` (PASS/FAIL) persisted at finalize.

---

## 2. Existing local startup process

Before Phase 13, local development was documented/expected to use Docker:

```bash
cp .env.example .env
docker compose up --build
```

No root-level `npm run dev` existed. The repo could be run manually as:

- Backend: `cd server && npm run dev` (tsx watch), port `5000`.
- Frontend: `cd web && npm run dev` (Vite), port `3000`, `/api` proxied to `:5000`.

---

## 3. Existing database configuration

- Prisma datasource uses only `url = env("DATABASE_URL")`. No `directUrl`.
- Migrations: 4 versioned migrations under `server/prisma/migrations/`.
- Seed: `server/prisma/seed.ts`, idempotent (skips admin/questions/candidate if
  already present), configured via `server/package.json` `"prisma.seed"`.
- Environment is loaded by the app at runtime via `dotenv` from root `.env`
  (`server/src/config/env.ts` reads both `./.env` and `../.env`).
- The Prisma **CLI** does not automatically load the root `.env` when invoked
  from `server/`, which was fine under Docker (env injected via compose) but
  breaks a plain `npm`-based workflow unless handled explicitly.

---

## 4. Existing Docker dependencies

| Artifact | Purpose | Disposition |
|---|---|---|
| `docker-compose.yml` | 3-service local stack (db/server/web) | remove |
| `server/Dockerfile` | single-service prod image (API + SPA) | remove |
| `web/Dockerfile` | nginx SPA image | remove |
| `web/nginx.conf` | nginx `/api` reverse proxy + SPA fallback | remove |
| `.dockerignore` | build-context exclusions | remove |
| `docker-build.log` | stale build log | remove |
| `.env.example` comments | "copy … before docker compose" | rewrite |

---

## 5. Existing build process

- Root `npm run build` = `server` tsc build + `web` vite build.
- Root `typecheck`, `lint`, `test` (server only) scripts exist.
- Server build output: `server/dist`. Web build output: `web/dist`.
- The Express app already resolves `web/dist` for same-origin static serving and
  SPA fallback (no code change required for production single-service hosting).

---

## 6. Existing deployment blockers (to fix)

1. **Docker-only startup** — no `npm run dev` / `db:*` scripts for plain Node.
2. **No Neon support** — Prisma schema lacks `directUrl`; no pooled/direct split.
3. **CORS/CSRF origin hard-coded** to `http://localhost:3000` in `env.ts`
   default and `.env.example`; frontend dev port must be `5173` per requirement.
4. **Frontend dev port** currently `3000` (non-default) in `vite.config.ts`.
5. **Prisma CLI env** not loadable from root `.env` when run as workspace script.
6. **No Render configuration** (`render.yaml`), no documented build/start commands.
7. **No production start script** (`npm start`) at the root.
8. **Stale `docs/ARCHITECTURE.md`** — describes a draft target model (User/Session/
   Assessment/QuestionOption) that differs from the actual schema, and references
   Docker/nginx.

---

## 7. Proposed changes

1. Remove all Docker artifacts (compose, both Dockerfiles, nginx.conf, `.dockerignore`,
   logs) and scrub Docker references from code comments and docs.
2. Add `directUrl = env("DIRECT_URL")` to the Prisma datasource for Neon pooled/direct.
3. Rewrite `.env.example` (accurate variable set, no Docker), update `env.ts`
   default `CORS_ORIGIN` to `http://localhost:5173`.
4. Rewrite root `package.json` scripts: `dev` (concurrently), `dev:backend`,
   `dev:frontend`, `db:generate`, `db:migrate`, `db:deploy`, `db:seed`,
   `db:studio`, `start`, `start:prod`, `build`, `typecheck`, `lint`, `test`.
5. Change `web/vite.config.ts` dev port to `5173`.
6. Add `render.yaml` (single web service, health check `/api/health`).
7. Rewrite `README.md` (Docker-free local setup, Render + Neon deploy, full docs).
8. Rewrite `docs/ARCHITECTURE.md` to match the actual implementation.
9. Write `docs/PHASE_13_DEPLOYMENT_REPORT.md`.

> **Out of scope:** UI redesign, business-logic changes, schema/DB reset,
> deletion of migrations. All existing candidate/assessment/scoring/auth/admin
> functionality is preserved.
