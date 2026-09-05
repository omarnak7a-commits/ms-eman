# TEST YOURSELF — COMPLETE FULL-STACK ONLINE EXAMINATION PLATFORM

## ROLE

You are a senior full-stack software engineer, software architect, UI/UX designer, database engineer, and security engineer.

Build a **complete, production-ready full-stack web application** called:

**TEST YOURSELF**

Teacher / Brand:

**Ms Eman Zahy**

This is an online English examination platform.

---

# CRITICAL REQUIREMENT

This is NOT a landing page.

This is NOT a Figma-only prototype.

This is NOT a static frontend mockup.

This is NOT a demo with fake data.

Build the **actual complete working application**.

All major functionality must be implemented with real frontend, backend, database, authentication, APIs, validation, security, state management, persistence, and error handling.

Do not leave important functionality as:

* TODO
* FIXME
* Coming Soon
* Mock
* Placeholder
* Hardcoded demo data
* Fake API
* Client-only implementation

If a feature is specified below, implement it.

---

# 1. PRODUCT GOAL

Create a simple and reliable online English examination platform where:

### Teacher

Login → Dashboard → Create Exam → Add Questions → Configure Exam → Publish → Copy Exam Link → Share → View Attempts → View Results → View Ranking

### Student

Open Unique Link → Enter Name → Read Instructions → Start Exam → Answer Questions → Receive Correct/Incorrect Feedback → Continue → Submit/Auto-submit → Automatic Grading → Result → Ranking if enabled → Review Answers

The system must prioritize:

* Reliability
* Security
* Simple UX
* Fast performance
* Mobile usability
* Accurate grading
* Clear navigation

---

# 2. NO LANDING PAGE

Do NOT build:

* Marketing landing page
* Hero section
* Pricing
* Testimonials
* Features marketing section
* SaaS marketing page
* Blog
* Public homepage

The application starts directly with the appropriate application flow.

Teacher:

`/login`

Student:

`/exam/:examSlug`

---

# 3. TECHNOLOGY

Use a modern, maintainable full-stack architecture.

Recommended stack:

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* React Router
* TanStack Query or equivalent
* Proper form validation
* Responsive design

### Backend

Use:

* Python
* FastAPI
* Pydantic
* SQLAlchemy
* PostgreSQL

### Authentication

Implement secure teacher authentication using:

* Password hashing
* Access tokens
* Refresh tokens
* Secure token handling
* Protected routes
* Logout
* Session expiration

Do NOT store passwords in plain text.

### Database

Use PostgreSQL.

Use migrations.

Do not rely on in-memory storage.

---

# 4. PROJECT ARCHITECTURE

Use a clean and maintainable architecture.

Suggested structure:

```text
project/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── api/
│   │   ├── types/
│   │   ├── utils/
│   │   └── routes/
│   └── ...
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── core/
│   │   ├── db/
│   │   └── main.py
│   ├── migrations/
│   └── ...
│
├── docker-compose.yml
├── .env.example
├── README.md
└── ...
```

Keep business logic out of frontend components.

Keep database logic out of API route handlers where practical.

Use services/repositories for maintainability.

---

# 5. DATABASE DESIGN

Create a real relational database.

At minimum implement these entities:

### Teacher/User

Fields:

* id
* name
* email
* password_hash
* role
* created_at
* updated_at

### Exam

Fields:

* id
* title
* description
* instructions
* slug
* duration_minutes
* status
* ranking_enabled
* result_visibility
* review_visibility
* published_at
* closed_at
* created_at
* updated_at
* created_by

Statuses:

* draft
* published
* active
* closed

### Question

Fields:

* id
* exam_id
* type
* text
* order_index
* marks
* created_at
* updated_at

Question types:

* multiple_choice
* ordering
* correct_brackets

### Multiple Choice Option

Fields:

* id
* question_id
* text
* order_index
* is_correct

Correct answers must never be exposed to students before final submission.

### Ordering Question Data

Store:

* token id
* question id
* token text
* correct_position

The student should receive shuffled tokens.

### Correct Brackets Data

Store:

* original bracket word
* accepted answers

Support multiple accepted answers when needed.

### Student

Fields:

