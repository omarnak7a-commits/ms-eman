# Fix-request implementation report

Repository: `ms-eman` · Branch: `arena/01a07d51-ms-eman` (work NOT committed/pushed, per instructions)
Date: 2026-09-07

## Summary

Every confirmed issue in the fix request was addressed. All regression tests added for each fix are green (backend 100 passed — 77 pre-existing + 23 new; frontend 51 passed — 48 pre-existing + 3 new), `tsc --noEmit` clean, `npm run build` clean.

---

## Fixed issues

### H1 — Student results gated by `result_visibility` on the backend
- **Backend**: `AttemptService.get_result` now raises `AuthorizationError("Result visibility is disabled for this exam.")` (403) when the exam's `result_visibility` is off, mirroring the existing secure `get_review` pattern. Active attempts still raise 409 first; enabled exams behave exactly as before.
- **Frontend**: `ResultPage` converts that 403 into a friendly, information-safe "Exam Submitted — this exam does not show results to students" state; no score is ever rendered.
- **Teacher access preserved**: teacher result routes (`/exams/{id}/results`, `/exams/{id}/results/{attempt_id}`) go through `submitted_out`/`_review_payload` directly and are untouched by the student-facing gate.
- **Tests**: `tests/test_visibility_enforcement.py` — enabled→200, disabled→403 (direct API with a valid token), teacher still sees the attempt and full detail; `frontend/src/test/resultPageHidden.test.tsx` (mocked API unit test).

### H2 — Fail fast in production on placeholder configuration
- `Settings` now has a `model_validator` that refuses to construct in `environment=production` when `secret_key` is empty/placeholder/`change_me…` or `database_url` is the localhost placeholder or a `sqlite://` URL. Dev/test keep working with defaults.
- Inspected the other "dangerous" configs: seed data and admin bootstrap are already gated — `app/seed.py` refuses to run in production, and `create_admin.py` requires explicit `ADMIN_EMAIL`/strong `ADMIN_PASSWORD`; no unrelated changes made. No JWT format/lifetime/issuer/audience/refresh changes.
- **Tests**: `tests/test_config_prod_guard.py` — dev/test defaults allowed; production placeholder secret / localhost URL / sqlite URL each raise; real secret + Neon-style URL constructs fine.

### M2 — Teacher student list + `GET /students/{id}` scoped to the teacher
- `StudentService.list` now only returns students who actually attempted one of the *teacher's own* exams (a Student row created by another teacher's exam never leaks into the roster). Student rows are never deleted (no deletion path exists or was added).
- `GET /api/students/{student_id}` now uses a scoped `StudentService.get(owner_id, student_id)` and returns 404 for out-of-scope or unknown students.
- A student who legitimately attempted exams of two teachers remains visible to both.
- **Tests**: `tests/test_students_scope.py` — Teacher A vs B rosters, shared legitimate student visible to both, out-of-scope detail → 404, foreign-student row never in the list, active-only student visible but not "completed".

### M3 — `expired` counts as completed in student statistics
- `StudentService.list` (the teacher Students page data) now treats `{submitted, expired}` as completed for `exam_count`, `attempts_count`, averages, highest and last-exam fields; `active` meaning is unchanged (not completed).
- **Tests**: `test_students_scope.py::test_expired_attempts_count_as_completed_in_student_stats` (expired student listed with attempts_count/exam_count 1 and a last-exam entry) and `test_student_with_only_active_attempt_is_visible_but_not_completed`.

### L8 — Student ranking endpoint honors `ranking_enabled=false`
- `GET /api/attempts/{id}/ranking` now raises 403 `AuthorizationError("Ranking is disabled for this exam.")` when the exam has `ranking_enabled` off (active-attempt 409 check runs first). Behavior unchanged when enabled. Teacher ranking endpoints call `RankingService` directly and are unaffected.
- **Tests**: `test_visibility_enforcement.py` — student ranking 200 when enabled / 403 when disabled, teacher `/exams/{id}/ranking` still 200 for the disabled exam.

