from fastapi import APIRouter

router = APIRouter(prefix="/dashboard")


@router.get("/summary")
def dashboard_summary():

    return {
        "total_cv_usage": 10800,
        "total_nvites_usage": 71500,
        "total_job_postings": 350,
        "critical_teams": 3,
        "outstanding_invoices": 245000,
        "last_upload_date": "30 Apr"
    }