* id
* name
* normalized_name
* created_at

Students do NOT need accounts.

### Exam Attempt

Fields:

* id
* exam_id
* student_id
* status
* started_at
* deadline_at
* submitted_at
* score
* max_score
* percentage
* time_used_seconds
* rank

Statuses:

* active
* submitted
* expired

### Answer

Fields:

* id
* attempt_id
* question_id
* answer_data
* is_correct
* awarded_marks
* answered_at
* updated_at

Use proper relationships and indexes.

---

# 6. TEACHER AUTHENTICATION

Create:

`POST /auth/login`

`POST /auth/refresh`

`POST /auth/logout`

`GET /auth/me`

Implement:

* Secure password hashing
* Authentication middleware
* Authorization
* Protected teacher routes
* Refresh token rotation
* Logout
* Expiration

Only authenticated teachers can access:

* Dashboard
* Exams
* Students
* Results
* Settings

Students must never access these APIs.

---

# 7. TEACHER DASHBOARD

Create a real dashboard connected to the database.

Statistics:

* Total Exams
* Total Students
* Total Attempts
* Average Score

Recent exams:

* Exam title
* Questions
* Duration
* Status
* Attempts
* Average score
* Date

Do not use hardcoded values.

Everything must come from backend APIs.

---

# 8. EXAM MANAGEMENT

Implement complete CRUD.

Teacher can:

* Create exam
* View exam
* Edit exam
* Delete exam
* Duplicate exam
* Publish exam
* Close exam

Endpoints should follow RESTful conventions.

Example:

```text
GET    /api/exams
POST   /api/exams
GET    /api/exams/{id}
PATCH  /api/exams/{id}
DELETE /api/exams/{id}
POST   /api/exams/{id}/publish
POST   /api/exams/{id}/close
```

Only the owner/authorized teacher can modify exams.

---

# 9. EXAM CREATION

Teacher enters:

### Basic Information

* Exam title
* Description
* Instructions
* Duration

Duration presets:

* 10
* 20
* 30
* 45
* 60 minutes

Also support custom duration.

### Settings

* Ranking enabled/disabled
* Result visibility
* Review visibility
* Publish/close behavior

---

# 10. QUESTION BUILDER

Implement:

* Add question
* Edit question
* Delete question
* Duplicate question
* Reorder questions
* Set marks
* Preview question

Question types:

1. Multiple Choice
2. Ordering
3. Correct the Brackets

Use real database persistence.

Question order must be persisted.

---

# 11. MULTIPLE CHOICE

Teacher enters:

Question:

`Choose the correct answer.`

Options:

* A
* B
* C
* D

Teacher selects exactly one correct answer.

Allow:

* Add option
* Remove option
* Reorder options
* Set marks

Validate that a correct answer exists before publishing.

---

# 12. ORDERING QUESTION

Use the simple teacher workflow.

Teacher enters the correct sentence:

```text
Ahmed goes to school every day.
```

The system separates the sentence into tokens:

```text
Ahmed
goes
to
school
every
day
```

Teacher may edit/reorder the tokens before saving.

The teacher does NOT manually create the shuffled version.

When serving the question to a student:

The backend generates a shuffled order.

Example:

```text
school
day
Ahmed
to
every
goes
```

The original correct order must remain stored securely on the server.

---

# 13. ORDERING STUDENT EXPERIENCE

Use **Tap-to-Arrange** instead of requiring drag and drop.

Example:

Available words:

```text
school
day
Ahmed
to
every
goes
```

Answer area:

```text
[        ]
[        ]
[        ]
[        ]
[        ]
[        ]
```

When the student taps:

`Ahmed`

It goes into the first position.

Then:

`goes`

Then:

`to`

etc.

Provide:

* Undo
* Clear
* Next

Prevent selecting the same token twice.

The student should not type the sentence manually.

Optimize heavily for mobile touch interaction.

---

# 14. CORRECT THE BRACKETS

Teacher workflow:

Teacher enters:

```text
She (go) to school every day.
```

System detects:

```text
go
```

Teacher enters:

```text
goes
```

Teacher enters marks:

```text
1
```

Allow multiple accepted answers if necessary.

Example:

```text
goes
GOES
```

