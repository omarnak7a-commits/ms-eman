# Plan: TEST YOURSELF — Full-Stack Exam Platform (Frontend)

## Context

The user wants to build "Test Yourself", a branded online English examination platform for Ms Eman Zahy. The spec is a comprehensive full-stack brief (React + FastAPI + PostgreSQL), but this environment is a Figma Make project: React + Vite + Tailwind CSS, browser-only. The backend spec cannot run here.

**Approach:** Build the complete, fully functional frontend application with all screens, flows, and business logic. Persistence will use `localStorage` (simulating a database). All grading, timer enforcement, and server-side logic will be implemented client-side in a service layer — architecturally isolated so it could be swapped for real API calls later. The logo image (`Max_a_____________________-Photoroom-1.png`) will be used as the brand logo throughout.

The result will be a fully navigable, end-to-end working exam platform with:
- Teacher flow: login → dashboard → create exam → build questions → publish → view results
- Student flow: open link → enter name → take exam (with timer) → get results → review answers → leaderboard

---

## Architecture

### File Structure

```
src/
├── App.tsx                  — router root, redirects / → /login
├── index.css                — Tailwind + font import (Inter from Google Fonts)
├── imports/
│   └── Max_a_...-1.png      — brand logo (already present)
├── types/
│   └── index.ts             — shared TypeScript types for all entities
├── lib/
│   ├── db.ts                — localStorage read/write helpers (the "database")
│   ├── auth.ts              — teacher auth: login, logout, token check (localStorage)
│   ├── grading.ts           — grading engine for MCQ, ordering, correct brackets
│   ├── slugify.ts           — slug generation utility
│   └── timer.ts             — deadline calculation helpers
├── hooks/
│   ├── useAuth.ts           — auth state + protected route hook
│   └── useExamTimer.ts      — countdown from deadline_at
├── components/
│   ├── Logo.tsx             — brand logo + "Ms Eman Zahy" header
│   ├── ProtectedRoute.tsx   — redirects to /login if unauthenticated
│   ├── LoadingSpinner.tsx
│   ├── EmptyState.tsx
│   └── ConfirmDialog.tsx
├── layouts/
│   ├── TeacherLayout.tsx    — sidebar nav for teacher pages
│   └── ExamLayout.tsx       — minimal header for student exam pages
└── pages/
    ├── teacher/
    │   ├── LoginPage.tsx
    │   ├── DashboardPage.tsx
    │   ├── ExamsPage.tsx
    │   ├── ExamDetailPage.tsx     — view/edit exam + question builder
    │   ├── ExamResultsPage.tsx    — attempt list with search/sort
    │   ├── AttemptDetailPage.tsx  — individual attempt review (teacher view)
    │   ├── StudentsPage.tsx
    │   └── SettingsPage.tsx
    └── student/
        ├── ExamStartPage.tsx      — /exam/:slug
        ├── ExamActivePage.tsx     — /attempt/:id
        ├── ResultPage.tsx         — /attempt/:id/result
        ├── ReviewPage.tsx         — /attempt/:id/review
        └── RankingPage.tsx        — /attempt/:id/ranking
```

### Routes

```
/login                         → LoginPage (public)
/dashboard                     → DashboardPage (protected)
/exams                         → ExamsPage (protected)
/exams/new                     → ExamDetailPage (new mode)
/exams/:id                     → ExamDetailPage (edit/view mode)
/exams/:id/results             → ExamResultsPage
/exams/:id/results/:attemptId  → AttemptDetailPage
/students                      → StudentsPage
/settings                      → SettingsPage
/exam/:slug                    → ExamStartPage (public)
/attempt/:id                   → ExamActivePage (public)
/attempt/:id/result            → ResultPage
/attempt/:id/review            → ReviewPage
/attempt/:id/ranking           → RankingPage
```

---

## Data Layer (`src/lib/db.ts`)

All data stored in `localStorage` as JSON under namespaced keys. Entities:

- `ty_teachers` — `{ id, name, email, password_hash, role, created_at }`
- `ty_exams` — `{ id, title, description, instructions, slug, duration_minutes, status, ranking_enabled, result_visibility, review_visibility, created_by, published_at, closed_at, created_at }`
- `ty_questions` — `{ id, exam_id, type, text, order_index, marks, data: { options[] | tokens[] | brackets[] } }`
- `ty_students` — `{ id, name, normalized_name, created_at }`
- `ty_attempts` — `{ id, exam_id, student_id, status, started_at, deadline_at, submitted_at, score, max_score, percentage, time_used_seconds, rank }`
- `ty_answers` — `{ id, attempt_id, question_id, answer_data, is_correct, awarded_marks, answered_at }`

