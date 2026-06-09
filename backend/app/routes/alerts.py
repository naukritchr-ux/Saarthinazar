from collections import defaultdict

from fastapi import APIRouter, Depends, Query

from sqlalchemy.orm import Session

from app.database import get_db

from app.models.inventory_adjustment import InventoryAdjustment
from app.models.team import Team
from app.models.topup import TopUp
from app.models.usage import SubUserUsage

from app.services.naukri_rules import (
    BILLING_RULES,
    INVENTORY_TYPES,
    alert_message,
    overage_items,
    status_for_percent,
    usage_percent,
)

router = APIRouter(prefix="/alerts")


# =====================================================
# BULK HELPERS (mirrors dashboard bulk loader)
# =====================================================

def _bulk_load_alerts(db: Session, team_ids: list[int], financial_year: str) -> dict:
    usage_rows = (
        db.query(SubUserUsage)
        .filter(
            SubUserUsage.team_id.in_(team_ids),
            SubUserUsage.financial_year == financial_year,
        )
        .all()
    )
    usage_by_team = defaultdict(lambda: {"cv": 0, "nvites": 0, "jobs": 0})
    subusers_by_team = defaultdict(list)
    for row in usage_rows:
        usage_by_team[row.team_id]["cv"] += row.cv_usage or 0
        usage_by_team[row.team_id]["nvites"] += row.nvites_usage or 0
        usage_by_team[row.team_id]["jobs"] += row.jobs_usage or 0
        subusers_by_team[row.team_id].append({
            "name": row.name,
            "email": row.email,
            "cv_usage": row.cv_usage or 0,
            "nvites_usage": row.nvites_usage or 0,
            "jobs_usage": row.jobs_usage or 0,
        })

    topup_rows = (
        db.query(TopUp)
        .filter(
            TopUp.team_id.in_(team_ids),
            TopUp.financial_year == financial_year,
        )
        .all()
    )
    topups_by_team = defaultdict(lambda: {"cv": 0, "nvites": 0, "jobs": 0})
    topup_cv_items_by_team: dict[int, list[int]] = defaultdict(list)
    for row in topup_rows:
        topups_by_team[row.team_id]["cv"] += row.cv_topup or 0
        topups_by_team[row.team_id]["nvites"] += row.nvites_topup or 0
        topups_by_team[row.team_id]["jobs"] += row.jobs_topup or 0
        if row.cv_topup and row.cv_topup > 0:
            topup_cv_items_by_team[row.team_id].append(row.cv_topup)

    adj_rows = (
        db.query(InventoryAdjustment)
        .filter(
            InventoryAdjustment.team_id.in_(team_ids),
            InventoryAdjustment.financial_year == financial_year,
        )
        .all()
    )
    adj_by_team = defaultdict(lambda: {"cv": 0, "nvites": 0, "jobs": 0})
    for row in adj_rows:
        adj_by_team[row.team_id]["cv"] += row.cv_adjustment or 0
        adj_by_team[row.team_id]["nvites"] += row.nvites_adjustment or 0
        adj_by_team[row.team_id]["jobs"] += row.jobs_adjustment or 0

    return {
        "usage": usage_by_team,
        "topups": topups_by_team,
        "topup_cv_items": topup_cv_items_by_team,
        "adjustments": adj_by_team,
        "subusers": subusers_by_team,
    }


def _limits_from_bulk(team: Team, bulk: dict) -> dict:
    # team.cv_limit etc. are already stored as TOTAL (base × licences).
    # Do NOT multiply by licences again here.
    topups = bulk["topups"][team.id]
    adjs   = bulk["adjustments"][team.id]
    return {
        "cv":     (team.cv_limit     or 0) + topups["cv"]     + adjs["cv"],
        "nvites": (team.nvites_limit or 0) + topups["nvites"] + adjs["nvites"],
        "jobs":   (team.jobs_limit   or 0) + topups["jobs"]   + adjs["jobs"],
    }


import math

