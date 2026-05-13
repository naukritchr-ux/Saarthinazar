from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invoice import Invoice
from app.models.team import Team
from app.models.topup import TopUp
from app.services.naukri_rules import add_audit, create_invoice, parse_date, team_limits

router = APIRouter(prefix="/topups")


@router.get("/")
def list_topups(db: Session = Depends(get_db)):
    return [
        {
            "id": item.id,
            "team_id": item.team_id,
            "team_name": item.team_name,
            "cv_topup": item.cv_topup or 0,
            "nvites_topup": item.nvites_topup or 0,
            "jobs_topup": item.jobs_topup or 0,
            "amount": item.amount or 0,
            "purchase_date": item.purchase_date.isoformat() if item.purchase_date else None,
            "added_by": item.added_by,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in db.query(TopUp).order_by(TopUp.created_at.desc()).all()
    ]


@router.post("/")
def create_topup(
    payload: dict,
    db: Session = Depends(get_db)
):
    team = None
    if payload.get("team_id"):
        team = db.query(Team).filter(Team.id == payload["team_id"]).first()
    if not team and payload.get("team_name"):
        team = db.query(Team).filter(Team.name == payload["team_name"]).first()
    if not team:
        return {"error": "Team not found"}

    topup = TopUp(
        team_id=team.id,
        team_name=team.name,
        cv_topup=int(payload.get("cv_topup") or 0),
        nvites_topup=int(payload.get("nvites_topup") or 0),
        jobs_topup=int(payload.get("jobs_topup") or 0),
        amount=float(payload.get("amount") or 0),
        purchase_date=parse_date(payload.get("purchase_date") or payload.get("date")),
        added_by=payload.get("added_by", "Kajal"),
    )

    db.add(topup)
    db.flush()

    items = []
    if topup.amount:
        items.append(
            {
                "inventory_type": "topup",
                "label": "Inventory Top-Up",
                "cv_topup": topup.cv_topup,
                "nvites_topup": topup.nvites_topup,
                "jobs_topup": topup.jobs_topup,
                "subtotal": round(topup.amount / 1.18, 2),
                "gst": round(topup.amount - (topup.amount / 1.18), 2),
                "total": topup.amount,
            }
        )
        create_invoice(db, team, "topup", items, actor=topup.added_by, notes="Top-up purchase")

    add_audit(db, topup.added_by, "create_topup", "topup", topup.id, payload)
    db.commit()

    return {
        "message": "Topup added",
        "topup_id": topup.id,
        "new_limits": team_limits(team, db),
        "latest_invoice": db.query(Invoice).order_by(Invoice.id.desc()).first().invoice_number if items else None,
    }
