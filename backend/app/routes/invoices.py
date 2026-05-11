from fastapi import APIRouter

router = APIRouter(prefix="/invoices")


@router.get("/")
def get_invoices():

    return [
        {
            "invoice_number": "INV-2026-001",
            "partner_name": "Talent Corner",
            "amount": 80000,
            "status": "Unpaid"
        }
    ]