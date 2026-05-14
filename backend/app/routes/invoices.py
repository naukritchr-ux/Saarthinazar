from datetime import (
    datetime,
    timedelta
)

from fastapi import (
    APIRouter,
    Depends,
    Query
)

from sqlalchemy.orm import Session

from app.database import get_db

from app.models.invoice import Invoice
from app.models.team import Team

router = APIRouter(prefix="/invoices")


# =====================================================
# GET ALL INVOICES
# =====================================================

@router.get("/")
def get_invoices(

    financial_year: str = Query(...),

    db: Session = Depends(get_db)
):

    invoices = (

        db.query(Invoice)

        .filter(
            Invoice.financial_year == financial_year
        )

        .order_by(
            Invoice.created_at.desc()
        )

        .all()
    )

    return invoices


# =====================================================
# GENERATE INVOICES
# =====================================================

@router.post("/generate")
def generate_invoices(

    financial_year: str = Query(...),

    db: Session = Depends(get_db)
):

    teams = db.query(Team).all()

    generated = []

    for index, team in enumerate(teams):

        existing = (

            db.query(Invoice)

            .filter(
                Invoice.partner_name == team.name,
                Invoice.financial_year == financial_year
            )

            .first()
        )

        if existing:
            continue

        amount = 80000

        gst = amount * 0.18

        total = amount + gst

        invoice = Invoice(

            invoice_number=f"INV-{financial_year}-{1000 + index}",

            partner_name=team.name,

            financial_year=financial_year,

            team_id=team.id,

            amount=amount,

            gst_amount=gst,

            total_amount=total,

            due_date=datetime.now() + timedelta(days=7),

            payment_status="unpaid",

            notes="Auto-generated invoice",

            invoice_type="overage"
        )

        db.add(invoice)

        generated.append({

            "partner_name": team.name,

            "amount": total
        })

    db.commit()

    return {

        "status": "success",

        "generated": generated
    }


# =====================================================
# UPDATE PAYMENT STATUS
# =====================================================

@router.patch("/{invoice_id}/payment")
def update_payment_status(

    invoice_id: int,

    status: str,

    notes: str = "",

    db: Session = Depends(get_db)
):

    invoice = (

        db.query(Invoice)

        .filter(
            Invoice.id == invoice_id
        )

        .first()
    )

    if not invoice:

        return {

            "status": "error",

            "message": "Invoice not found"
        }

    invoice.payment_status = status

    invoice.notes = notes

    if status == "paid":

        invoice.payment_date = datetime.now()

    db.commit()

    return {

        "status": "success"
    }