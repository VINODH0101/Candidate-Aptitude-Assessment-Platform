# Aptitude Assessment Platform — Architecture

> This document reflects the **implemented** system. It supersedes the earlier
> draft that described a different target model.

## 1. Overview

A single-tenant aptitude assessment platform:

- Candidates self-register, sign in, take a **timed** 10-question assessment,
  submit, and review their result.
- Administrators manage the **question bank** (max 10 active questions), adjust
  **assessment settings** (duration + pass percentage), and view **results**,
  **analytics**, and **CSV export**.

The system enforces hard invariants: one attempt per candidate, exactly 10 active
questions, snapshot-based grading, and server-authoritative timing.

## 2. Runtime topology

### 2.1 Local development

```
Browser ── http://localhost:5173 ──▶ Vite dev server (web)
                                          │ /api/* (proxy)
                                          ▼
                                   Express API (server) :5000
                                          │
                                          ▼
                                   PostgreSQL (localhost:5432)
```

- Vite serves the React app with HMR; its dev proxy forwards `/api/*` to the
  Express server, keeping a same-origin shape for cookie auth.

### 2.2 Production (Render, single service)

```
Browser ── https://<app>.onrender.com ──▶ Express (server)
                                            ├── /api/*      → REST API
                                            ├── /           → built React SPA
                                            └── /<route>    → SPA fallback (index.html)
                                                     │
                                                     ▼
                                            Neon PostgreSQL
```

- `server/src/app.ts` serves the compiled React bundle from `web/dist` and falls
  back to `index.html` for non-API navigations, so page refreshes work on nested
  routes. API routes always take precedence.

## 3. Repository structure

```
candidate-platform/
├─ package.json                 # npm workspaces: server, web + scripts
├─ .env.example                 # environment template (copy to .env)
├─ render.yaml                  # Render Blueprint (single web service)
├─ server/                      # Express + Prisma API
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  ├─ migrations/            # versioned SQL migrations
│  │  └─ seed.ts                # idempotent seed (admin, questions, settings, demo candidate)
│  ├─ src/
│  │  ├─ app.ts / index.ts      # app factory / bootstrap (+ expiry sweeper)
│  │  ├─ config/                # env validation, assessment constants
│  │  ├─ lib/                   # prisma, http envelope, errors, tokens, cookies, logger
│  │  ├─ middleware/            # auth, csrf, validate, error, rateLimit, requestLogger
│  │  └─ modules/
│  │     ├─ candidates/         # candidate register/login/session
│  │     ├─ admin-auth/         # admin login/logout/session
│  │     ├─ admin/              # overview counts
│  │     ├─ questions/          # question-bank CRUD + activation invariant
│  │     ├─ settings/           # assessment settings (singleton)
│  │     ├─ assessment/         # candidate attempt engine + grading
│  │     ├─ attempts/           # admin attempt start
│  │     ├─ results/            # admin results list/detail/export
│  │     └─ analytics/          # dashboard aggregates
│  └─ tests/                    # Vitest + Supertest integration suite
└─ web/                         # React + Vite + Tailwind
   └─ src/
      ├─ lib/                   # api client, queryClient, format, utils
      ├─ components/ui/         # shadcn-style primitives
      ├─ components/            # AppLayout, RequireAuth, StateViews
      └─ features/              # auth, candidate, admin, public
```

## 4. Backend architecture

```
route → Zod validation → controller (HTTP only) → service (business rules, transactions) → Prisma → PostgreSQL
```

- Controllers contain no business logic; services own invariants; DTO mappers
  whitelist response fields (no hashes, no answer keys to candidates).
- Multi-step writes run in `prisma.$transaction`; concurrency is guarded with
  `pg_advisory_xact_lock` and conditional updates.

## 5. Database schema

### 5.1 Entities

| Model | Purpose | Key constraints |
|---|---|---|
| `Admin` | Administrator account | `email` unique, normalized-lowercase check |
| `Candidate` | Candidate account | `email` unique; `age` 18–60; `phone` 10 digits; name format; qualification enum |
| `Question` | Global question bank | exactly 4 options; `correctOptionIndex` 0–3; `isActive`; unique text; max 10 active via trigger |
| `TestAttempt` | One attempt per candidate | `candidateId` unique; status enum; `questionSnapshots` JSONB; timing/scoring checks |
| `CandidateAnswer` | Saved answer per question | `UNIQUE(attemptId, questionId)`; option index 0–3 or null |
| `AppSetting` | Singleton settings | `id = 1`; duration + pass percentage |

### 5.2 Enums

`Gender`, `Category` (QUANTITATIVE/LOGICAL/VERBAL), `Difficulty`
(EASY/MEDIUM/HARD), `Qualification`, `AttemptStatus`
(IN_PROGRESS/COMPLETED/EXPIRED), `AttemptResult` (PASS/FAIL).

### 5.3 Snapshot design

At attempt start, `TestAttempt.questionSnapshots` stores an immutable copy of the
question text, options, correct index, category and difficulty. Grading reads
**only** the snapshot, so later question edits never change historical results.

### 5.4 ER diagram

