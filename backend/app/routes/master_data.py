from fastapi import APIRouter

router = APIRouter(prefix="/master-data")


@router.get("/")
def master_data():

    return {
        "pricing": [],
        "teams": []
    }