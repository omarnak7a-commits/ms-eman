# Test Yourself — Online English Examination Platform

A full-stack online examination platform for **Ms Eman Zahy**. Teachers create
and publish exams; students open a unique link, take the timed exam, and receive
server-graded results, review and a leaderboard.

> **Status:** Full-stack application. The FastAPI backend (verified with 39
> tests) and the frontend are fully wired together via a typed REST API client.
> The original Figma-Make UI/design is intentionally preserved.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, React Router |
| Backend  | Python, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic |
| Database | PostgreSQL |
| Auth     | JWT access tokens + opaque refresh tokens (SHA-256 hashed at rest), bcrypt password hashing |
| Tests    | pytest + FastAPI `TestClient` (39 tests) |

## How data flows (no localStorage database)

- `src/lib/api/` is the single typed REST client (auth, exams, questions,
  attempts, results, students, dashboard).
- `src/lib/api/client.ts` holds teacher JWT/refresh tokens and transparently
  refreshes an expired access token; attempt authorisation uses an opaque
  per-attempt student token (stored so a refresh or reopen can resume within
  the deadline).
- `src/lib/formatAnswers.ts` renders structured student/correct answers for the
  review screens.
- All pages load, create, save and submit through these API calls; the old
  `localStorage` prototype data layer (`src/lib/db.ts`, `grading.ts`) was
  removed. Correct answers are never sent to the browser during an active
  attempt.

## Repository layout

```
├── src/                    # React frontend (Vite)
├── index.html, vite.config.ts
└── backend/
    ├── app/
    │   ├── main.py         # FastAPI app + routers + CORS
    │   ├── core/           # config, security, deps, exceptions, time helpers
    │   ├── db/             # engine / session
    │   ├── models/         # SQLAlchemy models
    │   ├── schemas/        # Pydantic request/response models
    │   ├── repositories/   # data-access helpers
    │   ├── services/       # business logic (auth, exam, grading, attempt, …)
    │   └── api/            # auth / teacher / student routers
    ├── alembic/            # migrations (PostgreSQL)
    ├── tests/              # pytest suite (35 tests)
    ├── requirements.txt
    └── .env.example
```

## Security model (backend)

- Passwords hashed with **bcrypt**; never stored or transmitted in plaintext.
- **JWT access tokens** (short-lived) for teachers; **refresh tokens** are
  opaque, stored only as a SHA-256 hash, rotated on refresh and revocable
  (single logout + logout-all).
- Attempt timing is **server-authoritative**: the deadline is computed on the
  server and stored; the frontend timer is only a visual clock.
- **Grading is server-side only.** The client can never supply a score or the
  correct answer.
- Correct answers are never returned during an active attempt (MCQ
  `is_correct`, ordering `correct_position`, bracket `accepted_answers` are all
  stripped from student payloads).
- Attempts are scoped to an opaque **student attempt token**; a student cannot
  read or modify another student's attempt.
- Exams are teacher-owned; a teacher cannot read/modify another teacher's exams
  (403).
- No automatic fake data in production; a guarded development seed exists.

## Question types

1. **Multiple choice** — teacher marks one correct option; student picks one.
2. **Ordering** — teacher enters the sentence once; tokens are stored in the
   correct sequence and **shuffled** for each student. Student taps words into
   order (Undo / Clear handled on the client). Graded against the canonical
   token order.
3. **Correct the brackets** — teacher provides the bracketed word and accepted
   answers; student types the correction. Case-insensitive unless enabled;
   multiple accepted answers supported.

## Grading

Per attempt the server computes: `score`, `max_score`, `percentage`,
`correct_count`, `incorrect_count`, `unanswered_count`, `time_used_seconds`
and a **rank** (higher score wins; on ties, faster completion time wins).

---

## Local development (backend)

