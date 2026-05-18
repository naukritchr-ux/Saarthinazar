import os
import math

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invoice import Invoice
from app.models.team import Team
from app.models.usage import SubUserUsage

from app.services.invoice_pdf_generator import generate_invoice_pdf

router = APIRouter(prefix="/invoices")

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(__file__)
    )
)


# =====================================================
# GET ALL INVOICES  (filtered by financial_year)
# =====================================================

@router.get("")
def get_invoices(
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):
    invoices = (
        db.query(Invoice)
        .filter(Invoice.financial_year == financial_year)
        .order_by(Invoice.created_at.desc())
        .all()
    )

    return [
        {
            "id":             invoice.id,
            "invoice_number": invoice.invoice_number,
            "partner_name":   invoice.partner_name,
            "amount":         float(invoice.amount or 0),
            "gst_amount":     float(invoice.gst_amount or 0),
            "total_amount":   float(invoice.total_amount or 0),
            "payment_status": invoice.payment_status,
            "invoice_date": (
                invoice.invoice_date.isoformat()
                if invoice.invoice_date else None
            ),
            "due_date": (
                invoice.due_date.isoformat()
                if invoice.due_date else None
            ),
            "payment_date": (
                invoice.payment_date.isoformat()
                if invoice.payment_date else None
            ),
            "pdf_path": invoice.pdf_path,
            "notes":    invoice.notes or "",
        }
        for invoice in invoices
    ]


# =====================================================
# GENERATE INVOICES  (only for the requested FY)
# =====================================================

