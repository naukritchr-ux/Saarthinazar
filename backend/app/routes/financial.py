from fastapi import APIRouter

router = APIRouter(prefix="/financial")


@router.get("/overview")
def financial_overview():

    return {
        "revenue": 480000,
        "profit": 142000
    }