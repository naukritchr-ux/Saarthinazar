from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pricing import PricingPlan
from app.models.team import Team
from app.services.naukri_rules import add_audit, require_owner, team_payload

router = APIRouter(prefix="/master-data")


@router.get("/")
def master_data(db: Session = Depends(get_db)):
    pricing = db.query(PricingPlan).order_by(PricingPlan.id).all()
    teams = db.query(Team).order_by(Team.name).all()

    return {
        "pricing": [
            {
                "id": item.id,
                "period": item.period,
                "partner_type": item.partner_type,
                "price": item.price,
                "cv_limit": item.cv_limit,
                "nvites_limit": item.nvites_limit,
                "jobs_limit": item.jobs_limit,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            for item in pricing
        ],
        "teams": [team_payload(team, db, include_financial=True) for team in teams],
    }


@router.put("/pricing/{pricing_id}")
def update_pricing(pricing_id: int, payload: dict, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = require_owner(authorization)
    item = db.query(PricingPlan).filter(PricingPlan.id == pricing_id).first()
    if not item:
        return {"error": "Pricing row not found"}
    for field in ("period", "partner_type", "price", "cv_limit", "nvites_limit", "jobs_limit"):
        if field in payload:
            setattr(item, field, payload[field])
    add_audit(db, user["username"], "update_pricing", "pricing_plan", pricing_id, payload)
    db.commit()
    return {"message": "Pricing updated", "id": pricing_id}


@router.post("/teams")
def create_team(payload: dict, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = require_owner(authorization)
    licences = int(payload.get("licences") or payload.get("licence_count") or 1)
    team = Team(
        name=payload["name"],
        partner_name=payload.get("partner_name", ""),
        partner_email=payload.get("partner_email", ""),
        licences=licences,
        partner_type=payload.get("partner_type", "New Partner"),
        join_period=payload.get("join_period", "Q1 (Apr-Jun)"),
        licence_fee=float(payload.get("licence_fee", 0)),
        cost_share=float(payload.get("cost_share", 0)),
        cv_limit=int(payload.get("cv_limit", 0)),
        nvites_limit=int(payload.get("nvites_limit", 0)),
        jobs_limit=int(payload.get("jobs_limit", 0)),
    )
    db.add(team)
    db.flush()
    add_audit(db, user["username"], "create_team", "team", team.id, payload)
    db.commit()
    return team_payload(team, db, include_financial=True)


@router.put("/teams/{team_id}")
def update_team(team_id: int, payload: dict, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = require_owner(authorization)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        return {"error": "Team not found"}
    mapping = {
        "licence_count": "licences",
        "original_limits": None,
    }
    for field, value in payload.items():
        target = mapping.get(field, field)
        if target and hasattr(team, target):
            setattr(team, target, value)
    if "original_limits" in payload:
        team.cv_limit = payload["original_limits"].get("cv", team.cv_limit)
        team.nvites_limit = payload["original_limits"].get("nvites", team.nvites_limit)
        team.jobs_limit = payload["original_limits"].get("jobs", team.jobs_limit)
    add_audit(db, user["username"], "update_team", "team", team_id, payload)
    db.commit()
    return team_payload(team, db, include_financial=True)