### M4 — Safe resume of an active attempt via the shared exam link
- The existing per-attempt token model is the identity credential, so nothing on the backend broadens access (no attempt id/token is ever exposed to anonymous callers — `start` keeps returning a plain 409 for a duplicate start).
- **Frontend**: when "Start Exam" is refused, `ExamStartPage` scans ONLY this device's own stored attempt tokens (`ty_attempt_*`) and resumes the one whose `exam_id`, **student name** and `status='active'` + `can_resume` all match. It then routes into `/attempt/{id}`, where the existing resume endpoint restores the frozen questions/answers. Token is required; a different device (no token) cannot resume — no new identity vulnerability, no cross-student access.
- Server-side `start` was race-hardened as part of M5 (below) so the reopen 409 is deterministic.
- **Tests**: backend `test_reopen_shared_link_conflicts_then_token_resumes_active_attempt` + `test_expired_attempt_never_resumes` (reconcile→expired, `can_resume:false`, further saves rejected); frontend `studentFlow` "M4: reopening the shared exam link resumes the running attempt on this device" (real UI: 409 → token scan → resume → questions visible, still exactly one active attempt server-side).

### M1 — Ordering grading handles repeated visible words
- `grade_ordering` now compares the sequence of **visible token texts** (student ids mapped to their token text) instead of raw id lists. The server still validates that the submitted ids are a full permutation of that question's tokens, so:
  - unique-text tokens: byte-for-byte identical behavior to the old id comparison;
  - repeated words (e.g. two "the" chips): either visually-identical id choice is correct — a student is never penalized for tapping the "wrong" identical chip.
- Grading stays server-authoritative; no frontend change needed.
- **Tests**: `tests/test_grading_feedback.py` — repeated-word ordering (swapped identical ids correct, wrong visible reading incorrect, exact-id ordering still works) plus a unique-token regression (swapped tokens still wrong).

### M5 — DB-level guard against duplicate *active* attempts
- Added a **partial unique index** `uq_exam_attempts_one_active_per_student` on `exam_attempts(exam_id, student_id) WHERE status = 'active'` (PostgreSQL `postgresql_where`, SQLite `sqlite_where`). Finalised (submitted/expired) rows are exempt, so legacy/historical duplicates and the "best attempt wins" ranking/stats semantics are untouched — no global `(exam_id, student_id)` uniqueness was imposed.
- `start` was refactored to be race-safe: `_find_or_create_student` (bounded retry on the unique `students.normalized_name` race) and an IntegrityError path that rolls back and answers exactly like a sequential double-start (409), never a second attempt or a 500.
- **Migration**: YES — Alembic `4f2b8a1c9e05_one_active_attempt_per_student_per_exam.py` (revision chain d8c4e6337bb8 → a3f1c9d24e75 → 4f2b8a1c9e05). Non-destructive and data-preserving: it first deterministically resolves any pre-existing duplicate *active* rows (keeps the earliest-started attempt active, expires the rest at their deadline if passed, else at migration time) and then creates the partial index. Verified against scratch SQLite DBs: fresh `upgrade head`, seeded-duplicates → repair → index creation, `downgrade -1` drops the index, re-upgrade works, `PRAGMA integrity_check` ok.
- **Tests**: `tests/test_active_attempt_db_guard.py` — second active insert for the same (exam, student) raises IntegrityError at the DB layer; multiple submitted/expired duplicates stay legal; two students may both be active on one exam.

### L1 — Remove production/debug console logs
- Removed `[EXAM DEBUG]` logs from `frontend/src/main.tsx`, `pages/student/ExamStartPage.tsx` (2), `pages/student/ExamActivePage.tsx` (1). Kept legitimate error/warn logging (`ErrorBoundary.console.error`, `storage.ts` fallback warning). No other `console.log/debug` remains anywhere in `src`.

### L3 — Refresh-token cleanup wired in (no scheduler needed)
- `delete_expired` is now called opportunistically inside `AuthService.issue_tokens` (login) and `refresh` (rotation) — the same commit that issues the new token. Only rows past expiry are removed, so no live session is ever affected; `refresh()` independently rejects expired tokens as a backstop.
- **Tests**: `test_auth.py::test_expired_refresh_tokens_swept_on_login` — expired rows are removed on the next login, the freshly issued token works.
- Note: `delete_expired` itself needed a small portability fix (SQLite returns naive datetimes; the ORM-side datetime comparison crashed) — it now normalizes the cutoff per dialect and runs the DELETE in SQL (`synchronize_session=False`).