Normalize answers according to the question's comparison rules.

Student sees:

```text
Correct the word in brackets.

She (go) to school every day.

[ Type your answer... ]

[ Check Answer ]
```

After checking:

Correct:

`Correct`

Wrong:

`Incorrect`

IMPORTANT:

Never reveal the correct answer during the active exam.

---

# 15. UNIQUE EXAM LINKS

Every published exam receives a unique slug.

Example:

```text
/exam/english-grammar-82K4
```

The slug must be unique.

Student opening the URL must be taken directly to that exam.

Students must NOT browse all exams.

Do not expose teacher exam management APIs to students.

---

# 16. STUDENT START SCREEN

Show:

* Test Yourself
* Ms Eman Zahy
* Exam title
* Number of questions
* Duration
* Instructions
* Student name input
* Start Exam

Student name supports:

* Arabic
* English

No student account required.

Validate name before starting.

---

# 17. STARTING AN EXAM ATTEMPT

When the student presses Start:

The backend creates an attempt.

The backend calculates:

```text
started_at
deadline_at
```

The deadline is authoritative.

Example:

```text
started_at = server time
deadline_at = started_at + duration
```

Never trust the browser's clock.

Return only information the student is allowed to know.

Do not send correct answers.

---

# 18. ACTIVE EXAM

Student sees:

* Test Yourself
* Ms Eman Zahy
* Exam title
* Question X of Y
* Time Remaining
* Question
* Answer
* Previous
* Next
* Submit Exam
* Question navigator

Question navigator states:

* Current
* Answered
* Unanswered

---

# 19. SERVER-SIDE TIMER

This is mandatory.

The frontend countdown is only a visual representation.

The backend deadline is authoritative.

Every important attempt action must validate:

```text
current_server_time < deadline_at
```

When the deadline is reached:

Automatically finalize the attempt.

An expired attempt cannot resume.

Do not allow the student to manipulate the timer through browser JavaScript.

---

# 20. AUTO-SAVE

Student answers must be continuously saved.

Implement an endpoint similar to:

```text
PUT /api/attempts/{attempt_id}/answers/{question_id}
```

The backend validates:

* Attempt exists
* Attempt belongs to correct exam
* Attempt belongs to the student session
* Attempt is active
* Deadline has not expired
* Question belongs to the exam

Save answers to PostgreSQL.

Handle temporary network errors gracefully.

---

# 21. IMMEDIATE FEEDBACK

After answering each question:

Correct:

```text
Correct
```

Wrong:

```text
Incorrect
```

Never return the correct answer.

The student can continue.

IMPORTANT:

The frontend must never receive the correct answer in the question payload.

---

# 22. MANUAL SUBMISSION

Student presses:

**Submit Exam**

Show:

> Are you sure you want to submit your exam?

Buttons:

* Cancel
* Submit Exam

On confirmation:

Call backend submission endpoint.

The backend must:

1. Lock the attempt
2. Validate the attempt
3. Grade every answer
4. Calculate score
5. Calculate percentage
6. Calculate time used
7. Calculate ranking if enabled
8. Store final result
9. Prevent further modifications

---

# 23. AUTOMATIC SUBMISSION

At deadline:

Backend automatically finalizes the attempt.

If possible, the frontend detects the deadline and informs the user.

However, the backend remains authoritative.

A student must never be able to continue answering after the deadline.

---

# 24. GRADING ENGINE

All grading must happen server-side.

### Multiple Choice

Compare selected option against correct option.

### Ordering

Compare student's token sequence against correct token sequence.

### Correct Brackets

Normalize answer according to configured rules and compare against accepted answers.

Store:

* is_correct
* awarded_marks

Calculate:

```text
score
max_score
percentage
correct_count
incorrect_count
```

Never trust a score submitted by the browser.

---

# 25. ANSWER NORMALIZATION

For text answers, implement sensible normalization.

For example:

* Trim whitespace
* Normalize repeated spaces
* Case-insensitive comparison where configured

Do NOT blindly remove meaningful punctuation or characters.

The teacher should be able to define accepted answers when necessary.

---

# 26. RESULT PAGE

After submission show:

```text
17 / 20

85%
```

