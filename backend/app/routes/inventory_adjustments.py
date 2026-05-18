from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db

from app.models.inventory_adjustment import (
    InventoryAdjustment
)

from app.models.team import Team

from app.services.naukri_rules import (
    add_audit
)

router = APIRouter(
    prefix="/inventory-adjustments"
)


# =====================================================
# LIST ADJUSTMENTS
# =====================================================

@router.get("/")
def list_adjustments(

    financial_year: str,

    db: Session = Depends(get_db)
):

    adjustments = (

        db.query(InventoryAdjustment)

        .filter(
            InventoryAdjustment.financial_year
            == financial_year
        )

        .order_by(
            InventoryAdjustment.created_at.desc()
        )

        .all()
    )

    return [

        {
            "id": item.id,

            "team_id": item.team_id,

            "team_name": item.team.name,

            "financial_year": item.financial_year,

            "cv_adjustment": item.cv_adjustment,

            "nvites_adjustment": item.nvites_adjustment,

            "jobs_adjustment": item.jobs_adjustment,

            "reason": item.reason,

            "created_by": item.created_by,

            "created_at": item.created_at,
        }

        for item in adjustments
    ]


# =====================================================
# CREATE ADJUSTMENT
# =====================================================

@router.post("/")
def create_adjustment(

    payload: dict,

    db: Session = Depends(get_db)
):

    team = (

        db.query(Team)

        .filter(
            Team.id == payload["team_id"]
        )

        .first()
    )

    if not team:

        return {

            "status": "error",

            "message": "Team not found"
        }

    adjustment = InventoryAdjustment(

        team_id=team.id,

        financial_year=payload["financial_year"],

        cv_adjustment=int(
            payload.get("cv_adjustment") or 0
        ),

        nvites_adjustment=int(
            payload.get("nvites_adjustment") or 0
        ),

        jobs_adjustment=int(
            payload.get("jobs_adjustment") or 0
        ),

        reason=payload.get("reason", ""),

        created_by=payload.get(
            "created_by",
            "Rashesh"
        ),
    )

    db.add(adjustment)

    add_audit(

        db,

        adjustment.created_by,

        "inventory_adjustment",

        "team",

        team.id,

        {
            "cv_adjustment":
                adjustment.cv_adjustment,

            "nvites_adjustment":
                adjustment.nvites_adjustment,

            "jobs_adjustment":
                adjustment.jobs_adjustment,

            "reason":
                adjustment.reason,
        }
    )

    db.commit()

    return {

        "status": "success",

        "message": "Inventory adjustment added"
    }