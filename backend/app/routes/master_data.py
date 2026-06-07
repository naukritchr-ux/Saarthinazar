from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
)

from sqlalchemy.orm import Session

from app.database import get_db

# =====================================================
# MODELS
# =====================================================

from app.models.pricing import PricingPlan
from app.models.team import Team

# =====================================================
# SERVICES
# =====================================================

from app.services.naukri_rules import (
    add_audit,
    require_owner,
)

router = APIRouter(prefix="/master-data")


# =====================================================
# HELPERS
# =====================================================

def _pricing_for_team(
    db: Session,
    financial_year: str,
    join_period: str,
    partner_type: str,
) -> PricingPlan | None:

    plan = (
        db.query(PricingPlan)
        .filter(
            PricingPlan.financial_year == financial_year,
            PricingPlan.period == join_period,
            PricingPlan.partner_type == partner_type,
        )
        .first()
    )

    if not plan:
        plan = (
            db.query(PricingPlan)
            .filter(
                PricingPlan.financial_year == financial_year,
                PricingPlan.period == join_period,
            )
            .first()
        )

    if not plan:
        plan = (
            db.query(PricingPlan)
            .filter(
                PricingPlan.financial_year == financial_year
            )
            .first()
        )

    return plan


def _recalc_limits(
    team: Team,
    plan: PricingPlan | None,
) -> None:

    if not plan:
        return

    licences = team.licences or 1

    team.cv_limit = (plan.cv_limit or 0) * licences
    team.nvites_limit = (plan.nvites_limit or 0) * licences
    team.jobs_limit = (plan.jobs_limit or 0) * licences
    team.licence_fee = (plan.licence_fee or 0) * licences


