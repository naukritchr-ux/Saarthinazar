from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invoice import Invoice
from app.models.team import Team
from app.services.naukri_rules import create_invoice, invoice_payload, invoice_summary, overage_items, parse_date

router = APIRouter(prefix="/invoices")


@router.get("/")
def get_invoices(db: Session = Depends(get_db)):
    invoices = db.query(Invoice).order_by(Invoice.id.desc()).all()
    return {
        "summary": invoice_summary(invoices),
        "invoices": [invoice_payload(invoice) for invoice in invoices],
    }


@router.post("/generate-overage/{team_id}")
def generate_overage_invoice(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        return {"error": "Team not found"}
    items = overage_items(team, db)
    if not items:
        return {"message": "No overage detected", "items": []}
    invoice = create_invoice(db, team, "overage", items, notes="Auto-generated overage invoice")
    db.commit()
    return invoice_payload(invoice)


@router.patch("/{invoice_id}/payment")
def update_payment(invoice_id: int, payload: dict, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        return {"error": "Invoice not found"}
    paid_amount = float(payload.get("paid_amount", invoice.paid_amount or 0))
    invoice.paid_amount = paid_amount
    invoice.payment_date = parse_date(payload.get("payment_date")) or date.today()
    if paid_amount >= (invoice.amount or 0):
        invoice.status = "Paid"
    elif paid_amount > 0:
        invoice.status = "Partially paid"
    else:
        invoice.status = "Unpaid"
    if "notes" in payload:
        invoice.notes = payload["notes"]
    db.commit()
    return invoice_payload(invoice)
