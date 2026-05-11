from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.topup import TopUp

router = APIRouter(prefix="/topups")


@router.post("/")
def create_topup(
    payload: dict,
    db: Session = Depends(get_db)
):

    topup = TopUp(**payload)

    db.add(topup)
    db.commit()

    return {
        "message": "Topup added"
    }