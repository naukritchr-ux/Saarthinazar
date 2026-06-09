import os
import math
import json

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invoice import Invoice
from app.models.team import Team
from app.models.usage import SubUserUsage
from app.models.topup import TopUp

from app.services.invoice_pdf_generator import generate_invoice_pdf

router = APIRouter(prefix="/invoices")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))


# ── GET all invoices for a FY ─────────────────────────────────────────────────

@router.get("")
def get_invoices(financial_year: str = Query(...), db: Session = Depends(get_db)):
    # Primary: all invoices tagged with this FY
    fy_invoices = (
        db.query(Invoice)
        .filter(Invoice.financial_year == financial_year)
        .order_by(Invoice.created_at.desc())
        .all()
    )

    # Secondary: topup invoices for teams that have usage/topups in this FY
    # (catches topup invoices saved with wrong FY due to team.financial_year mismatch)
    usage_team_ids = {
        r.team_id for r in db.query(SubUserUsage.team_id)
        .filter(SubUserUsage.financial_year == financial_year).distinct().all()
    }

    topup_any_fy: list[Invoice] = []
    if usage_team_ids:
        topup_any_fy = (
            db.query(Invoice)
            .filter(
                Invoice.invoice_type == "topup",
                Invoice.team_id.in_(usage_team_ids),
            )
            .all()
        )

    seen: set[int] = set()
    merged: list[Invoice] = []
    for inv in list(fy_invoices) + list(topup_any_fy):
        if inv.id not in seen:
            seen.add(inv.id)
            merged.append(inv)

    def _pd(inv: Invoice):
        try:
            return json.loads(inv.partner_details) if inv.partner_details else {}
        except Exception:
            return {}

    return [
        {
            "id":             inv.id,
            "invoice_number": inv.invoice_number,
            "partner_name":   inv.partner_name,
            "amount":         float(inv.amount or 0),
            "gst_amount":     float(inv.gst_amount or 0),
            "total_amount":   float(inv.total_amount or 0),
            "paid_amount":    float(inv.paid_amount or 0),
            "payment_status": inv.payment_status,
            "invoice_type":   inv.invoice_type or "overage",
            "invoice_date":   inv.invoice_date.isoformat()  if inv.invoice_date  else None,
            "due_date":       inv.due_date.isoformat()      if inv.due_date      else None,
            "payment_date":   inv.payment_date.isoformat()  if inv.payment_date  else None,
            "pdf_path":       inv.pdf_path,
            "notes":          inv.notes or "",
            "partner_details": _pd(inv),
        }
        for inv in merged
    ]


# ── REPAIR: fix topup invoice FY mismatches ───────────────────────────────────

@router.post("/repair-topup-fy")
def repair_topup_financial_years(db: Session = Depends(get_db)):
    """
    One-shot repair: for every topup Invoice whose financial_year doesn't match
    its TopUp record's financial_year, correct the invoice FY.
    Safe to call multiple times.
    """
    from app.models.topup import TopUp

    topup_invoices = (
        db.query(Invoice)
        .filter(Invoice.invoice_type == "topup")
        .all()
    )

    fixed = []
    for inv in topup_invoices:
        topups = (
            db.query(TopUp)
            .filter(TopUp.team_id == inv.team_id)
            .order_by(TopUp.created_at.desc())
            .all()
        )
        if not topups:
            continue

        correct_fy = topups[0].financial_year
        if inv.financial_year != correct_fy:
            fixed.append({"invoice_id": inv.id, "old_fy": inv.financial_year, "new_fy": correct_fy})
            inv.financial_year = correct_fy

    db.commit()
    return {
        "status":  "success",
        "fixed":   len(fixed),
        "message": f"Fixed FY on {len(fixed)} topup invoice(s).",
        "detail":  fixed,
    }


# ── PREFLIGHT ─────────────────────────────────────────────────────────────────

