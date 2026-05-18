from datetime import date, timedelta

from fastapi import (
    APIRouter,
    Depends,
    Query
)

from sqlalchemy.orm import Session

from app.database import get_db

from app.models.invoice import Invoice
from app.models.report_upload import ReportUpload
from app.models.team import Team
from app.models.usage import SubUserUsage

from app.services.naukri_rules import (
    invoice_summary,
    status_for_team,
    team_payload
)

router = APIRouter(prefix="/dashboard")


# =====================================================
# HELPER — MOST RECENT MONDAY (inclusive of today)
# Monday = weekday 0
# =====================================================

def _most_recent_monday(today: date) -> date:
    """Return the Monday of the current week (Mon–Sun)."""
    return today - timedelta(days=today.weekday())


# =====================================================
# HELPER — TEAMS ACTIVE IN A FINANCIAL YEAR
# =====================================================

def _teams_for_fy(db: Session, financial_year: str) -> list[Team]:
    team_ids = (
        db.query(SubUserUsage.team_id)
        .filter(SubUserUsage.financial_year == financial_year)
        .distinct()
        .subquery()
    )
    return (
        db.query(Team)
        .filter(Team.id.in_(team_ids))
        .order_by(Team.name)
        .all()
    )


# =====================================================
# DASHBOARD SUMMARY
# =====================================================

@router.get("/summary")
def dashboard_summary(
    financial_year: str = Query(...),
    db: Session = Depends(get_db)
):
    teams = _teams_for_fy(db, financial_year)

    usages = (
        db.query(SubUserUsage)
        .filter(SubUserUsage.financial_year == financial_year)
        .all()
    )

    invoices = db.query(Invoice).all()

    latest_upload = (
        db.query(ReportUpload)
        .filter(
            ReportUpload.financial_year == financial_year,
            ReportUpload.status == "success",
        )
        .order_by(ReportUpload.created_at.desc())
        .first()
    )

    invoice_stats = invoice_summary(invoices)

    total_cv = sum(row.cv_usage or 0 for row in usages)
    total_nvites = sum(row.nvites_usage or 0 for row in usages)
    total_jobs = sum(row.jobs_usage or 0 for row in usages)

    statuses = [
        status_for_team(team, db, financial_year)
        for team in teams
    ]

    today = date.today()
    this_monday = _most_recent_monday(today)
    is_monday = today.weekday() == 0

    # Did we get an upload this week (since Monday)?
    upload_this_week = False
    days_since = None

    if latest_upload and latest_upload.created_at:
        upload_date = latest_upload.created_at.date()
        upload_this_week = upload_date >= this_monday
        days_since = (today - upload_date).days

    # upload_reminder = show in PENDING ACTIONS section
    # Shown on Monday when no upload has happened this week yet
    upload_reminder = is_monday and not upload_this_week

    # upload_overdue = show the general banner (no upload in > 8 days OR never uploaded)
    upload_overdue = (days_since is None) or (days_since > 8)

    return {
        "financial_year": financial_year,
        "total_teams": len(teams),
        "total_cv_usage": total_cv,
        "total_nvites_usage": total_nvites,
        "total_job_postings": total_jobs,
        "critical_teams": len([v for v in statuses if v in {"Critical", "Over limit"}]),
        "warning_teams": len([v for v in statuses if v == "Warning"]),
        "outstanding_invoices": invoice_stats["outstanding"],
        "outstanding_invoice_count": invoice_stats["pending_count"],
        "last_upload_date": (
            latest_upload.created_at.date().isoformat()
            if latest_upload and latest_upload.created_at
            else None
        ),
        "date_range": {
            "start": (
                latest_upload.range_start.isoformat()
                if latest_upload and latest_upload.range_start
                else None
            ),
            "end": (
                latest_upload.range_end.isoformat()
                if latest_upload and latest_upload.range_end
                else None
            ),
        },
        # upload_reminder = Monday + not uploaded this week (drives pending actions row)
        "upload_reminder": upload_reminder,
        # upload_overdue = general banner (overdue by > 8 days or never uploaded)
        "upload_overdue": upload_overdue,
        "upload_this_week": upload_this_week,
        "is_monday": is_monday,
        "days_since_upload": days_since,
    }


# =====================================================
# TEAM USAGE
# =====================================================

@router.get("/teams")
def dashboard_teams(
    financial_year: str = Query(...),
    db: Session = Depends(get_db)
):
    teams = _teams_for_fy(db, financial_year)
    return [team_payload(team, db, financial_year) for team in teams]


# =====================================================
# SINGLE TEAM DETAIL
# =====================================================

@router.get("/teams/{team_id}")
def team_detail(
    team_id: int,
    financial_year: str = Query(...),
    db: Session = Depends(get_db)
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Team not found")

    has_usage = (
        db.query(SubUserUsage)
        .filter(SubUserUsage.team_id == team_id, SubUserUsage.financial_year == financial_year)
        .first()
    )
    if not has_usage:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=404,
            detail=f"No data found for this team in financial year {financial_year}"
        )

    return team_payload(team, db, financial_year, include_financial=True)


# =====================================================
# CRITICAL / WARNING TEAMS
# =====================================================

@router.get("/critical")
def critical_teams(
    financial_year: str = Query(...),
    db: Session = Depends(get_db)
):
    teams = _teams_for_fy(db, financial_year)
    payload = [team_payload(team, db, financial_year) for team in teams]
    return [t for t in payload if t["status"] in {"Warning", "Critical", "Over limit"}]


# =====================================================
# FINANCIAL YEAR LIST
# Returns years ordered with the CURRENT financial year
# (based on today's date) first and marked as active.
# =====================================================

@router.get("/financial-years")
def list_financial_years(db: Session = Depends(get_db)):
    from app.models.financial_year import FinancialYear

    years = (
        db.query(FinancialYear)
        .order_by(FinancialYear.start_date.desc())
        .all()
    )

    today = date.today()

    result = []
    for fy in years:
        # A FY is "current" if today falls within its start/end dates
        is_current = fy.start_date <= today <= fy.end_date
        result.append(
            {
                "id": fy.id,
                "label": fy.label,
                "start_date": fy.start_date.isoformat(),
                "end_date": fy.end_date.isoformat(),
                # Override DB is_active with date-based check
                "is_active": is_current,
            }
        )

    # Sort so the current FY appears first
    result.sort(key=lambda y: (not y["is_active"], y["label"]), reverse=False)

    return result
