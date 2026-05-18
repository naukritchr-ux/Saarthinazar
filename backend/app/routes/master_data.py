"""
routes/master_data.py

Rashesh-only master data management:
  - Pricing matrix (period × partner_type → price + limits)
  - Team master list (licences, partner_type, join_period)

Auto-recalculation: When licences / period / partner_type change on a team,
limits are recomputed from the pricing matrix × licence count.
Manual override is supported via explicit limit fields.
All changes are audit-logged with timestamp.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pricing import PricingPlan
from app.models.team import Team
from app.services.naukri_rules import add_audit, require_owner

router = APIRouter(prefix="/master-data")


# =====================================================
# HELPERS
# =====================================================

def _pricing_for_team(
    db: Session,
    join_period: str,
    partner_type: str,
) -> PricingPlan | None:
    """
    Return the pricing plan row matching period + partner_type.
    Falls back to period-only match, then first row.
    """
    plan = (
        db.query(PricingPlan)
        .filter(
            PricingPlan.period == join_period,
            PricingPlan.partner_type == partner_type,
        )
        .first()
    )
    if not plan:
        # Period-only fallback
        plan = (
            db.query(PricingPlan)
            .filter(PricingPlan.period == join_period)
            .first()
        )
    return plan


def _recalc_limits(
    team: Team,
    plan: PricingPlan | None,
) -> None:
    """
    Recalculate team limits from pricing plan × licence count.
    Only applied when a valid plan is found.
    """
    if not plan:
        return
    n = team.licences or 1
    team.cv_limit = plan.cv_limit * n
    team.nvites_limit = plan.nvites_limit * n
    team.jobs_limit = plan.jobs_limit * n
    team.licence_fee = (plan.price or 0) * n


def _team_row(team: Team) -> dict:
    """
    Serialize a Team for master data views.
    No financial-year dependency — pure configuration data.
    """
    licences = team.licences or 1
    return {
        "id": team.id,
        "name": team.name,
        "partner_name": team.partner_name or "",
        "partner_email": team.partner_email or "",
        "licences": licences,
        "partner_type": team.partner_type or "",
        "join_period": team.join_period or "",
        "licence_fee": team.licence_fee or 0,
        "cost_share": team.cost_share or 0,
        "is_active": team.is_active,
        # Stored totals (already multiplied by licences)
        "total_limits": {
            "cv": team.cv_limit or 0,
            "nvites": team.nvites_limit or 0,
            "jobs": team.jobs_limit or 0,
        },
        # Per-licence limits for display
        "per_licence_limits": {
            "cv": (team.cv_limit or 0) // licences,
            "nvites": (team.nvites_limit or 0) // licences,
            "jobs": (team.jobs_limit or 0) // licences,
        },
        "updated_at": (
            team.updated_at.isoformat()
            if team.updated_at
            else None
        ),
    }


def _pricing_row(item: PricingPlan) -> dict:
    return {
        "id": item.id,
        "period": item.period,
        "partner_type": item.partner_type,
        "price": item.price or 0,
        "cv_limit": item.cv_limit or 0,
        "nvites_limit": item.nvites_limit or 0,
        "jobs_limit": item.jobs_limit or 0,
        "updated_at": (
            item.updated_at.isoformat()
            if item.updated_at
            else None
        ),
    }


# =====================================================
# COMBINED MASTER DATA
# =====================================================

@router.get("/")
def master_data(db: Session = Depends(get_db)):
    pricing = db.query(PricingPlan).order_by(PricingPlan.id).all()
    teams = db.query(Team).order_by(Team.name).all()
    return {
        "pricing": [_pricing_row(p) for p in pricing],
        "teams": [_team_row(t) for t in teams],
    }


# =====================================================
# PRICING PLANS
# =====================================================

@router.get("/pricing")
def list_pricing(db: Session = Depends(get_db)):
    plans = db.query(PricingPlan).order_by(PricingPlan.id).all()
    return [_pricing_row(p) for p in plans]


@router.put("/pricing/{pricing_id}")
def update_pricing(
    pricing_id: int,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user = require_owner(authorization)
    item = db.query(PricingPlan).filter(PricingPlan.id == pricing_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Pricing row not found")

    updatable = ("period", "partner_type", "price", "cv_limit", "nvites_limit", "jobs_limit")
    for field in updatable:
        if field in payload:
            setattr(item, field, payload[field])

    add_audit(db, user["username"], "update_pricing", "pricing_plan", pricing_id, payload)
    db.commit()
    return _pricing_row(item)


# =====================================================
# TEAM MASTER LIST
# =====================================================

@router.get("/teams")
def list_teams(db: Session = Depends(get_db)):
    teams = db.query(Team).order_by(Team.name).all()
    return [_team_row(t) for t in teams]


@router.post("/teams")
def create_team(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user = require_owner(authorization)

    if db.query(Team).filter(Team.name == payload.get("name", "")).first():
        raise HTTPException(status_code=400, detail="Team name already exists")

    licences = int(payload.get("licences", 1) or 1)
    join_period = payload.get("join_period", "Q1 (Apr-Jun)")
    partner_type = payload.get("partner_type", "New Partner")

    plan = _pricing_for_team(db, join_period, partner_type)

    team = Team(
        name=payload["name"],
        partner_name=payload.get("partner_name", ""),
        partner_email=payload.get("partner_email", ""),
        licences=licences,
        partner_type=partner_type,
        join_period=join_period,
        licence_fee=float(payload.get("licence_fee", 0)),
        cost_share=float(payload.get("cost_share", 0)),
        # If manual limits provided, use them; otherwise auto-calc from plan
        cv_limit=int(payload["cv_limit"]) if "cv_limit" in payload else (plan.cv_limit * licences if plan else 0),
        nvites_limit=int(payload["nvites_limit"]) if "nvites_limit" in payload else (plan.nvites_limit * licences if plan else 0),
        jobs_limit=int(payload["jobs_limit"]) if "jobs_limit" in payload else (plan.jobs_limit * licences if plan else 0),
        is_active=payload.get("is_active", True),
    )

    # Auto-set licence_fee from plan if not manually set
    if "licence_fee" not in payload and plan:
        team.licence_fee = (plan.price or 0) * licences

    db.add(team)
    db.flush()
    add_audit(db, user["username"], "create_team", "team", team.id, payload)
    db.commit()
    db.refresh(team)
    return _team_row(team)


@router.put("/teams/{team_id}")
def update_team(
    team_id: int,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    Update team configuration.

    Auto-recalculation logic:
      - If licences, join_period, or partner_type are changed,
        limits are auto-recalculated from the pricing matrix.
      - Pass manual_override=true + explicit cv_limit/nvites_limit/jobs_limit
        to bypass auto-calc and set limits directly.
    """
    user = require_owner(authorization)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    manual_override = payload.get("manual_override", False)

    # Track which pricing-relevant fields changed
    pricing_fields_changed = any(
        k in payload for k in ("licences", "join_period", "partner_type")
    )

    # Apply simple fields
    simple_fields = ("name", "partner_name", "partner_email", "cost_share", "is_active")
    for field in simple_fields:
        if field in payload:
            setattr(team, field, payload[field])

    # Apply pricing-relevant fields
    if "licences" in payload:
        team.licences = int(payload["licences"]) or 1
    if "join_period" in payload:
        team.join_period = payload["join_period"]
    if "partner_type" in payload:
        team.partner_type = payload["partner_type"]

    if manual_override:
        # Rashesh is setting limits directly — skip auto-calc
        if "cv_limit" in payload:
            team.cv_limit = int(payload["cv_limit"])
        if "nvites_limit" in payload:
            team.nvites_limit = int(payload["nvites_limit"])
        if "jobs_limit" in payload:
            team.jobs_limit = int(payload["jobs_limit"])
        if "licence_fee" in payload:
            team.licence_fee = float(payload["licence_fee"])
    elif pricing_fields_changed:
        # Auto-recalculate limits from pricing matrix × licences
        plan = _pricing_for_team(db, team.join_period, team.partner_type)
        _recalc_limits(team, plan)

    add_audit(
        db,
        user["username"],
        "update_team",
        "team",
        team_id,
        {**payload, "auto_recalculated": pricing_fields_changed and not manual_override},
    )
    db.commit()
    db.refresh(team)
    return _team_row(team)


# =====================================================
# PREVIEW: auto-calculated limits for a given config
# Used by frontend edit modal to show live preview
# before saving.
# =====================================================

@router.get("/teams/preview-limits")
def preview_limits(
    join_period: str,
    partner_type: str,
    licences: int = 1,
    db: Session = Depends(get_db),
):
    """
    Returns what limits would be assigned to a team
    with the given period + partner_type + licences.
    Used by the edit modal for live preview.
    """
    plan = _pricing_for_team(db, join_period, partner_type)
    if not plan:
        return {
            "found": False,
            "cv_limit": 0,
            "nvites_limit": 0,
            "jobs_limit": 0,
            "licence_fee": 0,
        }
    n = licences or 1
    return {
        "found": True,
        "cv_limit": plan.cv_limit * n,
        "nvites_limit": plan.nvites_limit * n,
        "jobs_limit": plan.jobs_limit * n,
        "licence_fee": (plan.price or 0) * n,
    }
