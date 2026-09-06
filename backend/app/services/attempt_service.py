"""Exam attempt service.

Owns the authoritative server-side timer, autosave, submission and grading.
The backend decides deadlines, whether an attempt may continue, and every score.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from ..core import security
from ..core.config import get_settings
from ..core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from ..core.timeutil import ensure_utc, iso_utc_z
from ..models.base import utcnow
from ..models import Answer, Exam, ExamAttempt, Question
from ..repositories import attempt_repo, exam_repo, question_repo, student_repo
from ..services.question_service import correct_answer_payload
from ..schemas.attempt import (
    ReviewAnswerItem,
    ReviewResponse,
    StartAttemptResponse,
    SubmittedAttemptOut,
)
from ..services.grading_service import grade_question
from ..services.question_service import student_payload
from ..services.ranking_service import RankingService
from ..services.snapshot import SnapshotQuestion, build_snapshot
from ..services.snapshot import find as snapshot_find
from ..services.snapshot import hydrate as snapshot_hydrate
from ..services.student_service import find_or_create


def _aware(dt):
    """SQLite returns naive datetimes; Postgres returns aware. Normalize to UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        import datetime as _dt

        return dt.replace(tzinfo=_dt.timezone.utc)
    return dt


class AttemptService:
    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------------ start
    def public_exam(self, slug: str) -> dict:
        exam = exam_repo.get_by_slug(self.db, slug)
        if not exam:
            raise NotFoundError("Exam not found.")
        if exam.status not in {"published", "active"}:
            raise ConflictError("This exam is not currently open.")
        questions = question_repo.get_for_exam(self.db, exam.id)
        return {
            "id": exam.id,
            "slug": exam.slug,
            "title": exam.title,
            "description": exam.description,
            "instructions": exam.instructions,
            "duration_minutes": exam.duration_minutes,
            "status": exam.status,
            "ranking_enabled": exam.ranking_enabled,
            "result_visibility": exam.result_visibility,
            "review_visibility": exam.review_visibility,
            "question_count": len(questions),
            "max_score": sum(q.marks for q in questions),
        }

    def start(self, slug: str, student_name: str) -> StartAttemptResponse:
        exam = exam_repo.get_by_slug(self.db, slug)
        if not exam:
            raise NotFoundError("Exam not found.")
        if exam.status not in {"published", "active"}:
            raise ConflictError("This exam is not currently open.")

        student = find_or_create(self.db, student_name)
        # A student may attempt a given exam only once.
        from ..repositories import exam_repo as _er

        existing = _er.attempts_for_exam(self.db, exam.id)
        mine = [a for a in existing if a.student_id == student.id]
        if mine:
            active = next((a for a in mine if a.status == "active"), None)
            if active:
                deadline = _aware(active.deadline_at)
                if deadline and deadline > utcnow():
                    raise ConflictError(
                        "You already have an active attempt for this exam.",
                    )
            raise ConflictError("You have already attempted this exam.")

        started = utcnow()
        deadline = started + timedelta(minutes=exam.duration_minutes)
        # Freeze the exam version this student is taking: the full visible
        # question set (incl. correct answers for grading) is snapshotted
        # onto the attempt. Later teacher edits never touch this attempt.
        questions = question_repo.get_for_exam(self.db, exam.id)
        attempt = attempt_repo.create(
            self.db,
            exam_id=exam.id,
            student_id=student.id,
            started_at=started,
            deadline_at=deadline,
            questions_snapshot=build_snapshot(questions),
        )
        token = self._issue_student_token(attempt.id)
        self.db.commit()

        payload = [
            student_payload(q) for q in questions
        ]
        duration_seconds = exam.duration_minutes * 60
        return StartAttemptResponse(
            attempt_id=attempt.id,
            exam_id=exam.id,
            exam_slug=exam.slug,
            status=attempt.status,
            started_at=started,
            # Canonical UTC "Z" string (mobile-engine-safe, see iso_utc_z) and
            # the server-computed remaining time so phones never need to
            # guess the deadline from a locale/engine-dependent date parse.
            deadline_at=iso_utc_z(deadline) or "",
            remaining_seconds=duration_seconds,
            duration_seconds=duration_seconds,
            student_token=token,
            questions=payload,
        )

    # ------------------------------------------------------ student context
    def _issue_student_token(self, attempt_id: str) -> str:
        settings = get_settings()
        now = utcnow()
        import jwt as _jwt

        payload = {
            "sub": attempt_id,
            "type": "student_attempt",
            "iat": now,
            "exp": now + timedelta(days=30),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
        }
        return _jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)

    @staticmethod
    def decode_student_token(token: str) -> str:
        """Returns the attempt_id a valid student token authorises."""
        settings = get_settings()
        import jwt as _jwt

        try:
            payload = _jwt.decode(
                token,
                settings.secret_key,
                algorithms=[settings.jwt_algorithm],
                audience=settings.jwt_audience,
                issuer=settings.jwt_issuer,
            )
        except _jwt.PyJWTError as exc:
            raise AuthenticationError("Invalid attempt session.") from exc
        if payload.get("type") != "student_attempt":
            raise AuthenticationError("Invalid attempt session.")
        return payload["sub"]

    # ----------------------------------------------------- exam versioning
    def attempt_questions(self, attempt: ExamAttempt) -> list[SnapshotQuestion]:
        """The FROZEN question set of an attempt — never the live exam.

        Display, validation, grading and review all go through this, so an
        attempt keeps exactly the exam version the student started with,
        even if the teacher edits, reorders or deletes questions later.
        """
        return snapshot_hydrate(attempt, question_repo.get_for_exam(self.db, attempt.exam_id))

    # ------------------------------------------------------------ reconcile
    def reconcile(self, attempt: ExamAttempt) -> ExamAttempt:
        """If an active attempt has crossed its deadline, auto-submit it."""
        if attempt.status != "active":
            return attempt
        now = utcnow()
        deadline = _aware(attempt.deadline_at)
        if deadline and now >= deadline:
            self._finalize(attempt, submitted_at=deadline, status="expired")
            self.db.commit()
        return attempt

    def get_owned(self, attempt_id: str, student_token: str) -> ExamAttempt:
        authed_attempt_id = self.decode_student_token(student_token)
        if authed_attempt_id != attempt_id:
            raise AuthorizationError("Not authorized for this attempt.")
        attempt = attempt_repo.get_attempt(self.db, attempt_id)
        if not attempt:
            raise NotFoundError("Attempt not found.")
        return self.reconcile(attempt)

    def status_out(self, attempt: ExamAttempt) -> dict:
        now = utcnow()
        deadline = _aware(attempt.deadline_at)
        can_resume = (
            attempt.status == "active" and (deadline is not None and deadline > now)
        )
        # Server-authoritative remaining seconds at response time; the client
        # seeds its countdown from this and only re-derives from the deadline
        # string (canonical UTC "Z") to stay correct across tab-suspends.
        remaining = (
            max(0, int((deadline - now).total_seconds()))
            if attempt.status == "active" and deadline is not None
            else 0
        )
        return {
            "id": attempt.id,
            "exam_id": attempt.exam_id,
            "status": attempt.status,
            "started_at": attempt.started_at,
            "deadline_at": iso_utc_z(attempt.deadline_at),
            "remaining_seconds": remaining,
            "submitted_at": attempt.submitted_at,
            "can_resume": can_resume,
            "student_name": attempt.student.name if attempt.student else None,
            "exam_title": attempt.exam.title if attempt.exam else None,
        }

    # ------------------------------------------------------------ autosave
    def save_answer(
        self, attempt_id: str, question_id: str, student_token: str, answer_data: dict
    ) -> dict:
        attempt = self.get_owned(attempt_id, student_token)
        if attempt.status != "active":
            raise ConflictError("This attempt has already been submitted or expired.")
        now = utcnow()
        deadline = _aware(attempt.deadline_at)
        if deadline is None or now >= deadline:
            self._finalize(attempt, submitted_at=deadline or now, status="expired")
            self.db.commit()
            raise ConflictError("Time is up — the attempt was auto-submitted.")

        # Validate + grade against the attempt's FROZEN version: a question
        # must be part of the snapshot the student started with. (The live
        # table may have moved on — edits must never affect this attempt.)
        question = snapshot_find(self.attempt_questions(attempt), question_id)
        if not question:
            raise NotFoundError("Question does not belong to this exam.")

        # Strict one-shot lock: an answer is graded and stored the first time it
        # is submitted (is_correct becomes non-null). Any further submission for
        # the same question is rejected so a graded answer can never be changed.
        existing = attempt_repo.get_answer(self.db, attempt.id, question_id)
        if existing is not None and existing.is_correct is not None:
            raise ConflictError(
                "This answer has already been submitted and is locked."
            )

        validated = self._validate_answer_data(question, answer_data)
        answer = attempt_repo.save_answer(
            self.db,
            attempt_id=attempt.id,
            question_id=question_id,
            answer_data=validated,
            answered_at=now,
        )
        # Server-graded immediate feedback: Correct/Incorrect verdict plus —
        # for an INCORRECT submission — the correct answer the grading relied
        # on (same payload builder the post-submission review uses). Nothing
        # here is ever sent before the student submits.
        outcome = grade_question(question, validated)
        answer.is_correct = outcome.is_correct
        answer.awarded_marks = outcome.awarded_marks
        self.db.flush()
        self.db.commit()
        return {
            "id": answer.id,
            "attempt_id": answer.attempt_id,
            "question_id": answer.question_id,
            "answer_data": answer.answer_data,
            "is_correct": answer.is_correct,
            "correct_answer": (
                None if outcome.is_correct else correct_answer_payload(question)
            ),
            "answered_at": answer.answered_at,
            "updated_at": answer.updated_at,
        }

    def _validate_answer_data(self, question: Question, answer_data: dict) -> dict:
        """Basic structural validation without grading (client sends their pick)."""
        atype = answer_data.get("type")
        if question.type == "multiple_choice":
            if atype != "multiple_choice":
                raise ValidationError("Invalid answer payload.")
            selected = answer_data.get("selected_option_id")
            option_ids = {o.get("id") for o in (question.data or {}).get("options", [])}
            if selected not in option_ids:
                raise ValidationError("Selected option is not valid for this question.")
            return {"type": "multiple_choice", "selected_option_id": selected}

        if question.type == "ordering":
            if atype != "ordering":
                raise ValidationError("Invalid answer payload.")
            token_ids = list(answer_data.get("token_ids") or [])
            valid_ids = {o.get("id") for o in (question.data or {}).get("tokens", [])}
            if not all(t in valid_ids for t in token_ids) or len(token_ids) != len(set(token_ids)):
                raise ValidationError("Ordering token sequence is invalid.")
            if len(token_ids) != len(valid_ids):
                raise ValidationError("Ordering must include every token exactly once.")
            return {"type": "ordering", "token_ids": token_ids}

        if question.type == "correct_brackets":
            if atype != "correct_brackets":
                raise ValidationError("Invalid answer payload.")
            answer = answer_data.get("answer")
            brackets = (question.data or {}).get("brackets", [])
            if len(brackets) == 1:
                if not isinstance(answer, str):
                    raise ValidationError("Provide an answer for the bracketed word.")
                return {"type": "correct_brackets", "answer": answer}
            if not isinstance(answer, list) or len(answer) != len(brackets):
                raise ValidationError("Provide an answer for each bracketed word.")
            return {"type": "correct_brackets", "answer": answer}

        raise ValidationError("Unsupported question type.")

    # ------------------------------------------------------------ submission
    def submit(self, attempt_id: str, student_token: str) -> dict:
        attempt = self.get_owned(attempt_id, student_token)
        if attempt.status != "active":
            raise ConflictError("This attempt was already submitted.")
        self._finalize(attempt, submitted_at=utcnow(), status="submitted")
        self.db.commit()
        return {"attempt_id": attempt.id, "status": attempt.status}

    def _finalize(self, attempt: ExamAttempt, *, submitted_at, status: str) -> None:
        """Grade all answers and store authoritative totals + ranking.

        Grading runs against the attempt's frozen snapshot, so results are
        immune to any teacher edits made after the student started.
        """
        questions = self.attempt_questions(attempt)
        answers = attempt_repo.list_answers(self.db, attempt.id)
        answer_by_q = {a.question_id: a for a in answers}

        total_score = 0.0
        max_score = 0.0
        correct_count = 0
        incorrect_count = 0
        unanswered = 0

        for q in questions:
            max_score += q.marks
            ans = answer_by_q.get(q.id)
            if ans is None or not ans.answer_data:
                unanswered += 1
                continue
            outcome = grade_question(q, ans.answer_data)
            ans.is_correct = outcome.is_correct
            ans.awarded_marks = outcome.awarded_marks
            if outcome.is_correct:
                correct_count += 1
            else:
                incorrect_count += 1
            total_score += outcome.awarded_marks
        # grade in python
        started = _aware(attempt.started_at)
        sub_aware = _aware(submitted_at)
        time_used = max(0, int((sub_aware - started).total_seconds())) if started and sub_aware else 0

        self.db.flush()  # persist answer grades
        attempt.status = status
        attempt.submitted_at = sub_aware
        attempt.score = round(total_score, 2)
        attempt.max_score = round(max_score, 2)
        attempt.percentage = round((total_score / max_score * 100), 2) if max_score else 0
        attempt.time_used_seconds = time_used
        self._recompute_ranks(attempt.exam_id)
        self.db.flush()

    def _recompute_ranks(self, exam_id: str) -> None:
        """Keep the legacy stored rank aligned with the dynamic ranking rule."""
        attempts = [
            a
            for a in exam_repo.attempts_for_exam(self.db, exam_id)
            if a.status in {"submitted", "expired"} and a.submitted_at is not None
        ]
        for attempt in attempts:
            attempt.rank = None

        # The application currently prevents repeat attempts, but imported or
        # legacy data may contain them. Keep only each student's best score.
        best_by_student: dict[str, ExamAttempt] = {}
        for attempt in attempts:
            submitted = ensure_utc(attempt.submitted_at)
            key = (-attempt.score, submitted, attempt.id)
            current = best_by_student.get(attempt.student_id)
            if current is None:
                best_by_student[attempt.student_id] = attempt
                continue
            current_key = (
                -current.score,
                ensure_utc(current.submitted_at),
                current.id,
            )
            if key < current_key:
                best_by_student[attempt.student_id] = attempt

        ranked = sorted(
            best_by_student.values(),
            key=lambda attempt: (
                -attempt.score,
                ensure_utc(attempt.submitted_at),
                attempt.student_id,
                attempt.id,
            ),
        )
        for rank, attempt in enumerate(ranked, start=1):
            attempt.rank = rank
        self.db.flush()

    # ------------------------------------------------------------ results
    def submitted_out(self, attempt: ExamAttempt, include_name: bool = True) -> dict:
        questions = self.attempt_questions(attempt)
        answers = attempt_repo.list_answers(self.db, attempt.id)
        answer_by_q = {a.question_id: a for a in answers}
        correct = 0
        incorrect = 0
        unanswered = 0
        for q in questions:
            ans = answer_by_q.get(q.id)
            if ans is None:
                unanswered += 1
            elif ans.is_correct:
                correct += 1
            else:
                incorrect += 1
        exam = attempt.exam
        return {
            "id": attempt.id,
            "exam_id": attempt.exam_id,
            "exam_title": exam.title if exam else "",
            "exam_slug": exam.slug if exam else "",
            "ranking_enabled": bool(exam and exam.ranking_enabled),
            "result_visibility": bool(exam and exam.result_visibility),
            "review_visibility": bool(exam and exam.review_visibility),
            "student_id": attempt.student_id,
            "student_name": (attempt.student.name if attempt.student else "") if include_name else "",
            "status": attempt.status,
            "started_at": attempt.started_at,
            "deadline_at": attempt.deadline_at,
            "submitted_at": attempt.submitted_at,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "percentage": attempt.percentage,
            "correct_count": correct,
            "incorrect_count": incorrect,
            "unanswered_count": unanswered,
            "time_used_seconds": attempt.time_used_seconds,
            "rank": attempt.rank,
        }

    def get_result(self, attempt_id: str, student_token: str) -> dict:
        attempt = self.get_owned(attempt_id, student_token)
        if attempt.status == "active":
            raise ConflictError("Submit the attempt before viewing results.")
        result = self.submitted_out(attempt)
        if attempt.exam and attempt.exam.ranking_enabled:
            rank, total = RankingService(self.db).student_position(
                attempt.exam_id, attempt.student_id
            )
            result["rank"] = rank
            result["ranking_total"] = total
        else:
            result["ranking_total"] = None
        return result

    def get_review(self, attempt_id: str, student_token: str) -> dict:
        attempt = self.get_owned(attempt_id, student_token)
        if attempt.status == "active":
            raise ConflictError("Submit the attempt before reviewing answers.")
        review_visibility = attempt.exam.review_visibility if attempt.exam else False
        if not review_visibility:
            raise AuthorizationError("Answer review is disabled for this exam.")
        return self._review_payload(attempt)

    def _review_payload(self, attempt: ExamAttempt) -> dict:
        from ..services.question_service import correct_answer_payload

        # Review reflects the version the student actually took.
        questions = self.attempt_questions(attempt)
        answers = attempt_repo.list_answers(self.db, attempt.id)
        answer_by_q = {a.question_id: a for a in answers}
        items = []
        for q in questions:
            ans = answer_by_q.get(q.id)
            items.append(
                ReviewAnswerItem(
                    question_id=q.id,
                    question_type=q.type,
                    text=q.text,
                    order_index=q.order_index,
                    marks=q.marks,
                    student_answer=ans.answer_data if ans and ans.answer_data else None,
                    correct_answer=correct_answer_payload(q),
                    is_correct=(ans.is_correct if ans else False),
                    awarded_marks=(ans.awarded_marks if ans else 0),
                )
            )
        exam = attempt.exam
        return {
            "attempt_id": attempt.id,
            "exam_id": attempt.exam_id,
            "exam_title": exam.title if exam else "",
            "ranking_enabled": bool(exam and exam.ranking_enabled),
            "result_visibility": bool(exam and exam.result_visibility),
            "student_name": attempt.student.name if attempt.student else "",
            "score": attempt.score,
            "max_score": attempt.max_score,
            "percentage": attempt.percentage,
            "submitted_at": attempt.submitted_at,
            "items": [it.model_dump(mode="json") for it in items],
        }

    # ------------------------------------------------------------ ranking
    def ranking(self, exam_id: str, teacher_id: str | None = None) -> dict:
        """Compatibility facade for the existing student ranking endpoint."""
        return RankingService(self.db).exam_ranking(
            exam_id, teacher_id=teacher_id
        )