@router.post("/generate")
def generate_invoices(
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Generate overage invoices for every team that has
    usage data in the given financial year.

    IMPORTANT: uses SubUserUsage to determine actual usage
    for the correct FY — never falls back to Team.cv_usage
    which is not FY-scoped.
    """

    # --------------------------------------------------
    # Load all teams that have usage in this FY
    # --------------------------------------------------
    from sqlalchemy import func

    usage_by_team = (
        db.query(
            SubUserUsage.team_id,
            func.sum(SubUserUsage.cv_usage).label("cv_usage"),
            func.sum(SubUserUsage.nvites_usage).label("nvites_usage"),
            func.sum(SubUserUsage.jobs_usage).label("jobs_usage"),
        )
        .filter(SubUserUsage.financial_year == financial_year)
        .group_by(SubUserUsage.team_id)
        .all()
    )

    if not usage_by_team:
        return {
            "status":    "success",
            "generated": [],
            "message":   f"No usage data found for FY {financial_year}",
        }

    team_ids = [row.team_id for row in usage_by_team]
    teams_map = {
        t.id: t
        for t in db.query(Team).filter(Team.id.in_(team_ids)).all()
    }

    generated = []

    for row in usage_by_team:

        team = teams_map.get(row.team_id)
        if not team:
            continue

        cv_usage      = int(row.cv_usage     or 0)
        nvites_usage  = int(row.nvites_usage or 0)
        jobs_usage    = int(row.jobs_usage   or 0)

        # Skip teams with zero usage
        if cv_usage + nvites_usage + jobs_usage <= 0:
            continue

        # --------------------------------------------------
        # Limits from Team snapshot (set at onboarding)
        # --------------------------------------------------
        effective_cv_limit     = int(team.cv_limit     or 0)
        effective_nvites_limit = int(team.nvites_limit or 0)
        effective_jobs_limit   = int(team.jobs_limit   or 0)

        # --------------------------------------------------
        # Overages
        # --------------------------------------------------
        cv_overage     = max(0, cv_usage     - effective_cv_limit)
        nvites_overage = max(0, nvites_usage - effective_nvites_limit)
        jobs_overage   = max(0, jobs_usage   - effective_jobs_limit)

        if cv_overage <= 0 and nvites_overage <= 0 and jobs_overage <= 0:
            continue

        # --------------------------------------------------
        # Check for existing invoice (skip duplicates)
        # --------------------------------------------------
        existing = (
            db.query(Invoice)
            .filter(
                Invoice.team_id        == team.id,
                Invoice.financial_year == financial_year,
                Invoice.invoice_type   == "overage",
            )
            .first()
        )
        if existing:
            continue

        # --------------------------------------------------
        # Rounding rules
        # --------------------------------------------------
        billed_cv     = math.ceil(cv_overage     / 1000)  * 1000 if cv_overage     > 0 else 0
        billed_nvites = math.ceil(nvites_overage / 10000) * 10000 if nvites_overage > 0 else 0
        billed_jobs   = math.ceil(jobs_overage   / 100)   * 100  if jobs_overage   > 0 else 0

        # --------------------------------------------------
        # Amounts  (rates from pricing plan ideally,
        #           using locked overage rates here)
        # --------------------------------------------------
        cv_amount     = billed_cv     * 10
        nvites_amount = billed_nvites * 0.5
        jobs_amount   = billed_jobs   * 50

        amount = cv_amount + nvites_amount + jobs_amount
        gst    = round(amount * 0.18, 2)
        total  = round(amount + gst, 2)

        # --------------------------------------------------
        # Create Invoice record
        # --------------------------------------------------
        invoice = Invoice(
            invoice_number=(
                f"INV-{financial_year}-{team.id}-"
                f"{int(datetime.now().timestamp())}"
            ),
            partner_name   = team.name,
            financial_year = financial_year,
            team_id        = team.id,
            invoice_date   = datetime.now(),
            amount         = amount,
            gst_amount     = gst,
            total_amount   = total,
            due_date       = datetime.now() + timedelta(days=7),
            payment_status = "unpaid",
            invoice_type   = "overage",
            notes=(
                f"CV: {cv_usage} used / {effective_cv_limit} limit / "
                f"{cv_overage} overage / {billed_cv} billed; "
                f"NVites: {nvites_usage} used / {effective_nvites_limit} limit / "
                f"{nvites_overage} overage / {billed_nvites} billed; "
                f"Jobs: {jobs_usage} used / {effective_jobs_limit} limit / "
                f"{jobs_overage} overage / {billed_jobs} billed"
            ),
        )

        db.add(invoice)
        db.flush()

        # --------------------------------------------------
        # Generate PDF
        # --------------------------------------------------
        items = [
            {"name": "CV Access Overage",   "qty": billed_cv,     "rate": 10,  "amount": cv_amount},
            {"name": "NVites Overage",       "qty": billed_nvites, "rate": 0.5, "amount": nvites_amount},
            {"name": "Job Posting Overage",  "qty": billed_jobs,   "rate": 50,  "amount": jobs_amount},
        ]

        try:
            pdf_path = generate_invoice_pdf(invoice, items)
            invoice.pdf_path = pdf_path
            print(f"✅ PDF: {pdf_path}")
        except FileNotFoundError as exc:
            print(f"❌ PDF missing assets — {team.name}: {exc}")
            invoice.pdf_path = None
        except Exception as exc:
            print(f"❌ PDF error — {team.name}: {exc}")
            import traceback; traceback.print_exc()
            invoice.pdf_path = None

        generated.append({
            "partner_name":   team.name,
            "amount":         total,
            "cv_overage":     cv_overage,     "cv_billed":     billed_cv,
            "nvites_overage": nvites_overage, "nvites_billed": billed_nvites,
            "jobs_overage":   jobs_overage,   "jobs_billed":   billed_jobs,
        })

    db.commit()

    return {
        "status":    "success",
        "generated": generated,
    }


# =====================================================
# UPDATE PAYMENT STATUS
# =====================================================

@router.patch("/{invoice_id}/payment")
def update_payment_status(
    invoice_id: int,
    status: str,
    notes: str = "",
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice.payment_status = status
    invoice.notes = notes or invoice.notes

    if status == "paid":
        invoice.payment_date = datetime.now()
    else:
        invoice.payment_date = None

    db.commit()
    return {"status": "success"}


# =====================================================
# DELETE INVOICE  (and its PDF)
# =====================================================

@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Delete local PDF if it's a local path (not a Supabase URL)
    pdf = invoice.pdf_path or ""
    if pdf.startswith("/static/invoices/"):
        local_path = os.path.join(BASE_DIR, pdf.lstrip("/"))
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
                print(f"[delete_invoice] Removed local PDF: {local_path}")
        except Exception as exc:
            print(f"[delete_invoice] Could not remove PDF: {exc}")

    db.delete(invoice)
    db.commit()
    return {"status": "success", "deleted_id": invoice_id}


# =====================================================
# DELETE ALL INVOICES FOR A FINANCIAL YEAR
# =====================================================

@router.delete("/bulk/by-year")
def delete_invoices_by_year(
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Delete ALL invoices for a given financial year.
    Use this to clean up erroneously generated invoices (e.g. for 2026-2027).
    """
    invoices = (
        db.query(Invoice)
        .filter(Invoice.financial_year == financial_year)
        .all()
    )

    deleted_count = 0
    for invoice in invoices:
        # Remove local PDF
        pdf = invoice.pdf_path or ""
        if pdf.startswith("/static/invoices/"):
            local_path = os.path.join(BASE_DIR, pdf.lstrip("/"))
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
            except Exception:
                pass

        db.delete(invoice)
        deleted_count += 1

    db.commit()

    return {
        "status":  "success",
        "message": f"Deleted {deleted_count} invoice(s) for FY {financial_year}",
        "deleted": deleted_count,
    }


# =====================================================
# DOWNLOAD / OPEN INVOICE PDF
# =====================================================

@router.get("/{invoice_id}/download")
def download_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if not invoice.pdf_path:
        raise HTTPException(status_code=404, detail="PDF not generated yet")

    pdf = invoice.pdf_path

    # --------------------------------------------------
    # Case 1: Supabase public URL — redirect the browser
    # --------------------------------------------------
    if pdf.startswith("https://"):
        return RedirectResponse(url=pdf)

    # --------------------------------------------------
    # Case 2: Local static path  /static/invoices/<file>
    # --------------------------------------------------
    local_path = os.path.join(BASE_DIR, pdf.lstrip("/"))

    if not os.path.exists(local_path):
        raise HTTPException(
            status_code=404,
            detail=(
                "PDF file not found on disk. "
                "It may have been deleted. "
                "Please regenerate the invoice."
            ),
        )

    return FileResponse(
        path=local_path,
        filename=os.path.basename(local_path),
        media_type="application/pdf",
    )