def _overage_amount_from_bulk(usage: dict, limits: dict) -> float:
    total = 0.0
    for key in INVENTORY_TYPES:
        overage = max(0, usage[key] - limits[key])
        if overage <= 0:
            continue
        rule = BILLING_RULES[key]
        billed = math.ceil(overage / rule["multiple"]) * rule["multiple"]
        subtotal = billed * rule["rate"]
        total += subtotal + subtotal * 0.18
    return round(total, 2)


# =====================================================
# GET ALL ALERTS
# ONLY ACTIVE TEAMS
# ONLY WARNING+
# FINANCIAL YEAR AWARE
# =====================================================

@router.get("/")
def get_alerts(
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):
    teams = (
        db.query(Team)
        .filter(Team.is_active.isnot(False))   # include active=True AND active=None (report-created teams)
        .order_by(Team.name)
        .all()
    )

    if not teams:
        return []

    team_ids = [t.id for t in teams]
    bulk = _bulk_load_alerts(db, team_ids, financial_year)

    alerts = []
    for team in teams:
        usage = dict(bulk["usage"][team.id])
        limits = _limits_from_bulk(team, bulk)
        percentages = {key: usage_percent(usage[key], limits[key]) for key in INVENTORY_TYPES}
        status = status_for_percent(max(percentages.values(), default=0))

        if status not in {"Warning", "Critical", "Over limit"}:
            continue

        remaining = {key: limits[key] - usage[key] for key in INVENTORY_TYPES}
        overage_amount = _overage_amount_from_bulk(usage, limits)
        members = bulk["subusers"][team.id]

        alerts.append({
            "team_id": team.id,
            "team_name": team.name,
            "partner_name": getattr(team, "partner_name", "") or team.name,
            "partner_email": getattr(team, "partner_email", "") or "",
            "type": "exceeded" if status == "Over limit" else status.lower(),
            "status": status,
            "financial_year": financial_year,
            "licence_count": team.licences or 1,
            "cv_limit_base": team.cv_limit or 0,
            "topup_cv_total": bulk["topups"][team.id]["cv"],
            "topup_cv_list": bulk["topup_cv_items"].get(team.id, []),
            "cv_usage": usage["cv"],
            "cv_limit": limits["cv"],
            "nvites_usage": usage["nvites"],
            "nvites_limit": limits["nvites"],
            "jobs_usage": usage["jobs"],
            "jobs_limit": limits["jobs"],
            "cv_remaining": remaining["cv"],
            "nvites_remaining": remaining["nvites"],
            "jobs_remaining": remaining["jobs"],
            "overage_amount": overage_amount,
            "members": members,
            "message": "",
        })

    return alerts


# =====================================================
# ALERT PREVIEW
# SINGLE TEAM
# FINANCIAL YEAR AWARE
# =====================================================

@router.get("/{team_id}/preview")
def preview_alert(
    team_id: int,
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):

    team = (
        db.query(Team)
        .filter(Team.id == team_id)
        .first()
    )

    if not team:

        return {
            "status": "error",
            "message": "Team not found"
        }

    return alert_message(
        team,
        db,
        financial_year
    )


# =====================================================
# SEND ALERT EMAIL
# =====================================================

@router.post("/{team_id}/send")
def send_alert(
    team_id: int,
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):

    team = (
        db.query(Team)
        .filter(Team.id == team_id)
        .first()
    )

    if not team:

        return {
            "status": "error",
            "message": "Team not found"
        }

    if not team.partner_email:

        return {
            "status": "error",
            "message": "No email address on file for this team"
        }

    # ==========================================
    # FY-AWARE ALERT DATA
    # ==========================================

    alert = alert_message(
        team,
        db,
        financial_year
    )

    try:

        from app.services.email_service import send_email

        success = send_email(

            recipient=team.partner_email,

            subject=(
                f"Naukri.com Usage Alert — "
                f"{team.name} | FY {financial_year}"
            ),

            body=alert.get("message", ""),
        )

        return {
            "status": (
                "success"
                if success
                else "error"
            )
        }

    except ImportError:

        # ==========================================
        # EMAIL SERVICE NOT CONFIGURED
        # ==========================================

        return {
            "status": "success",
            "note": "Email service not configured yet"
        }

    except Exception as e:

        return {
            "status": "error",
            "message": str(e)
        }