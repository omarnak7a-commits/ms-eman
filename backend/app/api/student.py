"""Public student-facing endpoints.

Accessing and modifying an attempt is authorised by an opaque attempt token
issued when the attempt starts — a student can only ever read/change their own
attempt and only while it is active and within its server deadline.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..core.exceptions import AuthenticationError, ConflictError, NotFoundError, AuthorizationError
from ..db.session import get_db
from ..repositories import attempt_repo, question_repo, exam_repo
from ..schemas.attempt import (
    AnswerOut,
    AnswerUpsert,
    RankingResponse,
    StartAttemptRequest,
    StartAttemptResponse,
)
from ..services.attempt_service import AttemptService
from ..services.question_service import student_payload as _student_payload

router = APIRouter(prefix="/api", tags=["student"])
_bearer = HTTPBearer(auto_error=False)


def _student_token(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if credentials is None or not credentials.credentials:
        raise AuthenticationError("Authentication required.")
    return credentials.credentials


@router.get("/exams/{slug}/info")
def public_exam_info(slug: str, db: Session = Depends(get_db)):
    return AttemptService(db).public_exam(slug)


@router.post("/exams/{slug}/start", response_model=StartAttemptResponse)
def start_attempt(slug: str, payload: StartAttemptRequest, db: Session = Depends(get_db)):
    return AttemptService(db).start(slug, payload.student_name)


@router.get("/attempts/{attempt_id}")
def attempt_status(attempt_id: str, db: Session = Depends(get_db), token: str = Depends(_student_token)):
    svc = AttemptService(db)
    attempt = svc.get_owned(attempt_id, token)
    return svc.status_out(attempt)


@router.get("/attempts/{attempt_id}/resume")
def resume_attempt(attempt_id: str, db: Session = Depends(get_db), token: str = Depends(_student_token)):
    svc = AttemptService(db)
    attempt = svc.get_owned(attempt_id, token)
    status = svc.status_out(attempt)
    if not status["can_resume"]:
        return {"status": status, "can_resume": False}
    questions = [_student_payload(q) for q in question_repo.get_for_exam(db, attempt.exam_id)]
    answers = attempt_repo.list_answers(db, attempt.id)
    return {
        "status": status,
        "can_resume": True,
        "questions": questions,
        "answers": [{"question_id": a.question_id, "answer_data": a.answer_data} for a in answers],
    }


@router.put("/attempts/{attempt_id}/answers/{question_id}", response_model=AnswerOut)
def save_answer(
    attempt_id: str,
    question_id: str,
    payload: AnswerUpsert,
    db: Session = Depends(get_db),
    token: str = Depends(_student_token),
):
    return AttemptService(db).save_answer(attempt_id, question_id, token, payload.answer_data)


@router.post("/attempts/{attempt_id}/submit")
def submit_attempt(attempt_id: str, db: Session = Depends(get_db), token: str = Depends(_student_token)):
    return AttemptService(db).submit(attempt_id, token)


@router.get("/attempts/{attempt_id}/result")
def attempt_result(attempt_id: str, db: Session = Depends(get_db), token: str = Depends(_student_token)):
    return {"attempt": AttemptService(db).get_result(attempt_id, token)}


@router.get("/attempts/{attempt_id}/review")
def attempt_review(attempt_id: str, db: Session = Depends(get_db), token: str = Depends(_student_token)):
    return AttemptService(db).get_review(attempt_id, token)


@router.get("/attempts/{attempt_id}/ranking", response_model=RankingResponse)
def attempt_ranking(attempt_id: str, db: Session = Depends(get_db), token: str = Depends(_student_token)):
    svc = AttemptService(db)
    attempt = svc.get_owned(attempt_id, token)
    if attempt.status == "active":
        raise ConflictError("Submit the attempt before viewing the ranking.")
    return svc.ranking(attempt.exam_id)
