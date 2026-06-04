import os
import math
import json

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

    def _parse_details(inv):
        try:
            return json.loads(inv.partner_details) if inv.partner_details else {}
        except Exception:
            return {}

    return [
        {
            "id":             invoice.id,
            "invoice_number": invoice.invoice_number,
            "partner_name":   invoice.partner_name,
            "amount":         float(invoice.amount or 0),
            "gst_amount":     float(invoice.gst_amount or 0),
            "total_amount":   float(invoice.total_amount or 0),
            "paid_amount":    float(invoice.paid_amount or 0),
            "payment_status": invoice.payment_status,
            "invoice_type":   invoice.invoice_type or "overage",
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
            "pdf_path":        invoice.pdf_path,
            "notes":           invoice.notes or "",
            "partner_details": _parse_details(invoice),
        }
        for invoice in invoices
    ]


# =====================================================
# PREFLIGHT CHECK — missing contact fields before generate
# =====================================================

@router.get("/preflight")
def preflight_check(
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):
    from sqlalchemy import func

    usage_rows = (
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

    warnings = []

    for row in usage_rows:
        team = db.query(Team).filter(Team.id == row.team_id).first()
        if not team:
            continue

        cv_overage     = max(0, int(row.cv_usage     or 0) - int(team.cv_limit     or 0))
        nvites_overage = max(0, int(row.nvites_usage or 0) - int(team.nvites_limit or 0))
        jobs_overage   = max(0, int(row.jobs_usage   or 0) - int(team.jobs_limit   or 0))

        if cv_overage <= 0 and nvites_overage <= 0 and jobs_overage <= 0:
            continue

        missing = []
        if not (getattr(team, "address",       "") or "").strip(): missing.append("Address")
        if not (getattr(team, "phone",         "") or "").strip(): missing.append("Phone")
        if not (getattr(team, "gstin",         "") or "").strip(): missing.append("GSTIN/UIN")
        if not (getattr(team, "state_code",    "") or "").strip(): missing.append("State Code")
        if not (getattr(team, "partner_email", "") or "").strip(): missing.append("Email")

        if missing:
            warnings.append({
                "team_id":        team.id,
                "team_name":      team.name,
                "missing_fields": missing,
            })

    return {"warnings": warnings}


# =====================================================
# GENERATE INVOICES
# =====================================================

@router.post("/generate")
def generate_invoices(
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):
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

    team_ids  = [row.team_id for row in usage_by_team]
    teams_map = {t.id: t for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}

    generated = []

    for row in usage_by_team:
        team = teams_map.get(row.team_id)
        if not team:
            continue

        cv_usage     = int(row.cv_usage     or 0)
        nvites_usage = int(row.nvites_usage or 0)
        jobs_usage   = int(row.jobs_usage   or 0)

        if cv_usage + nvites_usage + jobs_usage <= 0:
            continue

        cv_overage     = max(0, cv_usage     - int(team.cv_limit     or 0))
        nvites_overage = max(0, nvites_usage - int(team.nvites_limit or 0))
        jobs_overage   = max(0, jobs_usage   - int(team.jobs_limit   or 0))

        if cv_overage <= 0 and nvites_overage <= 0 and jobs_overage <= 0:
            continue

        existing = (
            db.query(Invoice)
            .filter(
                Invoice.team_id        == team.id,
                Invoice.financial_year == financial_year,
                Invoice.invoice_type   == "overage",
            )
            .first()
        )

        billed_cv     = math.ceil(cv_overage     / 1000)  * 1000  if cv_overage     > 0 else 0
        billed_nvites = math.ceil(nvites_overage / 10000) * 10000 if nvites_overage > 0 else 0
        billed_jobs   = math.ceil(jobs_overage   / 100)   * 100   if jobs_overage   > 0 else 0

        cv_amount     = billed_cv     * 10
        nvites_amount = billed_nvites * 0.5
        jobs_amount   = billed_jobs   * 50
        amount        = cv_amount + nvites_amount + jobs_amount
        gst           = round(amount * 0.18, 2)
        total         = round(amount + gst, 2)

        items = [
            {"name": "CV Access Overage",   "qty": billed_cv,     "rate": 10,  "amount": cv_amount},
            {"name": "NVites Overage",       "qty": billed_nvites, "rate": 0.5, "amount": nvites_amount},
            {"name": "Job Posting Overage",  "qty": billed_jobs,   "rate": 50,  "amount": jobs_amount},
        ]
        notes_str = (
            f"CV: {cv_usage} used / {int(team.cv_limit or 0)} limit / "
            f"{cv_overage} overage / {billed_cv} billed; "
            f"NVites: {nvites_usage} used / {int(team.nvites_limit or 0)} limit / "
            f"{nvites_overage} overage / {billed_nvites} billed; "
            f"Jobs: {jobs_usage} used / {int(team.jobs_limit or 0)} limit / "
            f"{jobs_overage} overage / {billed_jobs} billed"
        )

        # Build fresh contact snapshot from team (don't overwrite manually edited details)
        fresh_details = json.dumps({
            "address":    getattr(team, "address",       "") or "",
            "phone":      getattr(team, "phone",         "") or "",
            "gstin":      getattr(team, "gstin",         "") or "",
            "state_code": getattr(team, "state_code",    "") or "",
            "email":      getattr(team, "partner_email", "") or "",
        })

        if existing:
            amounts_broken = (
                not existing.gst_amount   or existing.gst_amount   == 0 or
                not existing.total_amount or existing.total_amount  == 0
            )
            if amounts_broken:
                existing.amount       = amount
                existing.gst_amount   = gst
                existing.total_amount = total
                existing.notes        = notes_str

            # Only overwrite partner_details from team if not already manually edited
            if not existing.partner_details:
                existing.partner_details = fresh_details

            db.flush()

            try:
                pdf_path = generate_invoice_pdf(existing, items)
                existing.pdf_path = pdf_path
                print(f"✅ Regenerated PDF for {team.name}: {pdf_path}")
            except Exception as exc:
                print(f"❌ PDF regen error — {team.name}: {exc}")
                import traceback; traceback.print_exc()

            generated.append({
                "partner_name": team.name,
                "action":       "fixed" if amounts_broken else "regenerated",
                "amount":       float(existing.total_amount or total),
            })
            continue

        invoice = Invoice(
            invoice_number  = f"INV-{financial_year}-{team.id}-{int(datetime.now().timestamp())}",
            partner_name    = team.name,
            financial_year  = financial_year,
            team_id         = team.id,
            invoice_date    = datetime.now(),
            amount          = amount,
            gst_amount      = gst,
            total_amount    = total,
            due_date        = datetime.now() + timedelta(days=7),
            payment_status  = "unpaid",
            invoice_type    = "overage",
            notes           = notes_str,
            partner_details = fresh_details,
        )
        db.add(invoice)
        db.flush()

        try:
            pdf_path = generate_invoice_pdf(invoice, items)
            invoice.pdf_path = pdf_path
            print(f"✅ PDF: {pdf_path}")
        except Exception as exc:
            print(f"❌ PDF error — {team.name}: {exc}")
            import traceback; traceback.print_exc()
            invoice.pdf_path = None

        generated.append({
            "partner_name":   team.name,
            "action":         "created",
            "amount":         total,
            "cv_overage":     cv_overage,     "cv_billed":     billed_cv,
            "nvites_overage": nvites_overage, "nvites_billed": billed_nvites,
            "jobs_overage":   jobs_overage,   "jobs_billed":   billed_jobs,
        })

    # Fix broken topup invoices
    for inv in db.query(Invoice).filter(
        Invoice.financial_year == financial_year,
        Invoice.invoice_type   == "topup",
    ).all():
        if (inv.gst_amount and inv.gst_amount > 0 and
                inv.total_amount and inv.total_amount > 0 and inv.pdf_path):
            continue
        raw = float(inv.amount or 0)
        if raw == 0:
            continue
        subtotal     = round(raw / 1.18, 2)
        gst_fix      = round(raw - subtotal, 2)
        inv.amount       = subtotal
        inv.gst_amount   = gst_fix
        inv.total_amount = raw
        db.flush()
        try:
            pdf_path = generate_invoice_pdf(inv, [{"name": "Inventory Top-Up", "qty": 1, "rate": subtotal, "amount": subtotal}])
            inv.pdf_path = pdf_path
            generated.append({"partner_name": inv.partner_name, "action": "topup_fixed", "amount": raw})
        except Exception as exc:
            print(f"❌ Topup PDF error: {exc}")

    db.commit()
    return {"status": "success", "generated": generated, "count": len(generated)}


# =====================================================
# UPDATE PAYMENT STATUS
# =====================================================

@router.patch("/{invoice_id}/payment")
def update_payment_status(
    invoice_id: int,
    status: str,
    paid_amount: float = 0,
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
        invoice.paid_amount  = invoice.total_amount
    elif status == "partial":
        invoice.paid_amount  = paid_amount
        invoice.payment_date = datetime.now()
    else:
        invoice.payment_date = None
        invoice.paid_amount  = 0

    db.commit()
    return {"status": "success"}


# =====================================================
# UPDATE INVOICE BILL-TO DETAILS  (Kajal / operations)
# Saves partner contact info and regenerates the PDF.
# Does NOT touch amounts, GST, or payment status.
# =====================================================

@router.patch("/{invoice_id}/details")
def update_invoice_details(
    invoice_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Load existing partner_details snapshot (or start fresh)
    existing_details: dict = {}
    if invoice.partner_details:
        try:
            existing_details = json.loads(invoice.partner_details)
        except Exception:
            existing_details = {}

    # Allowed detail fields (Bill To section only — no amounts, no status)
    detail_fields = {
        "address", "city", "pincode", "gstin", "phone",
        "email", "state_code", "candidate_name", "position",
        "annual_remuneration", "date_of_joining", "due_date_detail",
    }

    # Update top-level partner_name if provided
    if "partner_name" in payload and payload["partner_name"]:
        invoice.partner_name = str(payload["partner_name"]).strip()

    # Merge detail fields into the JSON snapshot
    for key in detail_fields:
        if key in payload:
            val = payload[key]
            existing_details[key] = str(val).strip() if val is not None else ""

    invoice.partner_details = json.dumps(existing_details)

    # Update due_date column if provided
    if "due_date" in payload and payload["due_date"]:
        try:
            invoice.due_date = datetime.fromisoformat(str(payload["due_date"]))
        except Exception:
            pass

    db.flush()

    # Regenerate PDF with the updated Bill To details
    items = _parse_items_from_invoice(invoice)
    try:
        new_pdf_path = generate_invoice_pdf(invoice, items)
        invoice.pdf_path = new_pdf_path
        print(f"[details] ✅ PDF regenerated for invoice {invoice_id}")
    except Exception as exc:
        import traceback; traceback.print_exc()
        print(f"[details] ⚠ PDF regen failed for invoice {invoice_id}: {exc}")

    db.commit()

    return {
        "status":          "success",
        "partner_name":    invoice.partner_name,
        "partner_details": existing_details,
        "pdf_path":        invoice.pdf_path,
    }


# =====================================================
# DELETE INVOICE
# =====================================================

@router.delete("/{invoice_id}")
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    pdf = invoice.pdf_path or ""
    if pdf.startswith("/static/invoices/"):
        local_path = os.path.join(BASE_DIR, pdf.lstrip("/"))
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
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
    invoices = db.query(Invoice).filter(Invoice.financial_year == financial_year).all()

    deleted_count = 0
    for invoice in invoices:
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
    return {"status": "success", "message": f"Deleted {deleted_count} invoice(s) for FY {financial_year}", "deleted": deleted_count}


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

    pdf = invoice.pdf_path or ""

    if pdf.startswith("https://"):
        return RedirectResponse(url=pdf)

    if pdf.startswith("/static/invoices/"):
        local_path = os.path.join(BASE_DIR, pdf.lstrip("/"))
        if os.path.exists(local_path):
            filename = f"{invoice.invoice_number}.pdf"
            return FileResponse(
                path=local_path,
                filename=filename,
                media_type="application/pdf",
                content_disposition_type="inline",
                headers={"Content-Disposition": f'inline; filename="{filename}"'},
            )

    # Auto-regenerate
    print(f"[download] Regenerating PDF for invoice {invoice_id} ({invoice.invoice_number})")
    items = _parse_items_from_invoice(invoice)

    try:
        new_pdf_path = generate_invoice_pdf(invoice, items)
        invoice.pdf_path = new_pdf_path
        db.commit()
    except Exception as exc:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(exc)}.")

    if new_pdf_path.startswith("https://"):
        return RedirectResponse(url=new_pdf_path)

    local_path = os.path.join(BASE_DIR, new_pdf_path.lstrip("/"))
    if not os.path.exists(local_path):
        raise HTTPException(status_code=500, detail="PDF generated but file not found on disk.")

    filename = f"{invoice.invoice_number}.pdf"
    return FileResponse(
        path=local_path,
        filename=filename,
        media_type="application/pdf",
        content_disposition_type="inline",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ── Helper ────────────────────────────────────────────────────────────
def _parse_items_from_invoice(invoice: Invoice) -> list:
    if invoice.items_json:
        try:
            stored = json.loads(invoice.items_json)
            if stored and isinstance(stored, list):
                return [{
                    "name":   it.get("label") or it.get("name") or "Top-Up",
                    "qty":    int(it.get("qty") or 1),
                    "rate":   float(it.get("rate") or it.get("subtotal") or it.get("amount") or 0),
                    "amount": float(it.get("subtotal") or it.get("amount") or 0),
                } for it in stored]
        except Exception:
            pass

    notes = invoice.notes or ""
    items = []
    try:
        for seg in [s.strip() for s in notes.split(";") if s.strip()]:
            for key, rate, name in [("CV", 10, "CV Access Overage"), ("NVites", 0.5, "NVites Overage"), ("Jobs", 50, "Job Posting Overage")]:
                if seg.startswith(key + ":"):
                    parts  = seg.split("/")
                    billed = int(parts[3].replace("billed", "").strip()) if len(parts) > 3 else 0
                    if billed > 0:
                        items.append({"name": name, "qty": billed, "rate": rate, "amount": billed * rate})
    except Exception:
        pass

    if not items:
        items = [{"name": invoice.invoice_type or "Overage", "qty": 0, "rate": 0, "amount": float(invoice.amount or 0)}]

    return items
