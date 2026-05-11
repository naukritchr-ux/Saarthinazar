from fastapi import APIRouter

router = APIRouter(prefix="/reports")


@router.get("/")
def reports():

    return {
        "message": "Reports API"
    }