@router.get("/preflight")
def preflight_check(financial_year: str = Query(...), db: Session = Depends(get_db)):
    """
    Returns ONLY teams that need attention:
      - Teams with a pending invoice (overage detected but not yet generated), OR
      - Teams with at least one generated invoice that is not fully paid.

    Teams where all invoices are paid, or that have no billable items,
    are excluded — they do not appear in the Invoice Queue.
    """
    team_ids_with_usage = {
        row.team_id
        for row in db.query(SubUserUsage.team_id)
        .filter(SubUserUsage.financial_year == financial_year)
        .distinct().all()
    }
    team_ids_with_topups = {
        row.team_id
        for row in db.query(TopUp.team_id)
        .filter(TopUp.financial_year == financial_year)
        .distinct().all()
    }
    all_relevant_team_ids = team_ids_with_usage | team_ids_with_topups
    if not all_relevant_team_ids:
        return {"teams_preview": [], "warnings": [], "team_count": 0}

    teams = db.query(Team).filter(Team.id.in_(all_relevant_team_ids)).order_by(Team.name).all()

    # Bulk-load usage totals
    usage_rows = (
        db.query(
            SubUserUsage.team_id,
            func.sum(SubUserUsage.cv_usage).label("cv"),
            func.sum(SubUserUsage.nvites_usage).label("nvites"),
            func.sum(SubUserUsage.jobs_usage).label("jobs"),
        )
        .filter(SubUserUsage.financial_year == financial_year)
        .group_by(SubUserUsage.team_id)
        .all()
    )
    usage_map = {r.team_id: r for r in usage_rows}

    # Bulk-load topup totals
    topup_rows = (
        db.query(
            TopUp.team_id,
            func.sum(TopUp.cv_topup).label("cv"),
            func.sum(TopUp.nvites_topup).label("nvites"),
            func.sum(TopUp.jobs_topup).label("jobs"),
        )
        .filter(TopUp.financial_year == financial_year)
        .group_by(TopUp.team_id)
        .all()
    )
    topup_map = {r.team_id: r for r in topup_rows}

    # Bulk-load invoices (with topup-FY-mismatch workaround)
    fy_invoices = (
        db.query(Invoice)
        .filter(
            Invoice.financial_year == financial_year,
            Invoice.team_id.in_(all_relevant_team_ids),
        )
        .all()
    )
    topup_invoices_any_fy = (
        db.query(Invoice)
        .filter(
            Invoice.invoice_type == "topup",
            Invoice.team_id.in_(all_relevant_team_ids),
        )
        .all()
    )
    seen_ids: set[int] = set()
    all_invoices: list[Invoice] = []
    for inv in list(fy_invoices) + list(topup_invoices_any_fy):
        if inv.id not in seen_ids:
            seen_ids.add(inv.id)
            all_invoices.append(inv)

    inv_by_team: dict[int, list] = {}
    for inv in all_invoices:
        inv_by_team.setdefault(inv.team_id, []).append(inv)

    teams_preview = []
    warnings = []

    for team in teams:
        u = usage_map.get(team.id)
        t = topup_map.get(team.id)

        cv_usage     = int(getattr(u, "cv",     0) or 0)
        nvites_usage = int(getattr(u, "nvites", 0) or 0)
        jobs_usage   = int(getattr(u, "jobs",   0) or 0)

        cv_limit     = int(team.cv_limit     or 0) + int(getattr(t, "cv",     0) or 0)
        nvites_limit = int(team.nvites_limit or 0) + int(getattr(t, "nvites", 0) or 0)
        jobs_limit   = int(team.jobs_limit   or 0) + int(getattr(t, "jobs",   0) or 0)

        cv_ov     = max(0, cv_usage     - cv_limit)
        nvites_ov = max(0, nvites_usage - nvites_limit)
        jobs_ov   = max(0, jobs_usage   - jobs_limit)
        has_overage = cv_ov > 0 or nvites_ov > 0 or jobs_ov > 0

        licence_fee   = float(team.licence_fee or 0)
        team_invoices = inv_by_team.get(team.id, [])

        # ── If a COMBINED invoice exists, show it as a single row ─────
        combined_inv = next((i for i in team_invoices if i.invoice_type == "combined"), None)
        if combined_inv:
            outstanding = (
                max(0, _effective_total(combined_inv) - float(combined_inv.paid_amount or 0))
                if combined_inv.payment_status != "paid" else 0
            )
            # Always include — even fully paid teams should appear in the list

            missing = _missing_fields(team)
            if missing:
                warnings.append({"team_id": team.id, "team_name": team.name, "missing_fields": missing})

            teams_preview.append({
                "team_id":        team.id,
                "team_name":      team.name,
                "partner_name":   team.partner_name or "",
                "partner_email":  team.partner_email or "",
                "address":        team.address or "",
                "phone":          team.phone or "",
                "gstin":          team.gstin or "",
                "state_code":     team.state_code or "",
                "missing_fields": missing,
                "invoice_rows": [{
                    "type":      "combined",
                    "label":     "Invoice (Licence + Topups + Overage)",
                    "subtotal":  float(combined_inv.amount or 0),
                    "gst":       float(combined_inv.gst_amount or 0),
                    "total":     _effective_total(combined_inv),
                    "generated": True,
                    "invoice":   _inv_summary(combined_inv),
                }],
                "has_pending":  False,
                "total_amount": _effective_total(combined_inv),
                "outstanding":  outstanding,
            })
            continue

        # ── Build rows for teams without a combined invoice yet ───────
        invoice_rows = []

        # Licence fee row
        if licence_fee > 0:
            lf_sub = licence_fee
            lf_gst = round(lf_sub * 0.18, 2)
            lf_tot = round(lf_sub + lf_gst, 2)
            lf_inv = next((i for i in team_invoices if i.invoice_type == "licence_fee"), None)
            invoice_rows.append({
                "type":      "licence_fee",
                "label":     "Licence Fee",
                "subtotal":  lf_sub,
                "gst":       lf_gst,
                "total":     lf_tot,
                "generated": lf_inv is not None,
                "invoice":   _inv_summary(lf_inv),
            })

        # Topup rows — only when no combined invoice
        for ti in [i for i in team_invoices if i.invoice_type == "topup"]:
            invoice_rows.append({
                "type":      "topup",
                "label":     "Top-Up",
                "subtotal":  float(ti.amount or 0),
                "gst":       float(ti.gst_amount or 0),
                "total":     _effective_total(ti),
                "generated": True,
                "invoice":   _inv_summary(ti),
            })

        # Overage row
        if has_overage:
            b_cv     = math.ceil(cv_ov / 1000)     * 1000   if cv_ov     > 0 else 0
            b_nvites = math.ceil(nvites_ov / 10000) * 10000  if nvites_ov > 0 else 0
            b_jobs   = math.ceil(jobs_ov / 100)    * 100    if jobs_ov   > 0 else 0
            ov_sub   = (b_cv * 10) + (b_nvites * 0.5) + (b_jobs * 50)
            ov_gst   = round(ov_sub * 0.18, 2)
            ov_tot   = round(ov_sub + ov_gst, 2)
            ov_inv   = next((i for i in team_invoices if i.invoice_type == "overage"), None)
            invoice_rows.append({
                "type":      "overage",
                "label":     "Usage Overage",
                "subtotal":  ov_sub,
                "gst":       ov_gst,
                "total":     ov_tot,
                "generated": ov_inv is not None,
                "invoice":   _inv_summary(ov_inv),
            })

        missing = _missing_fields(team)
        if missing:
            warnings.append({"team_id": team.id, "team_name": team.name, "missing_fields": missing})

        has_pending = any(not r["generated"] for r in invoice_rows)
        outstanding = sum(
            max(0, _effective_total_dict(r) - (r["invoice"]["paid_amount"] if r["invoice"] else 0))
            for r in invoice_rows
            if r["generated"] and r["invoice"] and r["invoice"]["payment_status"] != "paid"
        )
        any_invoice = any(r["generated"] and r["invoice"] for r in invoice_rows)

        # Include team regardless — caller sees all teams for this FY
        # (previously skipped fully-paid / no-outstanding teams, causing them to disappear)
        teams_preview.append({
            "team_id":        team.id,
            "team_name":      team.name,
            "partner_name":   team.partner_name or "",
            "partner_email":  team.partner_email or "",
            "address":        team.address or "",
            "phone":          team.phone or "",
            "gstin":          team.gstin or "",
            "state_code":     team.state_code or "",
            "missing_fields": missing,
            "invoice_rows":   invoice_rows,
            "has_pending":    has_pending,
            "total_amount":   sum(r["total"] for r in invoice_rows),
            "outstanding":    outstanding,
        })

    return {
        "teams_preview": teams_preview,
        "warnings":      warnings,
        "team_count":    len(teams_preview),
    }


