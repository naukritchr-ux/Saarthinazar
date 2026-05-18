# backend/app/routes/invoice_routes.py

from fastapi import (
    APIRouter,
    Depends,
)

from sqlalchemy.orm import Session

from app.database import get_db

from app.models.invoice import Invoice

from app.services.invoice_generator import (
    generate_invoices
)

router = APIRouter()


# =====================================================
# GENERATE INVOICES
# =====================================================

@router.post("/invoices/generate")
def generate_all_invoices(
    db: Session = Depends(get_db)
):

    generated = generate_invoices(db)

    return {
        "status": "success",
        "generated": generated
    }


# =====================================================
# GET ALL INVOICES
# =====================================================

@router.get("/invoices")
def get_all_invoices(
    db: Session = Depends(get_db)
):

    invoices = (
        db.query(Invoice)
        .order_by(
            Invoice.created_at.desc()
        )
        .all()
    )

    result = []

    for invoice in invoices:

        result.append({

            "id": invoice.id,

            "invoice_number":
                invoice.invoice_number,

            "partner_name":
                invoice.partner_name,

            "amount":
                invoice.amount,

            "gst_amount":
                invoice.gst_amount,

            "total_amount":
                invoice.total_amount,

            "payment_status":
                invoice.payment_status,

            "invoice_date":
                invoice.invoice_date,

            "due_date":
                invoice.due_date,

            "pdf_path":
                invoice.pdf_path,
        })

    return result