Also:

* Correct answers count
* Incorrect answers count
* Time used
* Rank if ranking is enabled

Do not reveal answers before submission is complete.

---

# 27. FINAL ANSWER REVIEW

After the attempt is completely submitted:

Show ALL questions.

For correct question:

```text
Your answer: goes
Correct
```

For wrong question:

```text
Your answer: go
Incorrect

Correct answer: goes
```

Every question must be included.

Correct answers must only be available after final submission.

---

# 28. LEADERBOARD

If enabled:

Show:

```text
Rank
Student
Score
Percentage
```

Example:

```text
1  Ahmed Mohamed   100%
2  Youssef Ali      95%
3  Omar Khaled      90%
```

Tie breaker:

Higher score first.

If equal score:

Lower completion time ranks higher.

Ranking must be calculated server-side.

Do not trust client-submitted time.

---

# 29. TEACHER RESULTS

Teacher can select an exam and view:

* Total students
* Completed attempts
* Average score
* Highest score
* Lowest score

Student table:

* Student name
* Score
* Percentage
* Time used
* Submission time
* Rank

Support:

* Search
* Sorting
* Filtering

---

# 30. INDIVIDUAL STUDENT ATTEMPT

Teacher can open an attempt.

Show:

* Student name
* Exam
* Score
* Percentage
* Start time
* Submission time
* Time used
* Rank
* Every question
* Submitted answer
* Correct/Incorrect
* Correct answer

Teacher is allowed to see correct answers.

---

# 31. STUDENT MANAGEMENT

Create a student management page.

Show:

* Student name
* Number of exams
* Average score
* Highest score
* Last exam

Support search in:

* Arabic
* English

Normalize search carefully without destroying the original displayed name.

---

# 32. ANTI-DUPLICATE SUBMISSION

The backend must guarantee that the same attempt cannot be submitted twice.

Use database transactions and appropriate constraints.

Submission endpoint must be idempotent where practical.

If two submission requests arrive simultaneously, only one finalization should occur.

---

# 33. ATTEMPT RESUME RULES

Pause/resume is NOT allowed.

An active attempt should not become a resumable exam after intentional exit.

If technically detectable, leaving the exam can finalize the attempt according to the platform rules.

If the browser closes without an exit event:

The server-side deadline remains authoritative.

Do not provide an unrestricted "Resume Exam" mechanism.

---

# 34. SECURITY

Implement:

* Password hashing
* Authentication
* Authorization
* Role checks
* Server-side grading
* Server-side timer
* Input validation
* SQL injection protection
* XSS-safe rendering
* CSRF protection where applicable
* Rate limiting for sensitive endpoints
* Secure cookies/token handling
* Database constraints
* Duplicate submission protection
* Server-side ownership checks

Never expose:

* Password hashes
* Teacher-only APIs
* Correct answers before final submission
* Internal security information

---

# 35. API SECURITY

Student APIs must only return student-safe data.

For example, a student question response may contain:

```json
{
  "question_id": "...",
  "type": "multiple_choice",
  "text": "...",
  "options": [...]
}
```

It must NOT contain:

```text
is_correct
correct_option_id
correct_answer
```

before submission.

---

# 36. RESPONSIVE DESIGN

The entire application must work on:

* Desktop
* Laptop
* Tablet
* Mobile

The student exam experience is the highest priority for mobile.

Optimize for:

* iPhone-sized screens
* Android phones
* Touch interaction
* Portrait orientation

Avoid:

* Tiny buttons
* Dense tables
* Horizontal scrolling
* Excessive nested cards
* unnecessary scrolling

---

# 37. TEACHER MOBILE UX

Teacher must also be able to manage exams from a phone.

Create mobile-friendly:

* Dashboard
* Exam list
* Create exam
* Question builder
* Results
* Students
* Settings

Question creation must remain easy on a small screen.

---

# 38. UI DESIGN

Visual identity:

Background:

White

Primary accent:

Baby Blue / Light Blue

Interactive elements:

Blue

Correct:

Soft green

Incorrect:

Soft red

Typography:

Clean and highly readable.

Use:

* Clear hierarchy
* Consistent spacing
* Simple cards
* Simple tables
* Accessible buttons
* Touch-friendly controls