Requires Python 3.11+ and (for production parity) PostgreSQL.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env               # fill DATABASE_URL + SECRET_KEY
alembic upgrade head               # create/migrate the database
uvicorn app.main:app --reload --port 8000
```

### Development seed (optional, never runs automatically)

```bash
ENVIRONMENT=development python -m app.seed
```

Creates the demo teacher **and a sample exam**:

| Field | Value |
|-------|-------|
| Email | `ms.eman.zahy@test.com` |
| Password | `EmanDev2024!` |

> **DEVELOPMENT ONLY.** Refuses to run when `ENVIRONMENT=production`.

### Tests

```bash
cd backend
python -m pytest            # 39 tests covering auth, grading, deadlines, security
```

### Run against PostgreSQL

```bash
createdb test_yourself
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/test_yourself \
  alembic upgrade head
```

The codebase runs unmodified against SQLite (used for tests and quick local
dev) and PostgreSQL (production). Production should always use PostgreSQL.

### Local end-to-end (frontend + backend)

```bash
# Terminal 1 — backend (SQLite is fine for a quick dev run)
cd backend
ENVIRONMENT=development DATABASE_URL=sqlite:///./dev.db alembic upgrade head
ENVIRONMENT=development DATABASE_URL=sqlite:///./dev.db python -m app.seed   # optional demo data
ENVIRONMENT=development DATABASE_URL=sqlite:///./dev.db uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
VITE_API_URL=http://localhost:8000/api npm run dev
```

The frontend stores only JWT/refresh tokens (and a cached teacher profile) in
`localStorage` — no exam/student/result data lives in the browser.

---

## Environment variables

See `backend/.env.example` for the full list with placeholders. Never commit a
real `.env`.

Frontend needs the backend origin at build time:

```
VITE_API_URL=https://YOUR-BACKEND-ORIGIN/api
```

---

## REST API (summary)

| Method | Path | Access |
|--------|------|--------|
| POST | `/api/auth/login` | public |
| POST | `/api/auth/refresh` | public (valid refresh token) |
| POST | `/api/auth/logout` · `/api/auth/logout-all` | refresh token |
| POST | `/api/auth/change-password` | teacher |
| GET  | `/api/auth/me` | teacher |
| GET | `/api/dashboard` | teacher |
| GET/POST | `/api/exams` | teacher |
| GET/PUT/DELETE | `/api/exams/:id` | teacher |
| POST | `/api/exams/:id/publish` · `/close` · `/duplicate` | teacher |
| GET/POST | `/api/exams/:id/questions` | teacher |
| PUT/DELETE | `/api/questions/:id` · reorder | teacher |
| GET | `/api/exams/:id/results` · `/results/:attemptId` · `/ranking` | teacher |
| GET/POST | `/api/students` | teacher |
| GET | `/api/exams/:slug/info` | public |
| POST | `/api/exams/:slug/start` | public (returns attempt token) |
| GET | `/api/attempts/:id` · `/resume` | attempt token |
| PUT | `/api/attempts/:id/answers/:questionId` | attempt token |
| POST | `/api/attempts/:id/submit` | attempt token |
| GET | `/api/attempts/:id/result` · `/review` · `/ranking` | attempt token |

---

## Deployment

### Backend (FastAPI + PostgreSQL)

1. Provision PostgreSQL and set `DATABASE_URL`.
2. Set `SECRET_KEY` (e.g. `openssl rand -hex 32`), `CORS_ORIGINS`, and
   `ENVIRONMENT=production`.
3. Run `alembic upgrade head`, then start the ASGI app
   (`uvicorn app.main:app`) — e.g. on Render / Railway / Fly.io / a VPS.

### Frontend (Vite SPA on Vercel)

A `vercel.json` provides an SPA rewrite for React Router deep links/refresh.
Set `VITE_API_URL` to the backend origin.

### Configuring the production URLs

Before a Vercel deployment, set `VITE_API_URL` (the deployed backend origin +
`/api`) and the backend `CORS_ORIGINS` must include the Vercel origin. Add the
backend `DATABASE_URL` + `SECRET_KEY` on the backend host. No secrets are
bundled into the frontend.
