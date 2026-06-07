from collections import defaultdict
from datetime import date, timedelta

from fastapi import (
    APIRouter,
    Depends,
    Query
)

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db

from app.models.inventory_adjustment import InventoryAdjustment
from app.models.invoice import Invoice
from app.models.report_upload import ReportUpload
from app.models.team import Team
from app.models.topup import TopUp
from app.models.usage import SubUserUsage

from app.services.naukri_rules import (
    INVENTORY_TYPES,
    invoice_summary,
    status_for_percent,
    usage_percent,
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
# BULK DATA LOADER — single set of queries for all teams
# =====================================================

def _bulk_load(db: Session, team_ids: list[int], financial_year: str) -> dict:
    """Load all usage, topup, adjustment, invoice, subuser data in bulk."""

    # Usage — grouped by team_id
    usage_rows = (
        db.query(SubUserUsage)
        .filter(
            SubUserUsage.team_id.in_(team_ids),
            SubUserUsage.financial_year == financial_year,
        )
        .all()
    )
    usage_by_team: dict[int, dict] = defaultdict(lambda: {"cv": 0, "nvites": 0, "jobs": 0})
    subusers_by_team: dict[int, list] = defaultdict(list)
    for row in usage_rows:
        usage_by_team[row.team_id]["cv"] += row.cv_usage or 0
        usage_by_team[row.team_id]["nvites"] += row.nvites_usage or 0
        usage_by_team[row.team_id]["jobs"] += row.jobs_usage or 0
        subusers_by_team[row.team_id].append({
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "cv_usage": row.cv_usage,
            "nvites_usage": row.nvites_usage,
            "jobs_usage": row.jobs_usage,
        })

    # Topups — grouped by team_id
    topup_rows = (
        db.query(TopUp)
        .filter(
            TopUp.team_id.in_(team_ids),
            TopUp.financial_year == financial_year,
        )
        .all()
    )
    topups_by_team: dict[int, dict] = defaultdict(lambda: {"cv": 0, "nvites": 0, "jobs": 0})
    for row in topup_rows:
        topups_by_team[row.team_id]["cv"] += row.cv_topup or 0
        topups_by_team[row.team_id]["nvites"] += row.nvites_topup or 0
        topups_by_team[row.team_id]["jobs"] += row.jobs_topup or 0

    # Adjustments — grouped by team_id
    adj_rows = (
        db.query(InventoryAdjustment)
        .filter(
            InventoryAdjustment.team_id.in_(team_ids),
            InventoryAdjustment.financial_year == financial_year,
        )
        .all()
    )
    adj_by_team: dict[int, dict] = defaultdict(lambda: {"cv": 0, "nvites": 0, "jobs": 0})
    for row in adj_rows:
        adj_by_team[row.team_id]["cv"] += row.cv_adjustment or 0
        adj_by_team[row.team_id]["nvites"] += row.nvites_adjustment or 0
        adj_by_team[row.team_id]["jobs"] += row.jobs_adjustment or 0

    # Outstanding invoices — grouped by team_id
    # Use total_amount (incl. GST) if available, fall back to amount (pre-GST)
    # Only look at invoices for THIS financial year to avoid cross-FY bleed
    invoice_rows = (
        db.query(Invoice)
        .filter(
            Invoice.team_id.in_(team_ids),
            Invoice.financial_year == financial_year,
        )
        .filter(
            Invoice.payment_status.notin_(["paid"]),
        )
        .all()
    )
    outstanding_by_team: dict[int, float] = defaultdict(float)
    for inv in invoice_rows:
        # Skip invoices that are fully paid (check both status columns)
        ps = (inv.payment_status or "").lower().strip()
        s  = (inv.status or "").lower().strip()
        if ps == "paid" or s == "paid":
            continue
        total = float(inv.total_amount or 0) or float(inv.amount or 0)
        paid  = float(inv.paid_amount or 0)
        outstanding_by_team[inv.team_id] += max(0, total - paid)

    return {
        "usage": usage_by_team,
        "topups": topups_by_team,
        "adjustments": adj_by_team,
        "outstanding": outstanding_by_team,
        "subusers": subusers_by_team,
    }


def _effective_limits_from_bulk(team: Team, bulk: dict) -> dict:
    # cv_limit / nvites_limit / jobs_limit on the Team row already represent
    # the TOTAL for the team (pricing_per_licence * licences was applied when
    # the team was created / updated).  Do NOT multiply by licences again.
    base_cv = team.cv_limit or 0
    base_nvites = team.nvites_limit or 0
    base_jobs = team.jobs_limit or 0
    topups = bulk["topups"][team.id]
    adjs = bulk["adjustments"][team.id]
    return {
        "cv": base_cv + topups["cv"] + adjs["cv"],
        "nvites": base_nvites + topups["nvites"] + adjs["nvites"],
        "jobs": base_jobs + topups["jobs"] + adjs["jobs"],
    }


def _team_payload_from_bulk(team: Team, bulk: dict, financial_year: str) -> dict:
    usage = dict(bulk["usage"][team.id])
    topups = dict(bulk["topups"][team.id])
    limits = _effective_limits_from_bulk(team, bulk)
    percentages = {key: usage_percent(usage[key], limits[key]) for key in INVENTORY_TYPES}
    return {
        "id": team.id,
        "name": team.name,
        "partner_name": team.partner_name,
        "partner_email": team.partner_email,
        "licence_count": team.licences,
        "partner_type": team.partner_type,
        "join_period": team.join_period,
        "original_limits": {
            "cv": team.cv_limit or 0,
            "nvites": team.nvites_limit or 0,
            "jobs": team.jobs_limit or 0,
        },
        "topups": topups,
        "total_limits": limits,
        "usage": usage,
        "remaining": {key: max(0, limits[key] - usage[key]) for key in INVENTORY_TYPES},
        "usage_percent": percentages,
        "status": status_for_percent(max(percentages.values(), default=0)),
        "outstanding_invoice": bulk["outstanding"][team.id],
        "subusers": bulk["subusers"][team.id],
    }


# =====================================================
# DASHBOARD SUMMARY
# =====================================================

@router.get("/summary")
def dashboard_summary(
    financial_year: str = Query(...),
    db: Session = Depends(get_db)
):
    teams = _teams_for_fy(db, financial_year)
    team_ids = [t.id for t in teams]

    # Bulk load all team data in a fixed number of queries
    bulk = _bulk_load(db, team_ids, financial_year)

    # Aggregate usage across all teams from already-loaded data
    total_cv = sum(v["cv"] for v in bulk["usage"].values())
    total_nvites = sum(v["nvites"] for v in bulk["usage"].values())
    total_jobs = sum(v["jobs"] for v in bulk["usage"].values())

    # Invoices (all, for invoice_summary outstanding calc)
    invoices = db.query(Invoice).filter(Invoice.financial_year == financial_year).all()
    invoice_stats = invoice_summary(invoices)

    latest_upload = (
        db.query(ReportUpload)
        .filter(
            ReportUpload.financial_year == financial_year,
            ReportUpload.status == "success",
        )
        .order_by(ReportUpload.created_at.desc())
        .first()
    )

    # Compute statuses from bulk data (no extra DB queries)
    statuses = []
    for team in teams:
        payload = _team_payload_from_bulk(team, bulk, financial_year)
        statuses.append(payload["status"])

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
    team_ids = [t.id for t in teams]
    bulk = _bulk_load(db, team_ids, financial_year)
    return [_team_payload_from_bulk(team, bulk, financial_year) for team in teams]


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
    team_ids = [t.id for t in teams]
    bulk = _bulk_load(db, team_ids, financial_year)
    payload = [_team_payload_from_bulk(team, bulk, financial_year) for team in teams]
    return [t for t in payload if t["status"] in {"Warning", "Critical", "Over limit"}]


# =====================================================
# COMBINED ENDPOINT — single request for all dashboard data
# =====================================================

@router.get("/all")
def dashboard_all(
    financial_year: str = Query(...),
    db: Session = Depends(get_db)
):
    """Returns summary + teams + critical in one request to minimize round trips."""
    teams = _teams_for_fy(db, financial_year)
    team_ids = [t.id for t in teams]
    bulk = _bulk_load(db, team_ids, financial_year)

    all_payloads = [_team_payload_from_bulk(team, bulk, financial_year) for team in teams]
    critical = [t for t in all_payloads if t["status"] in {"Warning", "Critical", "Over limit"}]

    # Build summary from bulk data
    total_cv = sum(v["cv"] for v in bulk["usage"].values())
    total_nvites = sum(v["nvites"] for v in bulk["usage"].values())
    total_jobs = sum(v["jobs"] for v in bulk["usage"].values())

    invoices = db.query(Invoice).filter(Invoice.financial_year == financial_year).all()
    invoice_stats = invoice_summary(invoices)

    latest_upload = (
        db.query(ReportUpload)
        .filter(
            ReportUpload.financial_year == financial_year,
            ReportUpload.status == "success",
        )
        .order_by(ReportUpload.created_at.desc())
        .first()
    )

    today = date.today()
    this_monday = _most_recent_monday(today)
    is_monday = today.weekday() == 0
    upload_this_week = False
    days_since = None
    if latest_upload and latest_upload.created_at:
        upload_date = latest_upload.created_at.date()
        upload_this_week = upload_date >= this_monday
        days_since = (today - upload_date).days

    statuses = [p["status"] for p in all_payloads]

    summary = {
        "financial_year": financial_year,
        "total_teams": len(teams),
        "total_cv_usage": total_cv,
        "total_nvites_usage": total_nvites,
        "total_job_postings": total_jobs,
        "critical_teams": len([s for s in statuses if s in {"Critical", "Over limit"}]),
        "warning_teams": len([s for s in statuses if s == "Warning"]),
        "outstanding_invoices": invoice_stats["outstanding"],
        "outstanding_invoice_count": invoice_stats["pending_count"],
        "last_upload_date": (
            latest_upload.created_at.date().isoformat()
            if latest_upload and latest_upload.created_at else None
        ),
        "date_range": {
            "start": latest_upload.range_start.isoformat() if latest_upload and latest_upload.range_start else None,
            "end": latest_upload.range_end.isoformat() if latest_upload and latest_upload.range_end else None,
        },
        "upload_reminder": is_monday and not upload_this_week,
        "upload_overdue": (days_since is None) or (days_since > 8),
        "upload_this_week": upload_this_week,
        "is_monday": is_monday,
        "days_since_upload": days_since,
    }

    return {
        "summary": summary,
        "teams": all_payloads,
        "critical": critical,
    }


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