Avoid:

* Heavy gradients
* Excessive animations
* Glassmorphism
* AI-style interfaces
* Excessive shadows
* Visual clutter

---

# 39. ACCESSIBILITY

Implement:

* Proper labels
* Keyboard navigation
* Visible focus states
* Good contrast
* Accessible buttons
* Accessible form errors
* Semantic HTML
* Touch-friendly controls

Do not rely on color alone to communicate correctness.

---

# 40. ERROR HANDLING

Implement real error states.

Examples:

* Invalid login
* Exam not found
* Exam closed
* Exam expired
* Network error
* Failed auto-save
* Unauthorized access
* Duplicate submission
* Invalid question
* Invalid exam configuration

Errors should be understandable to users.

Do not expose stack traces to users.

---

# 41. LOADING STATES

Implement proper:

* Loading indicators
* Skeletons where appropriate
* Disabled states
* Submission states

Prevent accidental double clicks.

Example:

When submitting:

`Submitting...`

Disable the submit button until the server responds.

---

# 42. EMPTY STATES

Create meaningful empty states.

Examples:

No exams:

> No exams created yet.

Button:

> Create Exam

No results:

> No completed attempts yet.

No students:

> No students have completed an exam yet.

---

# 43. DATA VALIDATION

Validate on both frontend and backend.

Examples:

Exam:

* Title required
* Duration valid
* At least one question
* Valid marks

Multiple choice:

* Question text required
* Minimum options
* Correct answer required

Ordering:

* At least two tokens

Correct Brackets:

* Valid bracket syntax
* Correct answer required

Never rely only on frontend validation.

---

# 44. EXAM PUBLISH VALIDATION

Do not allow publishing an invalid exam.

Before publishing validate:

* Title
* Duration
* At least one question
* All questions valid
* All marks valid
* Correct answers configured
* Question order valid

If validation fails, show exactly what needs to be fixed.

---

# 45. EXAM STATES

Implement:

### Draft

Teacher is preparing the exam.

Students cannot access it.

### Published

Exam has been released.

### Active

Students can submit attempts.

### Closed

New attempts are rejected.

The backend must enforce these states.

---

# 46. SHARE EXAM

After publishing:

Show:

**Exam Published**

Unique link:

```text
/exam/english-grammar-82K4
```

Buttons:

* Copy Link
* Share

Use the browser's native share API when available.

The teacher can send the link anywhere.

---

# 47. ROUTING

Implement clean routes.

Example:

```text
/login

/dashboard

/exams

/exams/new

/exams/:id

/exams/:id/edit

/exams/:id/results

/students

/students/:id

/settings

/exam/:slug

/exam/:slug/start

/attempt/:id

/attempt/:id/result

/attempt/:id/review

/attempt/:id/ranking
```

Protect teacher routes.

Student routes must validate the attempt.

---

# 48. PERFORMANCE

Optimize:

* API calls
* Database queries
* Question loading
* Auto-save
* Results queries
* Leaderboard queries

Avoid unnecessary re-renders.

Use indexes for frequently queried fields.

Do not reload the entire exam after every answer.

---

# 49. DATABASE CONSISTENCY

Use transactions where needed.

Especially for:

* Exam publishing
* Exam closing
* Attempt submission
* Automatic grading
* Ranking calculation

Prevent race conditions.

---

# 50. TESTING

Create automated tests.

At minimum:

### Backend tests

* Authentication
* Authorization
* Exam CRUD
* Question CRUD
* Ordering grading
* MCQ grading
* Correct brackets grading
* Timer expiration
* Auto-save
* Manual submission
* Duplicate submission
* Ranking
* Exam access rules

### Frontend tests

Test important flows:

* Teacher login
* Create exam
* Add question
* Publish exam
* Student opens link
* Student starts exam
* Student answers
* Student submits
* Result appears

---

# 51. END-TO-END TEST

Create a complete test scenario:

