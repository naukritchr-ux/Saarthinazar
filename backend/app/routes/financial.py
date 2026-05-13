from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invoice import Invoice
from app.models.team import Team
from app.services.naukri_rules import MASTER_NAUKRI_COST, invoice_summary, require_owner, team_payload

router = APIRouter(prefix="/financial")


@router.get("/overview")
def financial_overview(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    require_owner(authorization)
    teams = db.query(Team).order_by(Team.name).all()
    invoices = db.query(Invoice).all()
    paid_invoice_revenue = sum(invoice.paid_amount or 0 for invoice in invoices)
    licence_revenue = sum(team.licence_fee or 0 for team in teams)
    total_revenue = licence_revenue + paid_invoice_revenue
    summary = invoice_summary(invoices)

    return {
        "master_naukri_cost": MASTER_NAUKRI_COST,
        "licence_revenue": licence_revenue,
        "paid_invoice_revenue": paid_invoice_revenue,
        "total_revenue": total_revenue,
        "gross_profit": total_revenue - MASTER_NAUKRI_COST,
        "outstanding_receivables": summary["outstanding"],
        "overage_revenue": sum(invoice.amount or 0 for invoice in invoices if invoice.invoice_type == "overage"),
        "active_partners": len([team for team in teams if team.is_active]),
        "partner_profit": [team_payload(team, db, include_financial=True) for team in teams],
    }
