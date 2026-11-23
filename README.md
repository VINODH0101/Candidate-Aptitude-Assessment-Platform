# Aptitude Assessment Platform

A single-tenant aptitude assessment platform where candidates register, take a
**timed, auto-graded** 10-question aptitude test, and administrators manage the
question bank, assessment settings, and results — all served from one Node.js
application.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Features](#2-features)
3. [Technology stack](#3-technology-stack)
4. [Architecture](#4-architecture)
5. [Folder structure](#5-folder-structure)
6. [Database schema](#6-database-schema)
7. [Prerequisites](#7-prerequisites)
8. [Local Windows setup](#8-local-windows-setup)
9. [Local application URLs](#9-local-application-urls)
10. [Environment variables](#10-environment-variables)
11. [Admin access](#11-admin-access)
12. [Database management](#12-database-management)
13. [Candidate workflow](#13-candidate-workflow)
14. [Admin workflow](#14-admin-workflow)
15. [Scoring calculation](#15-scoring-calculation)
16. [API documentation](#16-api-documentation)
17. [Business assumptions](#17-business-assumptions)
18. [Security decisions](#18-security-decisions)
19. [Testing](#19-testing)
20. [Production deployment (Render + Neon)](#20-production-deployment-render--neon)
21. [Demo walkthrough checklist](#21-demo-walkthrough-checklist)
22. [Screenshots](#22-screenshots)
23. [Troubleshooting](#23-troubleshooting)
24. [AI development documentation](#24-ai-development-documentation)

---

## 1. Project overview

The platform automates an aptitude assessment workflow:

1. A **candidate** registers, signs in, reads the instructions, starts a
   **timed** assessment, answers 10 multiple-choice questions (marking some for
   review), and submits.
2. The server grades the attempt **server-side** from an immutable snapshot of
   the questions, persists the result, and shows the candidate a summary and a
   per-question review (correct answers revealed only after submission).
3. An **administrator** monitors the dashboard, manages the question bank
   (at most 10 active questions), adjusts the assessment duration and pass
   percentage, and browses/exports results.

### Core guarantees

- **One attempt per candidate** — enforced by a unique database constraint.
- **Exactly 10 active questions** — enforced by a DB trigger + advisory lock.
- **Snapshot grading** — question text/options/answers are frozen at attempt
  start, so later edits cannot change historical results.
- **Server-authoritative timer** — expiry is evaluated on the server; refreshing
  or reopening the page resumes the same attempt.
- **Idempotent seed & submit** — safe to re-run; never overwrites live data.

## 2. Features

**Candidate**

- Self-registration with validation (name, email, age 18–60, 10-digit phone,
  qualification).
- Timed assessment (default 15 minutes) with a live countdown that survives
  refresh.
- Question palette/navigation, auto-save, "mark for review".
- Auto-finalize on timeout; idempotent manual submit.
- Result summary (score, percentage, pass/fail) and detailed review with correct
  answers after submission.

**Administrator**

- Secure admin login (separate session from candidates).
- Dashboard analytics: registrations, completed/expired attempts, average score
  and percentage, highest score, pass rate, pass/fail split, score distribution.
- Question bank CRUD: create/edit/activate/deactivate/delete; enforces the
  "max 10 active" rule and blocks deletion of questions referenced by attempts.
- Assessment settings: duration and pass percentage (new attempts use new
  settings; historical attempts are unaffected).
- Results: paginated list with search, pass/fail filter, sort; detail view with
  the candidate's answers and the correct keys.
- CSV export of results (with formula-injection protection).

## 3. Technology stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 4, TypeScript 5, Prisma 6 (PostgreSQL) |
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS, shadcn-style UI |
| State/data | TanStack Query, react-hook-form, Zod |
| Charts | Recharts |
| Database | PostgreSQL 16 (local), Neon (managed, production) |
| Auth | JWT in HttpOnly cookies, bcryptjs, Helmet, express-rate-limit |
| Tests | Vitest + Supertest (89 integration tests) |

## 4. Architecture

### Local development

```
Browser ── http://localhost:5173 ──▶ Vite dev server (web)
                                          │ /api/* (proxy)
                                          ▼
                                   Express API (server) :5000
                                          │
                                          ▼
                                   PostgreSQL (localhost:5432)
```

### Production (Render, single service)

```
Browser ── https://<app>.onrender.com ──▶ Express (server)
                                            ├── /api/*      → REST API
                                            ├── /           → built React SPA
                                            └── /<route>    → SPA fallback (index.html)
                                                     │
                                                     ▼
                                            Neon PostgreSQL
```

The Express server serves the compiled React bundle and the API from a **single
origin**, which keeps authentication cookies simple (no cross-origin complexity).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full module breakdown,
ER diagram, attempt lifecycle, and API reference.

## 5. Folder structure

```
candidate-platform/
├─ package.json                 # npm workspaces: server, web + scripts
├─ .env.example                 # environment template (copy to .env)
├─ render.yaml                  # Render Blueprint (single web service)
├─ docs/                        # architecture + deployment docs
├─ server/
│  ├─ prisma/                   # schema, migrations, seed
│  ├─ src/                      # Express app, config, lib, middleware, modules
│  └─ tests/                    # Vitest + Supertest suite
└─ web/
   └─ src/                      # React app (lib, components, features)
```

## 6. Database schema

Six models: `Admin`, `Candidate`, `Question`, `TestAttempt`, `CandidateAnswer`,
`AppSetting` (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the ER
diagram and constraints).

Highlights:

- `TestAttempt.candidateId` is **unique** → one attempt per candidate.
- `TestAttempt.questionSnapshots` stores an immutable JSON snapshot of the 10
  questions at start.
- `Question` has exactly 4 options; a DB trigger caps active questions at 10.
- `AppSetting` is a singleton (`id = 1`) holding duration + pass percentage.

## 7. Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20+ (22 LTS recommended; tested on 24) |
| npm | 9+ (bundled with Node; tested on 12) |
| PostgreSQL | 16 (local development) |
| Git | any recent version |

## 8. Local Windows setup

> No Docker required. The app runs directly with Node.js + a local PostgreSQL.

### 8.1 Install PostgreSQL (once)

1. Download the installer from <https://www.postgresql.org/download/windows/> and
   install PostgreSQL 16.
2. Note the superuser password you set for the `postgres` user.
3. Ensure the service is running (it auto-starts after install; verify in
   Windows *Services* → `postgresql-x64-16`).

### 8.2 Clone and install

```bat
:: CMD
git clone https://github.com/<your-account>/candidate-platform.git
cd candidate-platform
npm install
```

```powershell
# PowerShell
git clone https://github.com/<your-account>/candidate-platform.git
Set-Location candidate-platform
npm install
```

### 8.3 Create the database

```bat
:: CMD (run from a terminal; replace YOUR_PASSWORD)
"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -c "CREATE DATABASE aptitude_assessment;"
```

```powershell
# PowerShell
& "C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -c "CREATE DATABASE aptitude_assessment;"
```

(You will be prompted for the `postgres` password.)

### 8.4 Configure environment

```bat
:: CMD
copy .env.example .env
```

```powershell
# PowerShell
Copy-Item .env.example .env
```

Edit `.env` and set at least:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/aptitude_assessment?schema=public
DIRECT_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/aptitude_assessment?schema=public
JWT_ACCESS_SECRET=<a-strong-random-string-32-chars-or-more>
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<a-strong-password>
```

Generate a secret with:

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 8.5 Generate Prisma Client, migrate, seed

```bat
:: CMD
npm run db:generate
npm run db:migrate
npm run db:seed
```

```powershell
# PowerShell
npm run db:generate
npm run db:migrate
npm run db:seed
```

- `db:generate` — generate the Prisma Client.
- `db:migrate` — create/apply migrations in dev (use `db:deploy` in CI/prod).
- `db:seed` — idempotently insert the admin, 10 questions, settings, and an
  optional demo candidate.

### 8.6 Start the application

```bat
:: CMD
npm run dev
```

```powershell
# PowerShell
npm run dev
```

This starts the backend (`:5000`) and frontend (`:5173`) concurrently.

To run them separately:

```bash
npm run dev:backend     # Express API on http://localhost:5000
npm run dev:frontend    # Vite dev server on http://localhost:5173
```

### 8.7 Verify

Open <http://localhost:5173> in a browser and check the health endpoint:

```bash
curl http://localhost:5000/api/health
```

Expected: `{"success":true,"data":{"status":"ok","database":"up",...}}`.

## 9. Local application URLs

| Service | URL |
|---|---|
| Frontend (candidate/admin UI) | <http://localhost:5173> |
| Backend API | <http://localhost:5000> |
| Health check | <http://localhost:5000/api/health> |
| Prisma Studio | `npm run db:studio` → <http://localhost:5555> |

## 10. Environment variables

All variables live in the root `.env` (git-ignored). `.env.example` documents
them all.

| Variable | Purpose | Local | Production |
|---|---|---|---|
| `NODE_ENV` | Runtime mode | `development` | `production` |
| `PORT` | Backend port | `5000` | Render-assigned (do not set) |
| `HOST` | Bind address | `0.0.0.0` | `0.0.0.0` |
| `DATABASE_URL` | DB connection (Prisma Client) | local PostgreSQL | Neon **pooled** URL |
| `DIRECT_URL` | Direct DB connection (migrations/seed) | same as `DATABASE_URL` | Neon **direct** URL |
| `JWT_ACCESS_SECRET` | JWT signing secret (≥32 chars) | local secret | strong production secret |
| `ADMIN_SESSION_HOURS` | Admin token TTL | `8` | `8` |
| `CANDIDATE_SESSION_HOURS` | Candidate token TTL | `12` | `12` |
| `BCRYPT_ROUNDS` | Password hashing cost | `10`–`12` | `12` |
| `CORS_ORIGIN` | Extra cross-origin hosts (CSV); same-origin + dev loopback are auto-allowed | `http://localhost:5173` | optional (only if cross-origin) |
| `COOKIE_SECURE` | Cookies over HTTPS only | `false` | `true` (or omit → auto) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Seed admin | demo values | controlled |
| `SEED_CANDIDATE_*` | Optional demo candidate | demo values | optional |
| `ASSESSMENT_DURATION_MINUTES` | Seed default duration | `15` | `15` |
| `PASS_PERCENTAGE` | Seed default pass % | `60` | `60` |
| `VITE_API_BASE` | SPA API base (build-time) | empty | empty (same-origin) |
| `TEST_DATABASE_NAME` | Throwaway test DB name | `aptitude_test` | n/a |

Security rules: never commit `.env`; never put secrets in `VITE_*` variables;
never log secrets.

## 11. Admin access

The initial administrator is created by `npm run db:seed` from `ADMIN_EMAIL` /
`ADMIN_PASSWORD` / `ADMIN_NAME`. The seed is **idempotent** — it never overwrites
an existing admin, so you can rotate the password later via the database.

**For any non-local deployment:**

- Set a strong, unique `ADMIN_PASSWORD`.
- Do not publish real credentials.
- Seed once, then remove/rotate the seed credentials if desired.

Demo defaults in `.env.example`: `admin@example.com` / `ChangeMe123!` (local
only). Demo candidate: `candidate@example.com` / `Candidate123!`.

## 12. Database management

| Command | Purpose |
|---|---|
| `npm run db:generate` | Generate Prisma Client |
| `npm run db:migrate` | Apply migrations in development (`prisma migrate dev`) |
| `npm run db:deploy` | Apply pending migrations non-interactively (CI/prod) |
| `npm run db:seed` | Idempotent seed (admin, questions, settings, demo candidate) |
| `npm run db:studio` | Open Prisma Studio GUI |

Migrations are version-controlled under `server/prisma/migrations/`. **Never** use
`prisma migrate reset` or `prisma db push` against production — they can destroy
data. Production migrations use `npm run db:deploy` (`prisma migrate deploy`).

The seed never resets the database, never deletes candidates, and never
overwrites admin-authored questions.

### Backup / restore (Neon)

Neon provides managed backups. For an extra dump:

```bash
pg_dump "YOUR_NEON_DIRECT_URL" -Fc -f backup.dump
pg_restore "YOUR_NEON_DIRECT_URL" -d postgres backup.dump
```

### Recovering from a failed migration

1. Read the migration error in the logs.
2. If a partial migration left the schema in an unknown state, restore from the
   Neon point-in-time backup, then re-run `npm run db:deploy`.
3. Never hand-edit applied migrations; create a new migration instead.

## 13. Candidate workflow

1. Open the app → **Register as a candidate** (name, email, password, age,
   phone, qualification, optional gender/city).
2. **Sign in** with the registered credentials.
3. Read the **instructions** (10 questions, 15 minutes, scoring rules, pass %).
4. **Start** the assessment — the server snapshots 10 shuffled active questions.
5. Answer questions (auto-saved), mark uncertain ones for review, navigate with
   the palette, and watch the countdown.
6. **Submit** (or let the timer expire → auto-finalize).
7. View the **result** (score, percentage, pass/fail), then the **review** with
   correct answers.

## 14. Admin workflow

1. Open **Admin sign in** → log in with the seeded admin credentials.
2. **Dashboard** — review registrations, attempts, pass rate, and score
   distribution.
3. **Questions** — create/edit questions; activate/deactivate (max 10 active);
   delete unused questions.
4. **Settings** — set assessment duration and pass percentage.
5. **Results** — search/filter/sort completed attempts, open a result for the
   full answer breakdown, or **Export CSV**.

## 15. Scoring calculation

| Outcome | Marks |
|---|---|
| Correct | `+2` |
| Incorrect | `-1` |
| Unanswered | `0` |

```
maxScore   = totalQuestions * 2          (10 questions → 20)
netScore   = correct * 2 - incorrect
percentage = round(netScore / maxScore * 100)
passed     = percentage >= passPercentage (default 60)
```

Scores are persisted at finalize time and analytics read the persisted values.
A candidate passes exactly at the threshold and fails one mark below it.

## 16. API documentation

See [`docs/ARCHITECTURE.md` §7](docs/ARCHITECTURE.md) for the full endpoint
table. All responses use the envelope
`{ "success": true, "data": … }` / `{ "success": false, "error": { code, message, details? } }`.

## 17. Business assumptions

- A single, platform-wide assessment (no multiple authored assessments).
- Exactly 10 questions per attempt, drawn from the active question bank and
  shuffled per candidate.
- One attempt per candidate (enforced by a unique constraint).
- Single-choice questions (exactly one correct option, four options each).
- Pass/fail based solely on percentage vs. the pass threshold.
- Candidates self-register; no email verification flow.
- Admins are seeded via environment variables (no self-service admin signup).

## 18. Security decisions

- **AuthN:** JWTs in `HttpOnly`, `SameSite=Lax` cookies; `Secure` in production.
- **Passwords:** bcrypt (configurable cost).
- **Enumeration resistance:** dummy bcrypt hash on unknown email.
- **CSRF:** strict `Origin` allowlist for state-changing requests.
- **CORS:** origin allowlist; same-origin in production.
- **Input:** Zod validation (strict schemas) + parameterized queries.
- **Data exposure:** DTO whitelisting; correct answers hidden from candidates
  until submission; no stack traces or secrets in errors.
- **Abuse:** rate limiting on auth; Helmet security headers.
- **Integrity:** DB triggers/checks enforce max-active-questions, option counts,
  and score arithmetic.

## 19. Testing

The test suite is `server`-only (Vitest + Supertest) and requires a local
PostgreSQL reachable via `DATABASE_URL` (it creates and drops a throwaway
`aptitude_test` database automatically).

```bash
npm test          # run the full suite
npm run lint      # ESLint (server + web)
npm run typecheck # TypeScript (server + web)
npm run build     # compile server + web for production
```

The suite covers auth, candidate registration/login, the assessment engine
(snapshots, scoring, expiry, concurrency, idempotency), admin question management,
settings, results/analytics, CSV export, and a security audit (89 tests, all
passing).

## 20. Production deployment (Render + Neon)

A single Render **Web Service** serves both the API and the built React app.
PostgreSQL is hosted on **Neon**.

### 20.1 Push to GitHub

```bash
git init   # if not already
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-account>/candidate-platform.git
git push -u origin main
```

### 20.2 Create a Neon database

1. Go to <https://neon.com> and create a project + a database.
2. Copy the **pooled** connection string (`DATABASE_URL`) and the **direct**
   connection string (`DIRECT_URL`) from the Neon dashboard.

### 20.3 Deploy on Render

**Option A — Blueprint (recommended):**

1. Render → **New** → **Blueprint** → select the repository.
2. Enter the secret values when prompted (`DATABASE_URL`, `DIRECT_URL`,
   `JWT_ACCESS_SECRET`, `CORS_ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).

**Option B — Manual Web Service:**

1. Render → **New** → **Web Service** → connect the repo.
2. Settings:

   | Field | Value |
   |---|---|
   | Runtime | Node |
   | Root Directory | (repo root) |
   | Build Command | `npm install --include=dev && npm run db:generate && npm run build` |
   | Start Command | `NODE_ENV=production npm run start:prod` |
   | Health Check Path | `/api/health` |

3. Add environment variables (see §10): `HOST=0.0.0.0`,
   `CORS_ORIGIN=https://<your-app>.onrender.com`, and the Neon `DATABASE_URL` /
   `DIRECT_URL`, plus `JWT_ACCESS_SECRET` and the seed admin vars. Leave `PORT`
   unset — Render injects it.

   > **Important:** do **not** set `NODE_ENV=production` as an environment
   > variable. It is set inline in the Start Command above. Setting it as an env
   > var would also apply it during the build, causing `npm install` to skip the
   > `devDependencies` (TypeScript, `@types/node`, Prisma CLI, Vite) and the
   > build to fail with `Cannot find type definition file for 'node'`. The
   > `--include=dev` flag in the Build Command also guards against this.

### 20.4 Run migrations and seed (once)

The start command (`npm run start:prod`) applies migrations via
`prisma migrate deploy` automatically. To create the initial admin and question
bank, open the Render **Shell** tab and run:

```bash
npm run db:seed
```

(Seed is idempotent; safe to re-run.)

### 20.5 Verify

1. Wait for the service to become **Live**.
2. Open the service URL → the landing page loads.
3. `GET /api/health` returns `database: up`.
4. Sign in to the admin console and register a candidate to verify both flows.

> **Render free tier:** services sleep after inactivity; the first request after
> a sleep can take ~30–60 s to wake the container.

## 21. Demo walkthrough checklist

A 3–5 minute flow to demonstrate the whole platform:

1. **Landing page** — show the two entry points (Candidate / Admin).
2. **Register a candidate** — fill the form; note validation.
3. **Instructions** — point out 10 questions, 15-minute timer, +2/−1/0 scoring.
4. **Start assessment** — answer a few questions, mark one for review, use the
   palette, and refresh the page to show the timer/answers persist.
5. **Submit** — show the result summary (score, percentage, pass/fail).
6. **Review** — show the correct answers revealed after submission.
7. **Admin login** — sign in as admin.
8. **Dashboard** — point out registrations, attempts, pass rate, distribution.
9. **Questions** — edit or toggle a question; note the max-10-active rule.
10. **Settings** — change pass percentage/duration (note historical attempts are
    unaffected).
11. **Results** — open a result detail and **export CSV**.

## 22. Screenshots

Capture the following screens (candidate + admin) from a running instance and
place them in `docs/screenshots/`, then reference them here:

- `candidate-registration.png`, `candidate-instructions.png`,
  `candidate-assessment.png`, `candidate-result.png`, `candidate-review.png`
- `admin-login.png`, `admin-dashboard.png`, `admin-questions.png`,
  `admin-settings.png`, `admin-results.png`

## 23. Troubleshooting

| Symptom | Fix |
|---|---|
| `connection refused` for PostgreSQL | Verify the PostgreSQL service is running; check `DATABASE_URL` host/port. |
| `Invalid DATABASE_URL` / Prisma can't connect | Confirm the URL format and credentials; ensure the database exists. |
| Prisma Client generation fails | Run `npm run db:generate`; check the schema and env vars. |
| Migration fails | Check the migration error; restore from backup and re-run `npm run db:deploy`. |
| Render build fails | Check the build log; ensure `npm install` succeeded and `node` ≥ 20. |
| Render health check fails | Confirm `/api/health` returns 200 and the DB is reachable from Render. |
| Frontend refresh returns 404 | SPA fallback is handled by Express; ensure you're using `npm run start:prod` (not a static host). |
| Cookie/auth issues | Check `CORS_ORIGIN` matches the browser origin and `COOKIE_SECURE` matches HTTPS. |
| Neon connection pool issues | Use the pooled URL for `DATABASE_URL` and the direct URL for `DIRECT_URL`. |

## 24. AI development documentation

This platform was developed in phases with the assistance of an AI coding
assistant (**opencode**, powered by a code-generation model). This final phase
("Phase 13 — production readiness, Docker removal, Render + Neon deployment")
was performed in that tool.

### 24.1 Tools used

- **opencode** — interactive CLI coding assistant used to inspect the codebase,
  plan the changes, edit configuration, write documentation, and run the build,
  lint, typecheck, and test suites.
- **npm / Node.js** — dependency management and script execution.
- **PostgreSQL (local) + Prisma CLI** — database verification.

### 24.2 Key prompts

The primary prompt for this phase was the deployment-readiness brief, which
directed: a full project audit, complete removal of Docker, Docker-free local
Windows development, a single-service Render deployment, Neon PostgreSQL
configuration, environment-variable documentation, an authentication/security
audit, safe database initialization, health checks, comprehensive README/docs,
and final verification.

Concrete tasks executed from that brief (verifiable in this session):

- Audit the repository and write `docs/PHASE_13_DEPLOYMENT_AUDIT.md`.
- Remove Docker artifacts and scrub Docker references.
- Add `directUrl` to the Prisma datasource for Neon.
- Add root `dev`, `db:*`, `start:prod` scripts and `concurrently`.
- Change the Vite dev port to 5173 and the CORS default origin accordingly.
- Add `render.yaml`, rewrite `docs/ARCHITECTURE.md`, and write this README.

> Note: detailed prompt transcripts from earlier phases (00–12) were not
> committed to the repository. The sections above document only what is
> verifiable from this repository and session.

## License

MIT — see [LICENSE](LICENSE).