```mermaid
erDiagram
    ADMIN ||--o{ " " : "none"
    CANDIDATE ||--o| TEST_ATTEMPT : "takes (1)"
    TEST_ATTEMPT ||--o{ CANDIDATE_ANSWER : "contains"
    QUESTION ||--o{ CANDIDATE_ANSWER : "answered"
    APP_SETTING ||--o{ " " : "singleton"

    CANDIDATE {
        string id PK
        string email UK
        string passwordHash
        int age
        string phone
        enum gender
        enum highestQualification
        string city
    }
    ADMIN {
        string id PK
        string email UK
        string passwordHash
        string name
    }
    QUESTION {
        string id PK
        string questionText UK
        string[] options
        int correctOptionIndex
        enum category
        enum difficulty
        boolean isActive
    }
    TEST_ATTEMPT {
        string id PK
        string candidateId UK "FK"
        enum status
        json questionSnapshots
        int totalQuestions
        int durationMinutes
        int passPercentage
        datetime startedAt
        datetime expiresAt
        datetime submittedAt
        int netScore
        int correctCount
        int incorrectCount
        int unattemptedCount
        int marksDeducted
        int percentage
        enum result
        int timeTakenSeconds
    }
    CANDIDATE_ANSWER {
        string id PK
        string attemptId FK
        string questionId FK
        int selectedOptionIndex
        boolean markedForReview
    }
    APP_SETTING {
        int id PK
        int assessmentDurationMinutes
        int passPercentage
    }
```

## 6. Attempt lifecycle & scoring

### 6.1 Lifecycle

```
(no attempt) ──start──▶ IN_PROGRESS ──submit before deadline──▶ COMPLETED
                            │
                            └──deadline reached (auto-finalize)──▶ EXPIRED
```

- One attempt per candidate (`TestAttempt.candidateId` unique).
- Timing is server-authoritative (`expiresAt`); the client only renders
  `serverNow` + `remainingSeconds`.
- An interval sweeper (`index.ts`) lazily finalizes expired attempts
  (`FOR UPDATE SKIP LOCKED`).

### 6.2 Scoring

| Event | Marks |
|---|---|
| Correct answer | `+2` |
| Incorrect answer | `-1` |
| Unanswered | `0` |

```
maxScore   = totalQuestions * 2
netScore   = correct*2 - incorrect
percentage = round(netScore / maxScore * 100)
passed     = percentage >= attempt.passPercentage   (snapshotted)
```

`netScore`, `percentage` and `result` are persisted at finalize; analytics read
persisted values.

## 7. API surface

Base `/api`. Envelope: `{ "success": true, "data": … }` /
`{ "success": false, "error": { code, message, details? } }`.

### Public / health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Liveness + DB connectivity (`503` if DB down) |
| GET | `/api/health/live` | public | Process liveness only |

### Candidate

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/candidate/register` | public | Register candidate; sets cookie |
| POST | `/api/candidate/login` | public | Login; sets cookie |
| POST | `/api/candidate/logout` | candidate | Clear cookie |
| GET | `/api/candidate/session` | candidate | Current profile |
| GET | `/api/candidate/assessment/instructions` | candidate | Rules, readiness, scoring scheme |
| POST | `/api/candidate/assessment/start` | candidate | Start/resume attempt (snapshot 10 questions) |
| GET | `/api/candidate/assessment/attempt` | candidate | Attempt state + timer |
| GET | `/api/candidate/assessment/attempt/questions/:index` | candidate | One question view (no keys) |
| PUT | `/api/candidate/assessment/attempt/answers/:index` | candidate | Save answer / mark review |
| POST | `/api/candidate/assessment/submit` | candidate | Finalize + grade |
| GET | `/api/candidate/assessment/result` | candidate | Result summary |
| GET | `/api/candidate/assessment/result/review` | candidate | Per-question review (with correct answers) |

### Admin (all require admin session)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/admin/auth/login` | Admin login |
| POST | `/api/admin/auth/logout` | Admin logout |
| GET | `/api/admin/auth/session` | Admin identity |
| GET | `/api/admin/overview` | Counts (candidates, questions, attempts, admins) |
| GET | `/api/admin/assessment/readiness` | Active-question readiness |
| GET/POST | `/api/admin/questions` | List (paginated/filtered) / create |
| GET/PUT/PATCH/DELETE | `/api/admin/questions/:id[/status]` | Read/update/activate/delete |
| GET/PUT | `/api/admin/settings` | Read/update duration + pass % |
| POST | `/api/admin/attempts/start` | Start an attempt for a candidate (admin) |
| GET | `/api/admin/results` | Paginated finalized results |
| GET | `/api/admin/results/export` | CSV export |
| GET | `/api/admin/results/:attemptId` | Full result incl. answer keys |
| GET | `/api/admin/analytics` | Dashboard aggregates |

## 8. Security

- **AuthN:** separate `admin_token` / `candidate_token` JWTs in `HttpOnly`,
  `SameSite=Lax` cookies; `Secure` auto-enabled in production.
- **Passwords:** bcrypt (cost configurable via `BCRYPT_ROUNDS`).
- **Timing safety:** dummy hash on unknown email (prevents enumeration).
- **CSRF:** strict `Origin` allowlist for state-changing requests (`CORS_ORIGIN`).
- **CORS:** origin allowlist (`CORS_ORIGIN`), `credentials: true`.
- **Input:** Zod validation on body/params/query; strict schemas (unknown keys
  rejected); parameterized queries (Prisma).
- **Data exposure:** DTO whitelisting; correct answers never returned to
  candidates before submission; no stack traces in error responses.
- **Abuse:** `express-rate-limit` on auth routes; `helmet` headers.
- **Integrity:** DB triggers/checks enforce max 10 active questions, option
  counts, and score arithmetic; advisory locks serialize activation and start.

## 9. Configuration

Environment variables are validated in `server/src/config/env.ts` (Zod). See
`.env.example` and the README for the complete reference.