1. Login as teacher
2. Create exam
3. Add MCQ
4. Add Ordering question
5. Add Correct Brackets question
6. Set marks
7. Set duration
8. Publish exam
9. Open generated student link
10. Enter student name
11. Start exam
12. Answer all questions
13. Verify immediate Correct/Incorrect feedback
14. Submit
15. Verify server-side grading
16. Verify result
17. Verify final review
18. Verify leaderboard
19. Login as teacher
20. Verify student attempt appears in results

The complete flow must work without manually modifying the database.

---

# 52. SEED DATA

Create a development seed script.

Create:

Teacher:

```text
Ms Eman Zahy
```

Create a sample exam:

```text
English Grammar Test
```

Include:

* MCQ
* Ordering
* Correct the Brackets

Seed data is for development only.

Production credentials must come from environment variables.

---

# 53. ENVIRONMENT CONFIGURATION

Create:

`.env.example`

Include configuration for:

* Database URL
* JWT secret
* Refresh token secret
* CORS
* Environment
* Frontend URL
* Backend URL

Never hardcode secrets.

---

# 54. DATABASE MIGRATIONS

Use proper migrations.

The application must be able to initialize a fresh database using documented commands.

Do not require manually creating tables.

---

# 55. README

Create a complete README containing:

* Project overview
* Architecture
* Requirements
* Installation
* Environment variables
* Database setup
* Migrations
* Seed data
* Running frontend
* Running backend
* Running tests
* Production build
* Deployment instructions

---

# 56. DEPLOYMENT

Prepare the project for production deployment.

Frontend should be deployable to a modern frontend hosting platform.

Backend should be deployable to a production server/container.

PostgreSQL should be external/managed in production.

Document:

* Build command
* Start command
* Environment variables
* Database migration process

---

# 57. FINAL QUALITY REQUIREMENT

Before considering the project complete:

Review the entire application.

Check:

* No broken routes
* No dead buttons
* No fake data in production flows
* No missing APIs
* No console errors
* No TypeScript errors
* No obvious backend exceptions
* No database relationship errors
* No security leaks
* No correct answers exposed to active students
* No client-side-only grading
* No client-side-only timer enforcement
* No duplicate submissions
* No ability to edit submitted attempts
* No ability to resume expired attempts

---

# 58. IMPLEMENTATION ORDER

Do not attempt to create everything as disconnected screens.

Build in this order:

### Phase 1

Project architecture

### Phase 2

Database + migrations

### Phase 3

Authentication

### Phase 4

Teacher dashboard

### Phase 5

Exam CRUD

### Phase 6

Question builder

### Phase 7

Student exam access

### Phase 8

Attempt/session engine

### Phase 9

Auto-save

### Phase 10

Server-side grading

### Phase 11

Results

### Phase 12

Leaderboard

### Phase 13

Student management

### Phase 14

Security hardening

### Phase 15

Responsive/mobile optimization

### Phase 16

Automated tests

### Phase 17

Production verification

---

# 59. IMPORTANT DEVELOPMENT RULE

After completing each phase:

1. Run the application.
2. Test the implemented functionality.
3. Fix errors.
4. Continue to the next phase.

Do not build the entire project blindly and only test at the end.

---

# 60. FINAL PRODUCT EXPERIENCE

The final application should feel like:

**A real professional online examination platform for Ms Eman Zahy.**

Not:

* A template
* A prototype
* A marketing website
* An AI dashboard
* A static design

The final user experience must be:

**Simple enough for a teacher to create an exam from a phone.**

**Simple enough for a student to complete an exam entirely from a phone.**

**Secure enough that students cannot manipulate answers, scores, or time.**

**Reliable enough that answers survive temporary connection problems.**

**Clear enough that neither teacher nor student needs instructions to understand the interface.**

---

# DEFINITION OF DONE

The project is complete only when:

Teacher can:

`Login → Create Exam → Add Questions → Configure → Publish → Copy Link → Receive Attempts → View Results → View Ranking`

Student can:

`Open Link → Enter Name → Start → Answer → Receive Correct/Incorrect → Submit/Auto-submit → Receive Result → View Ranking → Review All Answers`

And all data is persisted in the real database, all grading is performed server-side, the exam deadline is enforced server-side, and the complete application works responsively on desktop and mobile.

Build the complete application.
Do not stop at the UI.
Do not create a landing page.
Do not use fake functionality.
Implement the actual working product.