### L6 — Exam duration input aligned with backend bound
- Backend schema allows `duration_minutes` up to 600 (`ge=1, le=600`). The custom input in `ExamDetailPage` used `max={180}`; it now uses `max={600}`. Presets unchanged.

### L2 — An `active` exam can be closed from the UI
- Lifecycle confirmed: `draft → published → active → closed`; `activate` only exists as an unused frontend API method, but an exam can legitimately be `active` (e.g. activated via API/automation) and the UI had no way to close it (the Close button was `published`-only).
- The Close Exam button now shows for `published` **and** `active` exams; nothing else about lifecycle semantics changed.
- **Test**: `examEdit.test.tsx` "L2: an exam in 'active' state (via the activate API) can be closed from the UI" — activates via API, sees the Close button, closes through the confirm dialog, verifies `status == closed` server-side.

### L10 — Dev seed hint hidden from production UI
- `LoginPage` shows the `ms.eman.zahy@test.com` development seed hint only under `import.meta.env.DEV` (Vite dev). Production builds never render it. Seed functionality itself is untouched (and already refuses to run when `ENVIRONMENT=production`).

---

## Intentionally unchanged (per instructions)

- **L4 — draft persistence**: no concrete product requirement exists in the code or request for autosave of teacher drafts; the draft lifecycle (`draft → published → closed`, explicit "Save Changes") is working. Left unchanged.
- **L5 — JWT access/refresh behavior**: untouched.
- **`frontend/src/lib/version.ts`** now has no importers after the L1 cleanup (it only exported a build label used by the removed debug log). Left in place as inert build metadata rather than churning the tree.
- Preserved working components as instructed: Neon/Postgres architecture, FastAPI layout, auth/JWT+refresh rotation, server-authoritative timer, snapshot versioning, grading architecture, MCQ/brackets behavior, routing, Vercel deployment. No DB resets/drops; no test deletions or weakenings.

---

## Verification

| Suite | Result |
|---|---|
| Backend `pytest` (`backend/tests`, in-memory SQLite) | **100 passed** (77 existing + 23 new regression tests) |
| Frontend `vitest run` (real backend E2E + unit) | **51 passed** (48 existing + 3 new) |
| `npx tsc --noEmit` | clean |
| `npm run build` (vite) | clean |
| Alembic migration | fresh upgrade, duplicate-repair path, downgrade/re-upgrade all verified on scratch SQLite DBs |

No unrelated pre-existing failures were encountered.

## Migration

- **Yes** — `backend/alembic/versions/4f2b8a1c9e05_one_active_attempt_per_student_per_exam.py` (down_revision `a3f1c9d24e75`). Alembic, PostgreSQL/Neon-safe partial unique index, non-destructive, data-preserving, migration behavior tested on SQLite (fresh + repair + downgrade). The model (`exam_attempts.__table_args__`) mirrors the same index so tests and fresh databases are consistent with production after `alembic upgrade head`.

## Git status (uncommitted, per instructions)

Modified: `backend/app/api/student.py`, `backend/app/api/teacher.py`, `backend/app/core/config.py`, `backend/app/models/exam_attempt.py`, `backend/app/repositories/refresh_token_repo.py`, `backend/app/services/attempt_service.py`, `backend/app/services/auth_service.py`, `backend/app/services/grading_service.py`, `backend/app/services/student_service.py`, `backend/tests/{test_auth,test_grading_feedback,test_student_attempts}.py`, `frontend/src/lib/storage.ts`, `frontend/src/main.tsx`, `frontend/src/pages/student/{ExamActivePage,ExamStartPage,ResultPage}.tsx`, `frontend/src/pages/teacher/{ExamDetailPage,LoginPage}.tsx`, `frontend/src/test/{examEdit,studentFlow}.test.tsx`.

Untracked (new): `backend/alembic/versions/4f2b8a1c9e05_one_active_attempt_per_student_per_exam.py`, `backend/tests/{test_active_attempt_db_guard,test_config_prod_guard,test_students_scope,test_visibility_enforcement}.py`, `frontend/src/test/resultPageHidden.test.tsx`.

Nothing pushed, no commits made.
