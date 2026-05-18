from datetime import datetime

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
            "subtotal": item.subtotal or 0,
            "gst_amount": item.gst_amount or 0,
            "financial_year": item.financial_year or "",
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

    # =====================================
    # FIND TEAM
    # =====================================

    team = None

    if payload.get("team_id"):
        team = (
            db.query(Team)
            .filter(Team.id == payload["team_id"])
            .first()
        )

    if not team and payload.get("team_name"):
        team = (
            db.query(Team)
            .filter(Team.name == payload["team_name"])
            .first()
        )

    if not team:
        return {
            "status": "error",
            "message": "Team not found"
        }

    # =====================================
    # VALUES
    # =====================================

    cv_topup = int(payload.get("cv_topup") or 0)
    nvites_topup = int(payload.get("nvites_topup") or 0)
    jobs_topup = int(payload.get("jobs_topup") or 0)

    # =====================================
    # AUTO CALCULATION
    # =====================================

    cv_total = cv_topup * 10
    nvites_total = nvites_topup * 0.5
    jobs_total = jobs_topup * 50

    subtotal = cv_total + nvites_total + jobs_total

    gst_amount = round(subtotal * 0.18, 2)
    auto_total = round(subtotal + gst_amount, 2)

    # =====================================
    # MANUAL OVERRIDE
    # =====================================

    final_total = float(payload.get("amount") or auto_total)

    # =====================================
    # CREATE TOPUP
    # =====================================

    topup = TopUp(
        team_id=team.id,
        team_name=team.name,
        financial_year=payload.get("financial_year", "2025-2026"),
        cv_topup=cv_topup,
        nvites_topup=nvites_topup,
        jobs_topup=jobs_topup,
        amount=final_total,
        subtotal=subtotal,
        gst_amount=gst_amount,
        purchase_date=parse_date(
            payload.get("purchase_date") or payload.get("date")
        ) or datetime.utcnow(),
        added_by=payload.get("added_by", "Kajal"),
    )

    db.add(topup)
    db.flush()

    # =====================================
    # IMMEDIATELY INCREASE LIMITS
    # =====================================

    team.cv_limit = (team.cv_limit or 0) + cv_topup
    team.nvites_limit = (team.nvites_limit or 0) + nvites_topup
    team.jobs_limit = (team.jobs_limit or 0) + jobs_topup

    # =====================================
    # CREATE INVOICE
    # =====================================

    items = []

    if final_total > 0:
        items.append({
            "inventory_type": "topup",
            "label": "Inventory Top-Up",
            "cv_topup": cv_topup,
            "nvites_topup": nvites_topup,
            "jobs_topup": jobs_topup,
            "subtotal": subtotal,
            "gst": gst_amount,
            "total": final_total,
        })

        create_invoice(
            db,
            team,
            "topup",
            items,
            actor=topup.added_by,
            notes="Inventory Top-Up"
        )

    # =====================================
    # AUDIT LOG
    # =====================================

    add_audit(
        db,
        topup.added_by,
        "create_topup",
        "topup",
        topup.id,
        payload
    )

    db.commit()

    # =====================================
    # RESPONSE
    # =====================================

    latest_invoice = None

    if items:
        invoice = (
            db.query(Invoice)
            .order_by(Invoice.id.desc())
            .first()
        )
        if invoice:
            latest_invoice = invoice.invoice_number

    return {
        "status": "success",
        "message": "Topup added successfully",
        "topup_id": topup.id,
        "team_name": team.name,
        "financial_year": topup.financial_year,
        "subtotal": subtotal,
        "gst_amount": gst_amount,
        "total_amount": final_total,
        "new_limits": {
            "cv_limit": team.cv_limit,
            "nvites_limit": team.nvites_limit,
            "jobs_limit": team.jobs_limit,
        },
        "latest_invoice": latest_invoice,
    }