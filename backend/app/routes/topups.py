from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.financial_year import FinancialYear
from app.models.invoice import Invoice
from app.models.team import Team
from app.models.topup import TopUp
from app.services.naukri_rules import add_audit, create_invoice, parse_date, team_limits

router = APIRouter(prefix="/topups")


# =====================================================
# HELPER — resolve financial year
# =====================================================

def _resolve_fy(requested: str | None, db: Session) -> str:
    if requested and requested.strip():
        return requested.strip()

    active = (
        db.query(FinancialYear)
        .filter(FinancialYear.is_active == True)
        .first()
    )
    if active:
        return active.label

    from datetime import date
    today = date.today()
    if today.month >= 4:
        return f"{today.year}-{today.year + 1}"
    return f"{today.year - 1}-{today.year}"


# =====================================================
# LIST TOPUPS
# =====================================================

@router.get("/")
def list_topups(
    financial_year: str | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(TopUp).order_by(TopUp.created_at.desc())
    if financial_year:
        query = query.filter(TopUp.financial_year == financial_year)
    return [
        {
            "id":            item.id,
            "team_id":       item.team_id,
            "team_name":     item.team_name,
            "cv_topup":      item.cv_topup      or 0,
            "nvites_topup":  item.nvites_topup  or 0,
            "jobs_topup":    item.jobs_topup     or 0,
            "amount":        item.amount         or 0,
            "subtotal":      item.subtotal       or 0,
            "gst_amount":    item.gst_amount     or 0,
            "financial_year": item.financial_year or "",
            "purchase_date": item.purchase_date.isoformat() if item.purchase_date else None,
            "added_by":      item.added_by,
            "created_at":    item.created_at.isoformat() if item.created_at else None,
        }
        for item in query.all()
    ]


# =====================================================
# CREATE TOPUP
# =====================================================

@router.post("/")
def create_topup(
    payload: dict,
    db: Session = Depends(get_db)
):
    # ── FIND TEAM ──────────────────────────────────────
    team = None

    if payload.get("team_id"):
        team = db.query(Team).filter(Team.id == payload["team_id"]).first()

    if not team and payload.get("team_name"):
        team = db.query(Team).filter(Team.name == payload["team_name"]).first()

    if not team:
        return {"status": "error", "message": "Team not found"}

    # ── RESOLVE FINANCIAL YEAR ─────────────────────────
    fy = _resolve_fy(payload.get("financial_year"), db)

    # ── QUANTITIES ────────────────────────────────────
    cv_topup     = int(payload.get("cv_topup")     or 0)
    nvites_topup = int(payload.get("nvites_topup") or 0)
    jobs_topup   = int(payload.get("jobs_topup")   or 0)

    # ── AUTO-CALCULATE AMOUNTS ────────────────────────
    cv_total     = cv_topup     * 10
    nvites_total = nvites_topup * 0.5
    jobs_total   = jobs_topup   * 50

    subtotal   = cv_total + nvites_total + jobs_total
    gst_amount = round(subtotal * 0.18, 2)
    auto_total = round(subtotal + gst_amount, 2)

    # Manual override: if caller supplies an explicit amount, use it
    final_total = float(payload.get("amount") or auto_total)

    # ── CREATE TOPUP RECORD ───────────────────────────
    topup = TopUp(
        team_id=team.id,
        team_name=team.name,
        financial_year=fy,
        cv_topup=cv_topup,
        nvites_topup=nvites_topup,
        jobs_topup=jobs_topup,
        amount=final_total,
        subtotal=subtotal,
        gst_amount=gst_amount,
        purchase_date=(
            parse_date(payload.get("purchase_date") or payload.get("date"))
            or datetime.utcnow()
        ),
        added_by=payload.get("added_by", "Kajal"),
    )
    db.add(topup)
    db.flush()

    # ── CREATE INVOICE ────────────────────────────────
    # Pass items with the keys that create_invoice() expects:
    #   subtotal  = pre-GST amount
    #   gst       = GST portion
    #   total     = total incl. GST
    # This ensures Invoice.amount, Invoice.gst_amount, and
    # Invoice.total_amount are all populated correctly.
    latest_invoice = None

    if final_total > 0:
        line_items = []
        if cv_topup > 0:
            cv_sub = cv_topup * 10
            line_items.append({
                "name":     "CV Access Top-Up",
                "qty":      cv_topup,
                "rate":     10,
                "subtotal": cv_sub,
                "gst":      round(cv_sub * 0.18, 2),
                "total":    round(cv_sub * 1.18, 2),
                "amount":   cv_sub,
            })
        if nvites_topup > 0:
            nv_sub = nvites_topup * 0.5
            line_items.append({
                "name":     "NVites Top-Up",
                "qty":      nvites_topup,
                "rate":     0.5,
                "subtotal": nv_sub,
                "gst":      round(nv_sub * 0.18, 2),
                "total":    round(nv_sub * 1.18, 2),
                "amount":   nv_sub,
            })
        if jobs_topup > 0:
            jb_sub = jobs_topup * 50
            line_items.append({
                "name":     "Job Postings Top-Up",
                "qty":      jobs_topup,
                "rate":     50,
                "subtotal": jb_sub,
                "gst":      round(jb_sub * 0.18, 2),
                "total":    round(jb_sub * 1.18, 2),
                "amount":   jb_sub,
            })

        # Fallback: if no individual items (shouldn't happen), use a single summary line
        if not line_items:
            line_items = [{
                "name":     "Inventory Top-Up",
                "qty":      1,
                "subtotal": subtotal,
                "gst":      gst_amount,
                "total":    final_total,
                "amount":   subtotal,
            }]

        created_invoice = create_invoice(
            db,
            team,
            "topup",
            line_items,
            actor=topup.added_by,
            notes=f"Inventory Top-Up: CV {cv_topup}, NVites {nvites_topup}, Jobs {jobs_topup}",
            financial_year=fy,
        )
        # Generate PDF immediately so it's downloadable from the Invoices page
        try:
            from app.services.invoice_pdf_generator import generate_invoice_pdf
            pdf_path = generate_invoice_pdf(created_invoice, line_items)
            created_invoice.pdf_path = pdf_path
        except Exception as exc:
            print(f"[topup] PDF generation failed for {team.name}: {exc}")

    # ── AUDIT LOG ─────────────────────────────────────
    add_audit(
        db,
        topup.added_by,
        "create_topup",
        "topup",
        topup.id,
        {**payload, "resolved_financial_year": fy},
    )

    db.commit()

    # ── FETCH LATEST INVOICE NUMBER ───────────────────
    if final_total > 0:
        invoice = db.query(Invoice).order_by(Invoice.id.desc()).first()
        if invoice:
            latest_invoice = invoice.invoice_number

    return {
        "status":         "success",
        "message":        "Topup added successfully",
        "topup_id":       topup.id,
        "team_name":      team.name,
        "financial_year": fy,
        "subtotal":       subtotal,
        "gst_amount":     gst_amount,
        "total_amount":   final_total,
        "new_limits": {
            "cv_limit":     team.cv_limit,
            "nvites_limit": team.nvites_limit,
            "jobs_limit":   team.jobs_limit,
        },
        "latest_invoice": latest_invoice,
    }
