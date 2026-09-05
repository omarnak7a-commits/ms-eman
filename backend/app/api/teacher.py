"""Teacher-only endpoints: exams, questions, results and students.

Every route in this router requires a valid teacher access token.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from ..core.deps import get_current_teacher
from ..core.exceptions import AuthorizationError, NotFoundError
from ..db.session import get_db
from ..models import Question, Teacher
from ..repositories import exam_repo, question_repo
from ..schemas.attempt import (
    AttemptAnswerDetail,
    AttemptDetailTeacher,
    AttemptResultItem,
    ExamResultsResponse,
    OverallRankingResponse,
    RankingResponse,
)
from ..schemas.common import Message
from ..schemas.exam import ExamCreate, ExamOut, ExamUpdate
from ..schemas.question import (
    QuestionCreate,
    QuestionOut,
    QuestionReorderRequest,
    QuestionUpdate,
)
from ..schemas.student import StudentListItem, StudentOut
from ..schemas.dashboard import DashboardSummary, ExamRow
from ..services.attempt_service import AttemptService
from ..services.exam_service import ExamService, require_owned_exam
from ..services.question_service import teacher_payload, validate_data
from ..services.ranking_service import RankingService
from ..services.student_service import StudentService

router = APIRouter(dependencies=[Depends(get_current_teacher)], tags=["teacher"])


def _q_out(q: Question) -> dict:
    return teacher_payload(q)


# ---------------------------------------------------------------- exams
@router.get("/exams", response_model=list[ExamOut])
def list_exams(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    svc = ExamService(db)
    return svc.list(teacher.id)


@router.get("/dashboard", response_model=DashboardSummary)
def dashboard(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    exams = exam_repo.list_for_teacher(db, teacher.id)
    rows: list[ExamRow] = []
    all_attempts = []
    for e in exams:
        attempts = exam_repo.attempts_for_exam(db, e.id)
        all_attempts.extend(attempts)
        finished = [a for a in attempts if a.status in {"submitted", "expired"}]
        avg = round(sum(a.percentage for a in finished) / len(finished), 2) if finished else 0
        row = ExamRow.model_validate(e)
        row.question_count = exam_repo.question_count(db, e.id)
        row.attempt_count = len(attempts)
        row.completed_count = len(finished)
        row.average_percentage = avg
        rows.append(row)
    rows.sort(key=lambda r: r.created_at, reverse=True)
    finished = [a for a in all_attempts if a.status in {"submitted", "expired"}]
    avg_all = round(sum(a.percentage for a in finished) / len(finished), 2) if finished else 0
    return DashboardSummary(
        total_exams=len(exams),
        total_students=len({a.student_id for a in finished}),
        total_attempts=len(all_attempts),
        completed_attempts=len(finished),
        average_score=avg_all,
        recent_exams=rows[:5],
    )


@router.post("/exams", response_model=ExamOut, status_code=201)
def create_exam(payload: ExamCreate, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    svc = ExamService(db)
    return svc.create(teacher.id, payload)


@router.get("/exams/{exam_id}", response_model=ExamOut)
def get_exam(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    svc = ExamService(db)
    return svc.get(exam_id, teacher.id)


@router.put("/exams/{exam_id}", response_model=ExamOut)
def update_exam(exam_id: str, payload: ExamUpdate, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    svc = ExamService(db)
    return svc.update(exam_id, teacher.id, payload)


@router.delete("/exams/{exam_id}", status_code=204)
def delete_exam(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    svc = ExamService(db)
    svc.delete(exam_id, teacher.id)
    return Response(status_code=204)


@router.post("/exams/{exam_id}/publish", response_model=ExamOut)
def publish_exam(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return ExamService(db).publish(exam_id, teacher.id)


@router.post("/exams/{exam_id}/activate", response_model=ExamOut)
def activate_exam(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return ExamService(db).activate(exam_id, teacher.id)


@router.post("/exams/{exam_id}/close", response_model=ExamOut)
def close_exam(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return ExamService(db).close(exam_id, teacher.id)


@router.post("/exams/{exam_id}/duplicate", response_model=ExamOut, status_code=201)
def duplicate_exam(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return ExamService(db).duplicate(exam_id, teacher.id)


# ---------------------------------------------------------------- questions
@router.get("/exams/{exam_id}/questions", response_model=list[QuestionOut])
def list_questions(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    require_owned_exam(db, exam_id, teacher.id)
    return [teacher_payload(q) for q in question_repo.get_for_exam(db, exam_id)]


@router.post("/exams/{exam_id}/questions", response_model=QuestionOut, status_code=201)
def create_question(exam_id: str, payload: QuestionCreate, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    require_owned_exam(db, exam_id, teacher.id)
    data = validate_data(payload.type, payload.data or {})
    order_index = payload.order_index if payload.order_index is not None else question_repo.next_order_index(db, exam_id)
    q = question_repo.create(
        db,
        exam_id=exam_id,
        type=payload.type,
        text=payload.text.strip(),
        marks=payload.marks,
        order_index=order_index,
        data=data,
    )
    db.commit()
    return teacher_payload(q)


def _get_owned_question(db: Session, question_id: str, teacher: Teacher) -> Question:
    q = question_repo.get_by_id(db, question_id)
    if not q:
        raise NotFoundError("Question not found.")
    require_owned_exam(db, q.exam_id, teacher.id)
    return q


@router.put("/questions/{question_id}", response_model=QuestionOut)
def update_question(question_id: str, payload: QuestionUpdate, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    q = _get_owned_question(db, question_id, teacher)
    if payload.text is not None:
        q.text = payload.text.strip() or q.text
    if payload.marks is not None:
        q.marks = payload.marks
    if payload.order_index is not None:
        q.order_index = payload.order_index
    if payload.data is not None:
        q.data = validate_data(q.type, payload.data)
    db.flush()
    db.commit()
    return teacher_payload(q)


@router.delete("/questions/{question_id}", status_code=204)
def delete_question(question_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    q = _get_owned_question(db, question_id, teacher)
    question_repo.delete(db, q)
    db.commit()
    return Response(status_code=204)


@router.put("/exams/{exam_id}/questions/reorder", response_model=Message)
def reorder_questions(exam_id: str, payload: QuestionReorderRequest, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    require_owned_exam(db, exam_id, teacher.id)
    existing = {q.id for q in question_repo.get_for_exam(db, exam_id)}
    if set(payload.ordered_ids) != existing:
        from ..core.exceptions import ValidationError

        raise ValidationError("Reorder list must contain every question exactly once.")
    question_repo.reindex(db, exam_id, payload.ordered_ids)
    db.commit()
    return Message(message="Questions reordered.")


# ---------------------------------------------------------------- results
def _expire_active(db: Session, exam_id: str) -> None:
    svc = AttemptService(db)
    for a in exam_repo.attempts_for_exam(db, exam_id):
        if a.status == "active":
            svc.reconcile(a)
    db.commit()


@router.get("/exams/{exam_id}/results", response_model=ExamResultsResponse)
def exam_results(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    exam = require_owned_exam(db, exam_id, teacher.id)
    _expire_active(db, exam_id)
    attempts = exam_repo.attempts_for_exam(db, exam_id)
    svc = AttemptService(db)
    finished = [a for a in attempts if a.status in {"submitted", "expired"}]
    total = len(finished)
    avg_pct = round(sum(a.percentage for a in finished) / total, 2) if total else 0
    avg_score = round(sum(a.score for a in finished) / total, 2) if total else 0
    summary = {
        "total_attempts": len(attempts),
        "completed_attempts": total,
        "average_score": avg_score,
        "average_percentage": avg_pct,
        "highest_score": max((a.score for a in finished), default=0),
        "lowest_score": min((a.score for a in finished), default=0),
        "highest_percentage": max((a.percentage for a in finished), default=0),
        "lowest_percentage": min((a.percentage for a in finished), default=0),
    }
    items = [
        AttemptResultItem(
            attempt_id=a.id,
            student_id=a.student_id,
            student_name=a.student.name if a.student else "",
            status=a.status,
            started_at=a.started_at,
            submitted_at=a.submitted_at,
            score=a.score,
            max_score=a.max_score,
            percentage=a.percentage,
            correct_count=svc.submitted_out(a)["correct_count"],
            incorrect_count=svc.submitted_out(a)["incorrect_count"],
            unanswered_count=svc.submitted_out(a)["unanswered_count"],
            time_used_seconds=a.time_used_seconds,
            rank=a.rank,
        )
        for a in attempts
    ]
    return ExamResultsResponse(exam_id=exam.id, exam_title=exam.title, summary=summary, attempts=items)


@router.get("/exams/{exam_id}/results/{attempt_id}", response_model=AttemptDetailTeacher)
def attempt_detail(exam_id: str, attempt_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    exam = require_owned_exam(db, exam_id, teacher.id)
    attempt = exam_repo.attempts_for_exam(db, exam_id)
    found = next((a for a in attempt if a.id == attempt_id), None)
    if not found:
        raise NotFoundError("Attempt not found in this exam.")
    svc = AttemptService(db)
    base = svc.submitted_out(found)
    review = svc._review_payload(found)
    return AttemptDetailTeacher(
        attempt_id=found.id,
        student_id=found.student_id,
        student_name=found.student.name if found.student else "",
        status=found.status,
        started_at=found.started_at,
        deadline_at=found.deadline_at,
        submitted_at=found.submitted_at,
        score=found.score,
        max_score=found.max_score,
        percentage=found.percentage,
        correct_count=base["correct_count"],
        incorrect_count=base["incorrect_count"],
        unanswered_count=base["unanswered_count"],
        time_used_seconds=found.time_used_seconds,
        rank=found.rank,
        answers=[AttemptAnswerDetail(**it) for it in review["items"]],
    )


@router.get("/exams/{exam_id}/ranking", response_model=RankingResponse)
def exam_ranking(exam_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return RankingService(db).exam_ranking(exam_id, teacher_id=teacher.id)


@router.get("/rankings", response_model=OverallRankingResponse)
def overall_ranking(db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return RankingService(db).overall_ranking(teacher.id)


# ---------------------------------------------------------------- students
@router.get("/students", response_model=list[StudentListItem])
def list_students(q: str | None = Query(default=None), db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    return StudentService(db).list(teacher.id, q)


@router.get("/students/{student_id}", response_model=StudentOut)
def get_student(student_id: str, db: Session = Depends(get_db), teacher: Teacher = Depends(get_current_teacher)):
    from ..repositories.student_repo import get_by_id

    s = get_by_id(db, student_id)
    if not s:
        raise NotFoundError("Student not found.")
    return StudentOut.model_validate(s)