# ── GENERATE — all teams ──────────────────────────────────────────────────────

@router.post("/generate")
def generate_invoices(financial_year: str = Query(...), db: Session = Depends(get_db)):
    teams = _get_all_fy_teams(db, financial_year)
    if not teams:
        return {"status": "success", "generated": [], "count": 0, "message": f"No teams found for FY {financial_year}."}

    generated = []
    for team in teams:
        result = _generate_for_team(team, financial_year, db)
        generated.extend(result)

    db.commit()
    return {"status": "success", "generated": generated, "count": len(generated)}


# ── GENERATE — single team ────────────────────────────────────────────────────

@router.post("/generate/{team_id}")
def generate_for_team(team_id: int, financial_year: str = Query(...), db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    generated = _generate_for_team(team, financial_year, db)
    db.commit()
    return {"status": "success", "generated": generated, "count": len(generated)}


# ── CONTACT UPDATE ────────────────────────────────────────────────────────────

@router.patch("/teams/{team_id}/contact")
def update_team_contact(team_id: int, payload: dict, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    allowed = {"partner_name", "partner_email", "phone", "address", "gstin", "state_code"}
    for key in allowed:
        if key in payload and payload[key] is not None:
            setattr(team, key, str(payload[key]).strip())

    db.commit()
    db.refresh(team)

    return {
        "status":         "success",
        "team_id":        team.id,
        "partner_name":   team.partner_name,
        "partner_email":  team.partner_email,
        "phone":          team.phone,
        "address":        team.address,
        "gstin":          team.gstin,
        "state_code":     team.state_code,
        "missing_fields": _missing_fields(team),
    }


# ── PAYMENT STATUS UPDATE ─────────────────────────────────────────────────────

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

    if status not in ("paid", "partial", "unpaid"):
        raise HTTPException(status_code=400, detail="status must be paid, partial, or unpaid")

    invoice.payment_status = status
    invoice.status         = status

    if notes:
        invoice.notes = notes

    if status == "paid":
        invoice.paid_amount  = invoice.total_amount
        invoice.payment_date = datetime.now()
    elif status == "partial":
        invoice.paid_amount  = paid_amount
        invoice.payment_date = datetime.now()
    else:
        invoice.paid_amount  = 0
        invoice.payment_date = None

    db.commit()
    db.refresh(invoice)

    return {
        "status":         "success",
        "id":             invoice.id,
        "payment_status": invoice.payment_status,
        "paid_amount":    float(invoice.paid_amount or 0),
        "total_amount":   float(invoice.total_amount or 0),
        "payment_date":   invoice.payment_date.isoformat() if invoice.payment_date else None,
    }


# ── DETAILS UPDATE (Bill-To fields) ──────────────────────────────────────────

@router.patch("/{invoice_id}/details")
def update_invoice_details(invoice_id: int, payload: dict, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    existing: dict = {}
    if invoice.partner_details:
        try:
            existing = json.loads(invoice.partner_details)
        except Exception:
            existing = {}

    detail_fields = {"address", "city", "pincode", "gstin", "phone",
                     "email", "state_code", "candidate_name", "position",
                     "annual_remuneration", "date_of_joining", "due_date_detail"}

    if "partner_name" in payload and payload["partner_name"]:
        invoice.partner_name = str(payload["partner_name"]).strip()

    for key in detail_fields:
        if key in payload:
            existing[key] = str(payload[key]).strip() if payload[key] is not None else ""

    invoice.partner_details = json.dumps(existing)

    if "due_date" in payload and payload["due_date"]:
        try:
            invoice.due_date = datetime.fromisoformat(str(payload["due_date"]))
        except Exception:
            pass

    db.flush()
    items = _parse_items(invoice)
    try:
        invoice.pdf_path = generate_invoice_pdf(invoice, items)
    except Exception as exc:
        print(f"[details] PDF regen failed {invoice_id}: {exc}")

    db.commit()
    return {"status": "success", "partner_name": invoice.partner_name, "partner_details": existing, "pdf_path": invoice.pdf_path}


# ── DELETE ────────────────────────────────────────────────────────────────────

@router.delete("/{invoice_id}")
def delete_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    pdf = invoice.pdf_path or ""
    if pdf.startswith("/static/invoices/"):
        local = os.path.join(BASE_DIR, pdf.lstrip("/"))
        try:
            if os.path.exists(local):
                os.remove(local)
        except Exception as exc:
            print(f"[delete] Could not remove PDF: {exc}")

    db.delete(invoice)
    db.commit()
    return {"status": "success", "deleted_id": invoice_id}


@router.delete("/bulk/by-year")
def delete_invoices_by_year(financial_year: str = Query(...), db: Session = Depends(get_db)):
    invoices = db.query(Invoice).filter(Invoice.financial_year == financial_year).all()
    deleted = 0
    for inv in invoices:
        pdf = inv.pdf_path or ""
        if pdf.startswith("/static/invoices/"):
            local = os.path.join(BASE_DIR, pdf.lstrip("/"))
            try:
                if os.path.exists(local):
                    os.remove(local)
            except Exception:
                pass
        db.delete(inv)
        deleted += 1
    db.commit()
    return {"status": "success", "deleted": deleted}


# ── DOWNLOAD ──────────────────────────────────────────────────────────────────

@router.get("/{invoice_id}/download")
def download_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    pdf = invoice.pdf_path or ""

    if pdf.startswith("https://"):
        return RedirectResponse(url=pdf)

    if pdf.startswith("/static/invoices/"):
        local = os.path.join(BASE_DIR, pdf.lstrip("/"))
        if os.path.exists(local):
            fn = f"{invoice.invoice_number}.pdf"
            return FileResponse(path=local, filename=fn, media_type="application/pdf",
                                content_disposition_type="inline",
                                headers={"Content-Disposition": f'inline; filename="{fn}"'})

    # Regenerate
    items = _parse_items(invoice)
    try:
        new_path = generate_invoice_pdf(invoice, items)
        invoice.pdf_path = new_path
        db.commit()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}")

    if new_path.startswith("https://"):
        return RedirectResponse(url=new_path)

    local = os.path.join(BASE_DIR, new_path.lstrip("/"))
    if not os.path.exists(local):
        raise HTTPException(status_code=500, detail="PDF file not found after generation")

    fn = f"{invoice.invoice_number}.pdf"
    return FileResponse(path=local, filename=fn, media_type="application/pdf",
                        content_disposition_type="inline",
                        headers={"Content-Disposition": f'inline; filename="{fn}"'})


# ── INTERNAL HELPERS ──────────────────────────────────────────────────────────

def _get_all_fy_teams(db: Session, financial_year: str) -> list:
    usage_ids = {
        r.team_id for r in db.query(SubUserUsage.team_id)
        .filter(SubUserUsage.financial_year == financial_year).distinct().all()
    }
    topup_ids = {
        r.team_id for r in db.query(TopUp.team_id)
        .filter(TopUp.financial_year == financial_year).distinct().all()
    }
    all_ids = usage_ids | topup_ids
    if not all_ids:
        return []
    return db.query(Team).filter(Team.id.in_(all_ids)).order_by(Team.name).all()


def _generate_for_team(team: Team, financial_year: str, db: Session) -> list:
    """
    Generates ONE combined invoice per team per FY.
    Line items: Licence Fee + all Topups + Overage (if any).
    Idempotent — if a combined invoice already exists it is regenerated (PDF only).
    """
    generated = []

    usage = (
        db.query(
            func.sum(SubUserUsage.cv_usage).label("cv"),
            func.sum(SubUserUsage.nvites_usage).label("nvites"),
            func.sum(SubUserUsage.jobs_usage).label("jobs"),
        )
        .filter(SubUserUsage.team_id == team.id, SubUserUsage.financial_year == financial_year)
        .first()
    )
    topup_rows = (
        db.query(TopUp)
        .filter(TopUp.team_id == team.id, TopUp.financial_year == financial_year)
        .order_by(TopUp.created_at.asc())
        .all()
    )
    topup_sum = (
        db.query(
            func.sum(TopUp.cv_topup).label("cv"),
            func.sum(TopUp.nvites_topup).label("nvites"),
            func.sum(TopUp.jobs_topup).label("jobs"),
        )
        .filter(TopUp.team_id == team.id, TopUp.financial_year == financial_year)
        .first()
    )

    cv_usage     = int(getattr(usage,     "cv",     0) or 0)
    nvites_usage = int(getattr(usage,     "nvites", 0) or 0)
    jobs_usage   = int(getattr(usage,     "jobs",   0) or 0)
    cv_topup_tot = int(getattr(topup_sum, "cv",     0) or 0)
    nv_topup_tot = int(getattr(topup_sum, "nvites", 0) or 0)
    jb_topup_tot = int(getattr(topup_sum, "jobs",   0) or 0)

    cv_limit     = int(team.cv_limit     or 0) + cv_topup_tot
    nvites_limit = int(team.nvites_limit or 0) + nv_topup_tot
    jobs_limit   = int(team.jobs_limit   or 0) + jb_topup_tot

    cv_ov     = max(0, cv_usage     - cv_limit)
    nvites_ov = max(0, nvites_usage - nvites_limit)
    jobs_ov   = max(0, jobs_usage   - jobs_limit)

    licence_fee = float(team.licence_fee or 0)

    existing_combined = db.query(Invoice).filter(
        Invoice.team_id        == team.id,
        Invoice.financial_year == financial_year,
        Invoice.invoice_type   == "combined",
    ).first()

    if existing_combined:
        if not existing_combined.pdf_path:
            try:
                existing_combined.pdf_path = generate_invoice_pdf(existing_combined, _parse_items(existing_combined))
                db.flush()
                generated.append({"partner_name": team.name, "action": "pdf_added", "type": "combined",
                                   "amount": _effective_total(existing_combined)})
            except Exception as exc:
                print(f"[gen] Combined PDF regen {team.name}: {exc}")
        return generated

    # Build line items
    items: list[dict] = []
    section_notes: list[str] = []

    if licence_fee > 0:
        items.append({
            "name":   "Annual Naukri Licence Fee",
            "qty":    team.licences or 1,
            "rate":   round(licence_fee / max(team.licences or 1, 1), 2),
            "amount": licence_fee,
        })
        section_notes.append(f"Licence fee: {team.licences or 1} licence(s) × {team.join_period}")

    for tu in topup_rows:
        if (tu.cv_topup or 0) > 0:
            sub = (tu.cv_topup or 0) * 10
            items.append({"name": "CV Access Top-Up",    "qty": tu.cv_topup    or 0, "rate": 10,  "amount": sub})
        if (tu.nvites_topup or 0) > 0:
            sub = (tu.nvites_topup or 0) * 0.5
            items.append({"name": "NVites Top-Up",       "qty": tu.nvites_topup or 0, "rate": 0.5, "amount": sub})
        if (tu.jobs_topup or 0) > 0:
            sub = (tu.jobs_topup or 0) * 50
            items.append({"name": "Job Postings Top-Up", "qty": tu.jobs_topup  or 0, "rate": 50,  "amount": sub})
        section_notes.append(
            f"Top-up on {tu.purchase_date.strftime('%d %b %Y') if tu.purchase_date else 'N/A'}: "
            f"CV +{tu.cv_topup or 0}, NVites +{tu.nvites_topup or 0}, Jobs +{tu.jobs_topup or 0}"
        )

    b_cv     = math.ceil(cv_ov / 1000)     * 1000  if cv_ov     > 0 else 0
    b_nvites = math.ceil(nvites_ov / 10000) * 10000 if nvites_ov > 0 else 0
    b_jobs   = math.ceil(jobs_ov / 100)    * 100   if jobs_ov   > 0 else 0
    if b_cv     > 0: items.append({"name": "CV Access Overage",   "qty": b_cv,     "rate": 10,  "amount": b_cv * 10})
    if b_nvites > 0: items.append({"name": "NVites Overage",      "qty": b_nvites, "rate": 0.5, "amount": b_nvites * 0.5})
    if b_jobs   > 0: items.append({"name": "Job Posting Overage", "qty": b_jobs,   "rate": 50,  "amount": b_jobs * 50})
    if cv_ov > 0 or nvites_ov > 0 or jobs_ov > 0:
        section_notes.append(
            f"Overage — CV: {cv_usage}/{cv_limit} ({cv_ov} over, {b_cv} billed); "
            f"NVites: {nvites_usage}/{nvites_limit} ({nvites_ov} over, {b_nvites} billed); "
            f"Jobs: {jobs_usage}/{jobs_limit} ({jobs_ov} over, {b_jobs} billed)"
        )

    if not items:
        return generated

    sub_total    = sum(float(it["amount"]) for it in items)
    gst_amount   = round(sub_total * 0.18, 2)
    total_amount = round(sub_total + gst_amount, 2)

    partner_details = json.dumps({
        "address":    getattr(team, "address",       "") or "",
        "phone":      getattr(team, "phone",         "") or "",
        "gstin":      getattr(team, "gstin",         "") or "",
        "state_code": getattr(team, "state_code",    "") or "",
        "email":      getattr(team, "partner_email", "") or "",
    })

    inv = Invoice(
        invoice_number  = _make_inv_number(financial_year, team.id, "CMB"),
        partner_name    = team.name,
        financial_year  = financial_year,
        team_id         = team.id,
        invoice_date    = datetime.now(),
        due_date        = datetime.now() + timedelta(days=7),
        amount          = sub_total,
        gst_amount      = gst_amount,
        total_amount    = total_amount,
        paid_amount     = 0,
        payment_status  = "unpaid",
        status          = "unpaid",
        invoice_type    = "combined",
        notes           = "; ".join(section_notes),
        items_json      = json.dumps(items),
        partner_details = partner_details,
    )
    db.add(inv)
    db.flush()

    try:
        inv.pdf_path = generate_invoice_pdf(inv, items)
        db.flush()
    except Exception as exc:
        print(f"[gen] PDF failed {team.name}: {exc}")
        inv.pdf_path = None

    generated.append({
        "partner_name": team.name,
        "action":       "created",
        "type":         "combined",
        "amount":       total_amount,
        "items":        len(items),
    })
    return generated


def _make_inv_number(financial_year: str, team_id: int, prefix: str = "INV") -> str:
    fy_short = financial_year.replace("-", "")
    ts       = int(datetime.now().timestamp())
    return f"{prefix}-{fy_short}-{team_id}-{ts}"


def _effective_total(inv: Invoice) -> float:
    if inv is None:
        return 0.0
    total = float(inv.total_amount or 0)
    return total if total > 0 else float(inv.amount or 0)


def _effective_total_dict(row: dict) -> float:
    if not row.get("invoice"):
        return float(row.get("total", 0))
    inv = row["invoice"]
    t = float(inv.get("total_amount", 0) or 0)
    return t if t > 0 else float(inv.get("amount", 0) or 0)


def _inv_summary(inv) -> dict | None:
    if inv is None:
        return None
    return {
        "id":             inv.id,
        "invoice_number": inv.invoice_number,
        "pdf_path":       inv.pdf_path,
        "payment_status": inv.payment_status or "unpaid",
        "paid_amount":    float(inv.paid_amount or 0),
        "total_amount":   _effective_total(inv),
    }


def _missing_fields(team: Team) -> list[str]:
    missing = []
    if not (getattr(team, "phone",         "") or "").strip(): missing.append("Phone")
    if not (getattr(team, "address",       "") or "").strip(): missing.append("Address")
    if not (getattr(team, "partner_email", "") or "").strip(): missing.append("Email")
    return missing


def _parse_items(invoice: Invoice) -> list:
    if invoice.items_json:
        try:
            stored = json.loads(invoice.items_json)
            if stored and isinstance(stored, list):
                return [{
                    "name":   it.get("label") or it.get("name") or "Item",
                    "qty":    int(it.get("qty") or 1),
                    "rate":   float(it.get("rate") or it.get("amount") or 0),
                    "amount": float(it.get("amount") or 0),
                } for it in stored]
        except Exception:
            pass

    notes = invoice.notes or ""
    items = []
    try:
        for seg in [s.strip() for s in notes.split(";") if s.strip()]:
            for key, rate, name in [
                ("CV", 10, "CV Access Overage"),
                ("NVites", 0.5, "NVites Overage"),
                ("Jobs", 50, "Job Posting Overage"),
            ]:
                if seg.startswith(key + ":"):
                    parts  = seg.split("/")
                    billed = int(parts[3].replace("billed", "").strip()) if len(parts) > 3 else 0
                    if billed > 0:
                        items.append({"name": name, "qty": billed, "rate": rate, "amount": billed * rate})
    except Exception:
        pass

    if not items:
        items = [{"name": invoice.invoice_type or "Invoice", "qty": 1, "rate": float(invoice.amount or 0), "amount": float(invoice.amount or 0)}]

    return items