def _team_row(team: Team) -> dict:

    licences = team.licences or 1

    return {
        "id": team.id,
        "name": team.name,
        "partner_name": team.partner_name or "",
        "partner_email": team.partner_email or "",
        "financial_year": getattr(team, "financial_year", ""),
        "licences": licences,
        "partner_type": team.partner_type or "",
        "join_period": team.join_period or "",
        "licence_fee": team.licence_fee or 0,
        "cost_share": team.cost_share or 0,
        "is_active": team.is_active,

        "total_limits": {
            "cv": team.cv_limit or 0,
            "nvites": team.nvites_limit or 0,
            "jobs": team.jobs_limit or 0,
        },

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
        "financial_year": item.financial_year,
        "period": item.period,
        "partner_type": item.partner_type,
        "licence_fee": item.licence_fee or 0,
        "cv_limit": item.cv_limit or 0,
        "nvites_limit": item.nvites_limit or 0,
        "jobs_limit": item.jobs_limit or 0,
        "is_free_plan": item.is_free_plan,
        "is_locked": item.is_locked,
        "override_allowed": item.override_allowed,
        "is_active": item.is_active,
        "notes": item.notes or "",
        "created_by": item.created_by,
        "updated_by": item.updated_by,

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
def master_data(
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):

    pricing = (
        db.query(PricingPlan)
        .filter(
            PricingPlan.financial_year == financial_year
        )
        .order_by(PricingPlan.id)
        .all()
    )

    teams = (
        db.query(Team)
        .filter(
            Team.financial_year == financial_year
        )
        .order_by(Team.name)
        .all()
    )

    return {
        "pricing": [_pricing_row(p) for p in pricing],
        "teams": [_team_row(t) for t in teams],
    }


# =====================================================
# GET PRICING PLANS
# =====================================================

@router.get("/pricing")
def get_pricing_plans(
    financial_year: str,
    db: Session = Depends(get_db)
):

    plans = (
        db.query(PricingPlan)
        .filter(
            PricingPlan.financial_year == financial_year
        )
        .order_by(PricingPlan.period.asc())
        .all()
    )

    return [_pricing_row(p) for p in plans]


# =====================================================
# CREATE PRICING PLAN
# =====================================================

@router.post("/pricing")
def create_pricing_plan(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    user = require_owner(authorization)

    existing = (
        db.query(PricingPlan)
        .filter(
            PricingPlan.financial_year == payload["financial_year"],
            PricingPlan.period == payload["period"],
            PricingPlan.partner_type == payload["partner_type"],
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Pricing plan already exists"
        )

    plan = PricingPlan(
        financial_year=payload["financial_year"],
        period=payload["period"],
        partner_type=payload["partner_type"],
        licence_fee=payload.get("licence_fee", 0),
        cv_limit=payload.get("cv_limit", 0),
        nvites_limit=payload.get("nvites_limit", 0),
        jobs_limit=payload.get("jobs_limit", 0),
        is_free_plan=payload.get("is_free_plan", False),
        is_locked=False,
        is_active=True,
        created_by=user["username"],
        updated_by=user["username"],
    )

    db.add(plan)

    add_audit(
        db,
        user["username"],
        "create_pricing",
        "pricing_plan",
        0,
        payload,
    )

    db.commit()
    db.refresh(plan)

    return _pricing_row(plan)


# =====================================================
# UPDATE PRICING
# =====================================================

@router.put("/pricing/{pricing_id}")
def update_pricing(
    pricing_id: int,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    user = require_owner(authorization)

    item = (
        db.query(PricingPlan)
        .filter(
            PricingPlan.id == pricing_id
        )
        .first()
    )

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Pricing row not found"
        )

    # ==========================================
    # LOCK PROTECTION
    # ==========================================

    if item.is_locked:
        raise HTTPException(
            status_code=400,
            detail="Pricing plan is locked"
        )

    updatable = (
        "financial_year",
        "period",
        "partner_type",
        "licence_fee",
        "cv_limit",
        "nvites_limit",
        "jobs_limit",
        "is_free_plan",
        "is_active",
        "notes",
        "override_allowed",
    )

    for field in updatable:

        if field in payload:
            setattr(item, field, payload[field])

    item.updated_by = user["username"]

    # Cascade new limits to all teams using this pricing plan (if not manually overridden)
    teams_using_plan = (
        db.query(Team)
        .filter(
            Team.financial_year == item.financial_year,
            Team.join_period == item.period,
            Team.partner_type == item.partner_type,
            Team.is_active == True,
        )
        .all()
    )
    for t in teams_using_plan:
        _recalc_limits(t, item)

    add_audit(
        db,
        user["username"],
        "update_pricing",
        "pricing_plan",
        pricing_id,
        payload,
    )

    db.commit()
    db.refresh(item)

    return _pricing_row(item)


# =====================================================
# LOCK / UNLOCK FINANCIAL YEAR
# =====================================================

@router.patch("/pricing/lock-year")
def lock_financial_year(
    financial_year: str,
    locked: bool,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    user = require_owner(authorization)

    plans = (
        db.query(PricingPlan)
        .filter(
            PricingPlan.financial_year == financial_year
        )
        .all()
    )

    for item in plans:
        item.is_locked = locked
        item.updated_by = user["username"]

    add_audit(
        db,
        user["username"],
        "lock_financial_year",
        "pricing_plan",
        0,
        {
            "financial_year": financial_year,
            "locked": locked,
        },
    )

    db.commit()

    return {
        "success": True
    }


# =====================================================
# LOCK / UNLOCK SINGLE PLAN
# =====================================================

@router.patch("/pricing/{plan_id}/lock")
def lock_pricing_plan(
    plan_id: int,
    locked: bool,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    user = require_owner(authorization)

    plan = (
        db.query(PricingPlan)
        .filter(
            PricingPlan.id == plan_id
        )
        .first()
    )

    if not plan:
        raise HTTPException(
            status_code=404,
            detail="Pricing plan not found"
        )

    plan.is_locked = locked
    plan.updated_by = user["username"]

    # When locking a plan, cascade the confirmed limits to all teams using it
    if locked:
        teams_using_plan = (
            db.query(Team)
            .filter(
                Team.financial_year == plan.financial_year,
                Team.join_period == plan.period,
                Team.partner_type == plan.partner_type,
                Team.is_active == True,
            )
            .all()
        )
        for t in teams_using_plan:
            _recalc_limits(t, plan)

    add_audit(
        db,
        user["username"],
        "lock_pricing_plan",
        "pricing_plan",
        plan.id,
        {
            "locked": locked
        },
    )

    db.commit()
    db.refresh(plan)

    return _pricing_row(plan)


# =====================================================
# TEAM MASTER LIST
#
# Returns teams that belong to this FY — either by their
# stored financial_year column (master-data created) OR
# by having SubUserUsage records for this FY (report-
# uploaded teams whose financial_year column may still
# carry the old default).  Union ensures TopUps page
# always shows the right team list regardless of how the
# team was onboarded.
# =====================================================

@router.get("/teams")
def list_teams(
    financial_year: str,
    db: Session = Depends(get_db),
):
    from app.models.usage import SubUserUsage

    # 1. Teams explicitly tagged with this FY
    by_fy = (
        db.query(Team)
        .filter(Team.financial_year == financial_year)
        .all()
    )

    # 2. Teams that have usage records in this FY
    #    (covers auto-created teams from report uploads
    #     whose financial_year column may be a different year)
    usage_team_ids = (
        db.query(SubUserUsage.team_id)
        .filter(SubUserUsage.financial_year == financial_year)
        .distinct()
        .subquery()
    )
    by_usage = (
        db.query(Team)
        .filter(Team.id.in_(usage_team_ids))
        .all()
    )

    # Union — deduplicate by id
    seen: set[int] = set()
    merged: list[Team] = []
    for t in by_fy + by_usage:
        if t.id not in seen:
            seen.add(t.id)
            merged.append(t)

    merged.sort(key=lambda t: t.name)
    return [_team_row(t) for t in merged]


# =====================================================
# CREATE TEAM
# =====================================================

@router.post("/teams")
def create_team(
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    user = require_owner(authorization)

    existing = (
        db.query(Team)
        .filter(
            Team.name == payload.get("name", "")
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Team name already exists"
        )

    licences = int(payload.get("licences", 1) or 1)

    financial_year = payload.get(
        "financial_year",
        "2025-2026"
    )

    join_period = payload.get(
        "join_period",
        "Q1 (Apr-Jun)"
    )

    partner_type = payload.get(
        "partner_type",
        "New Partner"
    )

    plan = _pricing_for_team(
        db,
        financial_year,
        join_period,
        partner_type,
    )

    team = Team(
        name=payload["name"],
        partner_name=payload.get("partner_name", ""),
        partner_email=payload.get("partner_email", ""),
        financial_year=financial_year,
        licences=licences,
        partner_type=partner_type,
        join_period=join_period,
        licence_fee=float(payload.get("licence_fee", 0)),
        cost_share=float(payload.get("cost_share", 0)),

        cv_limit=(
            int(payload["cv_limit"])
            if "cv_limit" in payload
            else ((plan.cv_limit or 0) * licences if plan else 0)
        ),

        nvites_limit=(
            int(payload["nvites_limit"])
            if "nvites_limit" in payload
            else ((plan.nvites_limit or 0) * licences if plan else 0)
        ),

        jobs_limit=(
            int(payload["jobs_limit"])
            if "jobs_limit" in payload
            else ((plan.jobs_limit or 0) * licences if plan else 0)
        ),

        is_active=payload.get("is_active", True),
    )

    if "licence_fee" not in payload and plan:
        team.licence_fee = (
            (plan.licence_fee or 0) * licences
        )

    db.add(team)
    db.flush()

    add_audit(
        db,
        user["username"],
        "create_team",
        "team",
        team.id,
        payload,
    )

    db.commit()
    db.refresh(team)

    return _team_row(team)


# =====================================================
# UPDATE TEAM
# =====================================================

@router.put("/teams/{team_id}")
def update_team(
    team_id: int,
    payload: dict,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):

    user = require_owner(authorization)

    team = (
        db.query(Team)
        .filter(
            Team.id == team_id
        )
        .first()
    )

    if not team:
        raise HTTPException(
            status_code=404,
            detail="Team not found"
        )

    manual_override = payload.get(
        "manual_override",
        False
    )

    pricing_fields_changed = any(
        key in payload
        for key in (
            "licences",
            "join_period",
            "partner_type",
            "financial_year",
        )
    )

    simple_fields = (
        "name",
        "partner_name",
        "partner_email",
        "cost_share",
        "is_active",
    )

    for field in simple_fields:
        if field in payload:
            setattr(team, field, payload[field])

    if "financial_year" in payload:
        team.financial_year = payload["financial_year"]

    if "licences" in payload:
        team.licences = int(payload["licences"]) or 1

    if "join_period" in payload:
        team.join_period = payload["join_period"]

    if "partner_type" in payload:
        team.partner_type = payload["partner_type"]

    if manual_override:

        if "cv_limit" in payload:
            team.cv_limit = int(payload["cv_limit"])

        if "nvites_limit" in payload:
            team.nvites_limit = int(payload["nvites_limit"])

        if "jobs_limit" in payload:
            team.jobs_limit = int(payload["jobs_limit"])

        if "licence_fee" in payload:
            team.licence_fee = float(payload["licence_fee"])

    elif pricing_fields_changed:

        plan = _pricing_for_team(
            db,
            getattr(team, "financial_year", "2025-2026"),
            team.join_period,
            team.partner_type,
        )

        _recalc_limits(team, plan)

    add_audit(
        db,
        user["username"],
        "update_team",
        "team",
        team_id,
        {
            **payload,
            "auto_recalculated":
                pricing_fields_changed
                and not manual_override
        },
    )

    db.commit()
    db.refresh(team)

    return _team_row(team)


# =====================================================
# PREVIEW LIMITS
# =====================================================

@router.get("/teams/preview-limits")
def preview_limits(
    financial_year: str,
    join_period: str,
    partner_type: str,
    licences: int = 1,
    db: Session = Depends(get_db),
):

    plan = _pricing_for_team(
        db,
        financial_year,
        join_period,
        partner_type,
    )

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
        "cv_limit": (plan.cv_limit or 0) * n,
        "nvites_limit": (plan.nvites_limit or 0) * n,
        "jobs_limit": (plan.jobs_limit or 0) * n,
        "licence_fee": (plan.licence_fee or 0) * n,
    }


# =====================================================
# RESYNC ALL TEAMS TO THEIR PRICING PLAN
# Force-recalculates limits for every team based on
# their current join_period + partner_type + licences.
# Use after correcting pricing plan values.
# =====================================================

@router.post("/teams/resync")
def resync_team_limits(
    financial_year: str,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    user = require_owner(authorization)

    from app.models.usage import SubUserUsage
    # All teams in this FY (both by tag and by usage)
    usage_ids = {
        r.team_id for r in db.query(SubUserUsage.team_id)
        .filter(SubUserUsage.financial_year == financial_year).all()
    }
    tagged_teams = db.query(Team).filter(Team.financial_year == financial_year).all()
    all_ids = {t.id for t in tagged_teams} | usage_ids
    all_teams = db.query(Team).filter(Team.id.in_(all_ids)).all()

    updated = []
    skipped = []
    for team in all_teams:
        plan = _pricing_for_team(db, financial_year, team.join_period, team.partner_type)
        if plan and not plan.is_locked:
            # Not locked — recalc
            _recalc_limits(team, plan)
            updated.append(team.name)
        elif plan and plan.is_locked:
            # Locked — still apply (lock just prevents UI edits, not sync)
            _recalc_limits(team, plan)
            updated.append(team.name)
        else:
            skipped.append(team.name)

    add_audit(db, user["username"], "resync_teams", "team", 0, {"financial_year": financial_year})
    db.commit()

    return {
        "status": "success",
        "updated": len(updated),
        "skipped": len(skipped),
        "updated_teams": updated,
        "skipped_teams": skipped,
    }