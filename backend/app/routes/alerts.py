from fastapi import APIRouter

router = APIRouter(prefix="/alerts")


@router.get("/")
def get_alerts():

    return [
        {
            "team": "Talent Corner",
            "status": "Critical",
            "usage": 105
        },
        {
            "team": "Global Recruit",
            "status": "Warning",
            "usage": 92
        }
    ]