Seed data created on first load: teacher `ms.eman.zahy@test.com` / `password123`, sample exam "English Grammar Test" with one MCQ, one ordering, one correct-brackets question.

---

## Key Modules

### `src/lib/grading.ts`
- `gradeAnswer(question, answerData)` → `{ is_correct, awarded_marks }`
- MCQ: compare selected option id to correct option id
- Ordering: compare token id sequence to `correct_position` order
- Correct Brackets: normalize (trim, collapse spaces, optionally case-insensitive) and compare against accepted answers array
- `gradeAttempt(attemptId)` → finalizes all answers, calculates score/percentage/rank, writes to `ty_attempts`

### `src/lib/auth.ts`
- `login(email, password)` → stores `ty_session` in localStorage, returns teacher object
- `logout()` → removes `ty_session`
- `getSession()` → returns current teacher or null
- `useAuth` hook wraps these with React state

### `src/hooks/useExamTimer.ts`
- Takes `deadline_at` (ISO string), returns `{ secondsLeft, isExpired }`
- On expiry: calls `gradeAttempt` automatically and navigates to result

---

## UI Design Tokens (in `src/index.css`)

```css
--color-primary: #2563eb;      /* blue-600 */
--color-accent: #93c5fd;       /* blue-300 / baby blue */
--color-correct: #22c55e;      /* green-500 */
--color-incorrect: #ef4444;    /* red-500 */
--color-surface: #ffffff;
--color-muted: #f1f5f9;        /* slate-100 */
```

Font: Inter (Google Fonts CSS2 import in `src/index.css`)

Logo from `src/imports/Max_a_____________________-Photoroom-1.png` — imported as ES module, used in `Logo.tsx` with `<img>` (no ImageWithFallback needed, plain img tag fine for a logo).

---

## Implementation Order

1. `src/index.css` — font import + CSS variables
2. `src/types/index.ts` — all TypeScript interfaces
3. `src/lib/db.ts` — localStorage CRUD + seed
4. `src/lib/auth.ts` + `src/lib/grading.ts` + `src/lib/slugify.ts` + `src/lib/timer.ts`
5. `src/hooks/useAuth.ts` + `src/hooks/useExamTimer.ts`
6. `src/components/` — Logo, ProtectedRoute, LoadingSpinner, EmptyState, ConfirmDialog
7. `src/layouts/TeacherLayout.tsx` + `src/layouts/ExamLayout.tsx`
8. Teacher pages: Login → Dashboard → Exams → ExamDetail (with question builder) → ExamResults → AttemptDetail → Students → Settings
9. Student pages: ExamStart → ExamActive (timer, auto-save, tap-to-arrange, immediate feedback) → Result → Review → Ranking
10. `src/App.tsx` — wire all routes

---

## Notable Implementation Details

- **Question builder**: Inline editing for all 3 types. MCQ shows option list with radio for correct answer. Ordering: textarea → tokenize on space/punctuation → editable chip list. Correct Brackets: textarea with `(word)` detection, accepted answers input.
- **Tap-to-Arrange**: Available tokens as pill buttons; answer area as numbered slots. Tap token → fills next slot; tap filled slot → returns token. Undo/Clear buttons.
- **Timer**: `useExamTimer` re-renders every second. When `secondsLeft <= 0`, auto-submits via `gradeAttempt` and navigates to result page. Timer shown in red when < 60s.
- **Immediate feedback**: After saving an answer, backend (grading lib) returns `is_correct`. Show green "Correct ✓" or red "Incorrect ✗" badge. Never show the correct answer text during active exam.
- **Publish validation**: Check title, duration > 0, at least 1 question, all questions have marks > 0 and correct answers configured. Show inline error list if invalid.
- **Anti-duplicate submission**: Check `attempt.status !== 'active'` before grading; set status to `'submitted'` atomically.

---

## Verification

1. Teacher login with seeded credentials works
2. Create exam → add all 3 question types → publish → copy link
3. Open student link → enter name → start → answer questions → see immediate feedback → submit → see result
4. Return to teacher → view attempt in results
5. Ranking page shows if enabled
6. Timer auto-submits when expired
7. Responsive on narrow viewport (≤375px)
