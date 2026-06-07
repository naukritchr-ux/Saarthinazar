import json
import math
import re
from datetime import date, datetime, timedelta
from typing import Iterable

from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import ALGORITHM, SECRET_KEY
from app.models.audit import AuditLog
from app.models.financial_year import FinancialYear
from app.models.invoice import Invoice
from app.models.pricing import PricingPlan
from app.models.report_upload import ReportUpload
from app.models.team import Team
from app.models.topup import TopUp
from app.models.usage import SubUserUsage
from app.services.inventory_engine import effective_limits

INVENTORY_TYPES = ("cv", "nvites", "jobs")
MASTER_NAUKRI_COST = 13000000

BILLING_RULES = {
    "cv": {"label": "CV Access", "rate": 10, "multiple": 1000},
    "nvites": {"label": "NVites", "rate": 0.5, "multiple": 10000},
    "jobs": {"label": "Job Postings", "rate": 50, "multiple": 100},
}

DEFAULT_PRICING = [
    ("Q1 (Apr-Jun)", "Early Renewal", 80000, 3000, 22500, 100),
    ("Q1 (Apr-Jun)", "New Partner", 80000, 3000, 22500, 100),
    ("Q1 (Apr-Jun)", "Late Existing Partner", 84000, 3000, 22500, 100),
    ("Q2 (Jul-Sep)", "New Partner", 65000, 3000, 22500, 100),
    ("Q2 (Jul-Sep)", "Returning Partner", 70000, 3000, 22500, 100),
    ("Oct-Nov", "New Partner", 48000, 2000, 11250, 70),
    ("Oct-Nov", "Returning Partner", 52000, 2000, 11250, 70),
    ("December", "All Partners", 0, 1000, 7500, 50),
    ("January", "All Partners", 15000, 750, 5000, 30),
    ("February", "All Partners", 0, 500, 2500, 20),
    ("March", "All Partners", 0, 250, 2500, 20),
]

# Staffing Pro stores BASE limits (3000, 22500, 100) — inventory engine multiplies by licences
DEFAULT_TEAMS = [
    ("Talent Corner", "Gauri Naik", "gauri.naik@talentcorner.in", 1, "Early Renewal", "Q1 (Apr-Jun)", 80000, 56000, 3000, 22500, 100),
    ("HR Solutions", "Amit Kumar", "amit.kumar@hrsolutions.in", 1, "New Partner", "Q1 (Apr-Jun)", 80000, 58000, 3000, 22500, 100),
    ("Staffing Pro", "Vikram Singh", "vikram.singh@staffingpro.in", 2, "New Partner", "Q1 (Apr-Jun)", 160000, 115000, 3000, 22500, 100),
    ("Global Recruit", "Deepak Reddy", "deepak.reddy@globalrecruit.in", 1, "Returning Partner", "Q2 (Jul-Sep)", 70000, 55000, 3000, 22500, 100),
    ("Smart Hire", "Neha Gupta", "neha.gupta@smarthire.in", 1, "New Partner", "Q1 (Apr-Jun)", 80000, 54000, 3000, 22500, 100),
]

DEFAULT_USAGE = [
    ("Talent Corner", "Gauri Naik", "gauri.naik@talentcorner.in", 1200, 8500, 35),
    ("Talent Corner", "Priya Sharma", "priya.sharma@talentcorner.in", 950, 5200, 28),
    ("Talent Corner", "Rahul Desai", "rahul.desai@talentcorner.in", 1000, 4300, 22),
    ("HR Solutions", "Amit Kumar", "amit.kumar@hrsolutions.in", 1100, 7500, 45),
    ("HR Solutions", "Sneha Patel", "sneha.patel@hrsolutions.in", 1100, 7500, 47),
    ("Staffing Pro", "Vikram Singh", "vikram.singh@staffingpro.in", 900, 6000, 30),
    ("Staffing Pro", "Anjali Mehta", "anjali.mehta@staffingpro.in", 900, 6000, 30),
    ("Global Recruit", "Deepak Reddy", "deepak.reddy@globalrecruit.in", 1300, 11000, 40),
    ("Global Recruit", "Kavita Joshi", "kavita.joshi@globalrecruit.in", 1200, 11050, 40),
    ("Smart Hire", "Neha Gupta", "neha.gupta@smarthire.in", 750, 5000, 28),
    ("Smart Hire", "Rohit Verma", "rohit.verma@smarthire.in", 750, 5000, 27),
]

DEFAULT_FINANCIAL_YEARS = [
    ("2024-2025", date(2024, 4, 1), date(2025, 3, 31), False),
    ("2025-2026", date(2025, 4, 1), date(2026, 3, 31), False),
    ("2026-2027", date(2026, 4, 1), date(2027, 3, 31), True),
]


def add_audit(db: Session, actor: str, action: str, entity_type: str, entity_id: str, details: dict | str = ""):
    db.add(
        AuditLog(
            actor=actor,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            details=json.dumps(details) if isinstance(details, dict) else str(details),
        )
    )


def get_current_user(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    return {"username": payload.get("username", ""), "role": payload.get("role", "")}


def require_owner(authorization: str | None) -> dict:
    user = get_current_user(authorization)
    if user["role"].lower() not in {"owner", "admin", "rashesh"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner access required")
    return user


def seed_defaults(db: Session):
    if db.query(FinancialYear).count() == 0:
        for label, start_date, end_date, is_active in DEFAULT_FINANCIAL_YEARS:
            db.add(FinancialYear(label=label, start_date=start_date, end_date=end_date, is_active=is_active))

    if db.query(PricingPlan).count() == 0:
        for period, partner_type, price, cv, nvites, jobs in DEFAULT_PRICING:
            db.add(PricingPlan(
                financial_year="2026-2027",
                period=period,
                partner_type=partner_type,
                licence_fee=price,
                cv_limit=cv,
                nvites_limit=nvites,
                jobs_limit=jobs,
                is_free_plan=(price == 0),
                created_by="system"
            ))

    if db.query(Team).count() == 0:
        for row in DEFAULT_TEAMS:
            db.add(
                Team(
                    name=row[0],
                    partner_name=row[1],
                    partner_email=row[2],
                    licences=row[3],
                    partner_type=row[4],
                    join_period=row[5],
                    licence_fee=row[6],
                    cost_share=row[7],
                    cv_limit=row[8],
                    nvites_limit=row[9],
                    jobs_limit=row[10],
                    is_active=True,
                )
            )
        db.flush()

    if db.query(TopUp).count() == 0:
        talent = db.query(Team).filter(Team.name == "Talent Corner").first()
        global_recruit = db.query(Team).filter(Team.name == "Global Recruit").first()
        if talent:
            db.add(TopUp(team_id=talent.id, team_name=talent.name, cv_topup=1000, nvites_topup=5000, jobs_topup=20, amount=25000, purchase_date=date(2026, 4, 15), added_by="Kajal"))
        if global_recruit:
            db.add(TopUp(team_id=global_recruit.id, team_name=global_recruit.name, cv_topup=500, amount=12500, purchase_date=date(2026, 4, 10), added_by="Kajal"))


def parse_date(value) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if value is None:
        return None
    text = str(value).strip()
    formats = (
        "%Y-%m-%d",      # 2025-04-01
        "%d-%m-%Y",      # 01-04-2025
        "%d/%m/%Y",      # 01/04/2025
        "%d %b %Y",      # 01 Apr 2025
        "%d %B %Y",      # 01 April 2025
        "%d-%b-%Y",      # 01-Apr-2025
        "%d-%b-%y",      # 01-Apr-25
        "%d/%b/%Y",      # 01/Apr/2025
        "%d/%b/%y",      # 01/Apr/25
        "%d %b %y",      # 01 Apr 25
    )
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    return None


def parse_date_range_from_text(text: str) -> tuple[date | None, date | None]:
    candidates = re.findall(r"\d{1,2}[-/ ](?:[A-Za-z]{3,9}|\d{1,2})[-/ ]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}", text)
    parsed = [parse_date(item) for item in candidates]
    parsed = [item for item in parsed if item]
    if len(parsed) >= 2:
        return parsed[0], parsed[1]
    print("WARNING: Could not extract 2 dates from text:", text)
    print("Parsed candidates:", parsed)
    return None, None


def financial_year_start(financial_year: str) -> date:
    match = re.match(r"(\d{4})", financial_year)
    year = int(match.group(1)) if match else date.today().year
    return date(year, 4, 1)


def financial_year_dates(label: str) -> tuple[date, date]:
    start = financial_year_start(label)
    return start, date(start.year + 1, 3, 31)


def default_pricing_plan(db: Session) -> PricingPlan | None:
    return (
        db.query(PricingPlan)
        .filter(PricingPlan.period == "Q1 (Apr-Jun)", PricingPlan.partner_type == "New Partner")
        .first()
        or db.query(PricingPlan).order_by(PricingPlan.id).first()
    )


from sqlalchemy.exc import IntegrityError


def normalize_team_name(name: str) -> str:
    return (
        str(name)
        .lower()
        .replace(".", "")
        .replace(",", "")
        .replace("  ", " ")
        .strip()
    )


def create_team_from_upload(
    db,
    team_name: str,
    partner_name: str = "",
    partner_email: str = "",
    licences: int = 1,
    partner_type: str = "New Partner",
    join_period: str = "Q1 (Apr-Jun)",
    licence_fee: float = 80000,
    cv_limit: int = 3000,
    nvites_limit: int = 22500,
    jobs_limit: int = 100,
    financial_year: str = "",
):
    normalized = normalize_team_name(team_name)

    existing_teams = db.query(Team).all()
    for team in existing_teams:
        if normalize_team_name(team.name) == normalized:
            return team

    # ─── Look up limits from the pricing matrix ───────────────
    # Only do this fallback lookup when the caller hasn't supplied
    # real limits (all three are still at their zero defaults).
    # If the caller (reports.py) already computed limits from the
    # pricing matrix and passed them in, honour those values.
    caller_provided_limits = (cv_limit != 0 or nvites_limit != 0 or jobs_limit != 0)
    if financial_year and not caller_provided_limits:
        plan = (
            db.query(PricingPlan)
            .filter(
                PricingPlan.financial_year == financial_year,
                PricingPlan.period == join_period,
                PricingPlan.partner_type == partner_type,
            )
            .first()
        )
        if not plan:
            # Relax to any plan for this FY + period
            plan = (
                db.query(PricingPlan)
                .filter(
                    PricingPlan.financial_year == financial_year,
                    PricingPlan.period == join_period,
                )
                .first()
            )
        if not plan:
            # Any plan for this FY
            plan = (
                db.query(PricingPlan)
                .filter(PricingPlan.financial_year == financial_year)
                .first()
            )
        if plan:
            cv_limit     = (plan.cv_limit     or 0) * licences
            nvites_limit = (plan.nvites_limit or 0) * licences
            jobs_limit   = (plan.jobs_limit   or 0) * licences
            licence_fee  = (plan.licence_fee  or 0) * licences
    # ──────────────────────────────────────────────────────────

    try:
        new_team = Team(
            name=team_name.strip(),
            partner_name=partner_name or "",
            partner_email=partner_email or "",
            financial_year=financial_year or "2025-2026",
            licences=licences,
            partner_type=partner_type,
            join_period=join_period,
            licence_fee=licence_fee,
            cost_share=0,
            cv_limit=cv_limit,
            nvites_limit=nvites_limit,
            jobs_limit=jobs_limit,
            is_active=True,
        )
        db.add(new_team)
        db.flush()
        return new_team

    except IntegrityError:
        db.rollback()
        existing_retry = (
            db.query(Team)
            .filter(Team.name == team_name.strip())
            .first()
        )
        if existing_retry:
            return existing_retry
        raise


def validate_report_ranges(
    resdex_range: tuple[date | None, date | None],
    job_range: tuple[date | None, date | None],
    financial_year: str,
):
    print("VALIDATING FY:", financial_year)
    print("RESDEX RANGE:", resdex_range)
    print("JOB RANGE:", job_range)

    start = financial_year_start(financial_year)

    if not resdex_range[0]:
        raise HTTPException(status_code=400, detail="Could not parse date range from Resdex report. Please re-download from Naukri.")
    if not job_range[0]:
        raise HTTPException(status_code=400, detail="Could not parse date range from Job Posting report. Please re-download from Naukri.")
    if resdex_range[0] != start:
        raise HTTPException(
            status_code=400,
            detail=f"Resdex report must start from {start.strftime('%d %b %Y')} (Financial Year {financial_year}). "
                   f"Report starts from {resdex_range[0].strftime('%d %b %Y')}. Please re-download from Naukri.",
        )
    if job_range[0] != start:
        raise HTTPException(
            status_code=400,
            detail=f"Job Posting report must start from {start.strftime('%d %b %Y')} (Financial Year {financial_year}). "
                   f"Report starts from {job_range[0].strftime('%d %b %Y')}. Please re-download from Naukri.",
        )
    if resdex_range != job_range:
        raise HTTPException(
            status_code=400,
            detail=f"Report date mismatch. Resdex: {resdex_range}, Job Posting: {job_range}. "
                   f"Please upload both reports for the same date range from {start.strftime('%d %b %Y')} to today.",
        )


def usage_totals(db: Session, team_id: int, financial_year: str) -> dict:
    rows = (
        db.query(SubUserUsage)
        .filter(
            SubUserUsage.team_id == team_id,
            SubUserUsage.financial_year == financial_year,
        )
        .all()
    )
    return {
        "cv": sum(row.cv_usage or 0 for row in rows),
        "nvites": sum(row.nvites_usage or 0 for row in rows),
        "jobs": sum(row.jobs_usage or 0 for row in rows),
    }


def topup_totals(db: Session, team_id: int, financial_year: str | None = None) -> dict:
    query = db.query(TopUp).filter(TopUp.team_id == team_id)
    if financial_year:
        query = query.filter(TopUp.financial_year == financial_year)
    rows = query.all()
    return {
        "cv": sum(row.cv_topup or 0 for row in rows),
        "nvites": sum(row.nvites_topup or 0 for row in rows),
        "jobs": sum(row.jobs_topup or 0 for row in rows),
    }


def team_limits(
    team: Team,
    db: Session,
    financial_year: str
) -> dict:
    limits = effective_limits(
        team,
        db,
        financial_year
    )
    return {
        "cv": limits["cv_limit"],
        "nvites": limits["nvites_limit"],
        "jobs": limits["jobs_limit"],
    }


def usage_percent(used: int, limit: int) -> int:
    if not limit:
        return 0
    return round((used / limit) * 100)


def status_for_percent(value: int) -> str:
    if value > 100:
        return "Over limit"
    if value >= 90:
        return "Critical"
    if value >= 70:
        return "Warning"
    return "Safe"


def status_for_team(team: Team, db: Session, financial_year: str) -> str:
    usage = usage_totals(db, team.id, financial_year)
    limits = team_limits(team, db, financial_year)
    return status_for_percent(
        max(usage_percent(usage[key], limits[key]) for key in INVENTORY_TYPES)
    )


def outstanding_for_team(db: Session, team_id: int) -> float:
    invoices = db.query(Invoice).filter(Invoice.team_id == team_id, Invoice.status != "Paid").all()
    return sum(max(0, (invoice.amount or 0) - (invoice.paid_amount or 0)) for invoice in invoices)


def team_payload(team: Team, db: Session, financial_year: str, include_financial: bool = False) -> dict:
    usage = usage_totals(db, team.id, financial_year)
    topups = topup_totals(db, team.id, financial_year)
    limits = team_limits(team, db, financial_year)
    percentages = {key: usage_percent(usage[key], limits[key]) for key in INVENTORY_TYPES}

    subusers = (
        db.query(SubUserUsage)
        .filter(
            SubUserUsage.team_id == team.id,
            SubUserUsage.financial_year == financial_year,
        )
        .order_by(SubUserUsage.name)
        .all()
    )

    payload = {
        "id": team.id,
        "name": team.name,
        "partner_name": team.partner_name,
        "partner_email": team.partner_email,
        "licence_count": team.licences,
        "partner_type": team.partner_type,
        "join_period": team.join_period,
        "original_limits": {"cv": team.cv_limit or 0, "nvites": team.nvites_limit or 0, "jobs": team.jobs_limit or 0},
        "topups": topups,
        "total_limits": limits,
        "usage": usage,
        "remaining": {key: max(0, limits[key] - usage[key]) for key in INVENTORY_TYPES},
        "usage_percent": percentages,
        "status": status_for_percent(max(percentages.values())),
        "outstanding_invoice": outstanding_for_team(db, team.id),
        "subusers": [
            {
                "id": row.id,
                "name": row.name,
                "email": row.email,
                "cv_usage": row.cv_usage,
                "nvites_usage": row.nvites_usage,
                "jobs_usage": row.jobs_usage,
            }
            for row in subusers
        ],
    }
    if include_financial:
        revenue = (team.licence_fee or 0) + sum(
            invoice.amount or 0
            for invoice in db.query(Invoice).filter(Invoice.team_id == team.id).all()
        )
        payload.update({
            "licence_fee": team.licence_fee or 0,
            "cost_share": team.cost_share or 0,
            "revenue": revenue,
            "profit": revenue - (team.cost_share or 0),
        })
    return payload


def overage_items(team: Team, db: Session, financial_year: str) -> list[dict]:
    usage = usage_totals(db, team.id, financial_year)
    limits = team_limits(team, db, financial_year)
    items = []
    for key in INVENTORY_TYPES:
        overage = max(0, usage[key] - limits[key])
        if overage <= 0:
            continue
        rule = BILLING_RULES[key]
        billed_quantity = math.ceil(overage / rule["multiple"]) * rule["multiple"]
        subtotal = billed_quantity * rule["rate"]
        gst = subtotal * 0.18
        items.append(
            {
                "inventory_type": key,
                "label": rule["label"],
                "actual_overage": overage,
                "billed_quantity": billed_quantity,
                "rate": rule["rate"],
                "subtotal": subtotal,
                "gst": gst,
                "total": subtotal + gst,
            }
        )
    return items


def next_invoice_number(db: Session, financial_year: str | None = None) -> str:
    # Use the start-year from the FY label (e.g. "2025-2026" → "2025"),
    # or fall back to the current calendar year.
    if financial_year:
        year_part = financial_year.split("-")[0]
    else:
        year_part = str(date.today().year)
    count = db.query(Invoice).count() + 1
    return f"INV-{year_part}-{count:03d}"


def create_invoice(
    db: Session,
    team: Team,
    invoice_type: str,
    items: list[dict],
    actor: str = "system",
    notes: str = "",
    financial_year: str | None = None,
) -> Invoice:
    # Resolve financial_year: prefer explicit arg, then team's stored FY
    fy = (
        financial_year
        or getattr(team, "financial_year", None)
        or f"{date.today().year}-{date.today().year + 1}"
    )
    # Each item dict has keys: subtotal (pre-GST), gst (GST portion), total (incl. GST)
    subtotal_amount = sum(float(item.get("subtotal") or item.get("amount") or 0) for item in items)
    gst_amount      = sum(float(item.get("gst")      or 0)                        for item in items)
    total_amount    = sum(float(item.get("total")    or item.get("amount") or 0)  for item in items)

    # Fallback: if items don't carry GST/total breakdown, derive from subtotal
    if total_amount == 0 and subtotal_amount > 0:
        gst_amount   = round(subtotal_amount * 0.18, 2)
        total_amount = round(subtotal_amount + gst_amount, 2)

    invoice = Invoice(
        invoice_number=next_invoice_number(db, fy),
        financial_year=fy,
        team_id=team.id,
        partner_name=team.name,
        invoice_type=invoice_type,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=14),
        amount=round(subtotal_amount, 2),   # pre-GST
        gst_amount=round(gst_amount, 2),
        total_amount=round(total_amount, 2),
        paid_amount=0,
        status="Unpaid",
        payment_status="unpaid",
        notes=notes,
        items_json=json.dumps(items),
    )
    db.add(invoice)
    db.flush()
    add_audit(
        db, actor, "create_invoice", "invoice", invoice.invoice_number,
        {"team": team.name, "amount": total_amount, "type": invoice_type, "financial_year": fy}
    )
    return invoice


def invoice_payload(invoice: Invoice) -> dict:
    paid = invoice.paid_amount or 0
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "team_id": invoice.team_id,
        "partner_name": invoice.partner_name,
        "invoice_type": invoice.invoice_type,
        "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "amount": invoice.amount or 0,
        "paid_amount": paid,
        "balance_due": max(0, (invoice.amount or 0) - paid),
        "status": invoice.status,
        "payment_date": invoice.payment_date.isoformat() if invoice.payment_date else None,
        "notes": invoice.notes,
        "items": json.loads(invoice.items_json or "[]"),
    }


def _inv_total(invoice: Invoice) -> float:
    """Use total_amount (incl. GST) if set, fall back to amount (pre-GST)."""
    t = float(invoice.total_amount or 0)
    a = float(invoice.amount or 0)
    return t if t > 0 else a


def invoice_summary(invoices: Iterable[Invoice]) -> dict:
    invoices = list(invoices)
    outstanding = sum(
        max(0, _inv_total(invoice) - (invoice.paid_amount or 0))
        for invoice in invoices
        if (invoice.payment_status or invoice.status or "").lower() != "paid"
    )
    paid = sum(invoice.paid_amount or 0 for invoice in invoices)
    partial_pending = sum(
        max(0, _inv_total(invoice) - (invoice.paid_amount or 0))
        for invoice in invoices
        if (invoice.payment_status or invoice.status or "").lower() in ("partial", "partially paid")
    )
    overdue = sum(
        max(0, _inv_total(invoice) - (invoice.paid_amount or 0))
        for invoice in invoices
        if (
            (invoice.payment_status or invoice.status or "").lower() != "paid"
            and invoice.due_date
            and (
                invoice.due_date.date()
                if hasattr(invoice.due_date, "date")
                else invoice.due_date
            ) < date.today()
        )
    )
    return {
        "outstanding": outstanding,
        "paid": paid,
        "partial_pending": partial_pending,
        "overdue": overdue,
        "pending_count": len([
            i for i in invoices
            if (i.payment_status or i.status or "").lower() != "paid"
        ]),
    }


def alert_message(team: Team, db: Session, financial_year: str) -> dict:
    payload = team_payload(team, db, financial_year)
    items = overage_items(team, db, financial_year)
    overage_amount = sum(item["total"] for item in items)
    usage = payload["usage"]
    limits = payload["total_limits"]
    remaining = payload["remaining"]

    def pct(u, l):
        return round((u / l) * 100) if l else 0

    member_lines = [
        f"  - {row['name'] or row['email']} ({row['email']}): "
        f"CV {row['cv_usage']:,} | NVites {row['nvites_usage']:,} | Jobs {row['jobs_usage']}"
        for row in payload["subusers"]
    ]

    status_line = (
        "LIMIT EXCEEDED"
        if payload["status"] == "Over limit"
        else ("CRITICAL - Approaching Limit"
              if payload["status"] == "Critical"
              else "WARNING - High Usage")
    )

    overage_line = (
        f"\nOverage amount due (incl. GST): Rs. {round(overage_amount):,}\n"
        if overage_amount > 0 else ""
    )

    email_body = (
        f"Dear {team.partner_name or team.name},\n\n"
        f"We hope this message finds you well.\n\n"
        f"This is an automated usage alert from Talent Corner HR Services "
        f"regarding your Naukri.com account for Financial Year {financial_year}.\n\n"
        f"STATUS: {status_line}\n\n"
        f"USAGE SUMMARY\n"
        f"{'=' * 40}\n"
        f"CV Access    : {usage['cv']:>8,} used / {limits['cv']:>8,} allocated  "
        f"({pct(usage['cv'], limits['cv'])}%)  "
        f"| Remaining: {remaining['cv']:,}\n"
        f"NVites       : {usage['nvites']:>8,} used / {limits['nvites']:>8,} allocated  "
        f"({pct(usage['nvites'], limits['nvites'])}%)  "
        f"| Remaining: {remaining['nvites']:,}\n"
        f"Job Postings : {usage['jobs']:>8,} used / {limits['jobs']:>8,} allocated  "
        f"({pct(usage['jobs'], limits['jobs'])}%)  "
        f"| Remaining: {remaining['jobs']:,}\n\n"
        f"MEMBER-WISE BREAKDOWN\n"
        f"{'=' * 40}\n"
        + "\n".join(member_lines) + "\n"
        + overage_line
        + "\nWe request you to review your usage at the earliest and plan accordingly. "
        f"Should you wish to purchase additional inventory or discuss your account, "
        f"please do not hesitate to contact us.\n\n"
        f"Thank you for your continued partnership.\n\n"
        f"Warm regards,\n"
        f"Operations Team\n"
        f"Talent Corner HR Services Pvt. Ltd."
    )

    return {
        "team": payload,
        "overage_items": items,
        "overage_amount": overage_amount,
        "message": email_body,
        "cv_usage": usage["cv"],
        "cv_limit": limits["cv"],
        "nvites_usage": usage["nvites"],
        "nvites_limit": limits["nvites"],
        "jobs_usage": usage["jobs"],
        "jobs_limit": limits["jobs"],
        "cv_remaining": remaining["cv"],
        "nvites_remaining": remaining["nvites"],
        "jobs_remaining": remaining["jobs"],
        "members": payload["subusers"],
    }


# ---------------------------------------------------------------------------
# Report parsing helpers — used by the upload route
# ---------------------------------------------------------------------------

def parse_job_posting_report(filepath: str) -> tuple[tuple[date | None, date | None], list[dict]]:
    """
    Parse the Job Posting report (xlsx).

    Expected layout (0-indexed rows):
      Row 0: ['Job Posting Report - Sub User Wise', ...]
      Row 2: ['Duration:', '01-Apr-25 To 31-Mar-26', ...]
      Row 4: ['Sub User', 'Alias', 'Jobs Post Expense', ...]
      Row 5+: data rows

    Returns:
        (date_range, rows)
        date_range: (start_date, end_date) parsed from row 2 col 1
        rows: list of dicts with keys 'email', 'jobs_usage'
    """
    import pandas as pd

    raw = pd.read_excel(filepath, header=None)

    date_range_text = str(raw.iloc[2, 1]).strip()
    print("JOB HEADER:", date_range_text)
    date_range = parse_date_range_from_text(date_range_text)

    df = pd.read_excel(filepath, header=4)
    sub_col = next(
        (c for c in df.columns if str(c).strip().lower().startswith("sub")),
        df.columns[0],
    )
    df = df.rename(columns={sub_col: "email"})
    df["email"] = df["email"].astype(str).str.strip().str.lower()

    df = df[df["email"].str.contains("@", na=False)]

    job_col = next(
        (c for c in df.columns if "total" in str(c).lower() and "job" in str(c).lower()),
        df.columns[-1],
    )
    df["jobs_usage"] = pd.to_numeric(df[job_col], errors="coerce").fillna(0).astype(int)

    rows = df[["email", "jobs_usage"]].to_dict("records")
    return date_range, rows


def parse_resdex_report(filepath: str) -> tuple[tuple[date | None, date | None], list[dict]]:
    """
    Parse the Resdex Usage report (.xls).

    Expected layout (0-indexed rows):
      Row 0: 'Report Type: Summary      Duration: 01-Apr-25 To 31-Mar-26'
      Row 1: ['Subuser', 'Team Name', 'NVites', 'Unique CV Views...', ..., 'CV Access By Company (A+B+C)', ...]
      Row 2+: data rows — Subuser col format: "Name | email@domain.com"

    Returns:
        (date_range, rows)
        date_range: (start_date, end_date) parsed from row 0 col 0
        rows: list of dicts with keys 'email', 'cv_usage', 'nvites_usage'
    """
    import pandas as pd

    raw = pd.read_excel(filepath, engine="xlrd", header=None)

    header_text = str(raw.iloc[0, 0]).strip()
    print("RESDEX HEADER:", header_text)
    date_range = parse_date_range_from_text(header_text)

    df = pd.read_excel(filepath, engine="xlrd", header=1)

    sub_col = next(
        (c for c in df.columns if str(c).strip().lower() == "subuser"),
        df.columns[0],
    )
    df["email"] = (
        df[sub_col]
        .astype(str)
        .str.extract(r"\|\s*([^\s|]+@[^\s|]+)")
        [0]
        .str.strip()
        .str.lower()
    )

    df = df[df["email"].notna() & df["email"].str.contains("@", na=False)]

    nvites_col = next(
        (c for c in df.columns if str(c).strip().lower() == "nvites"),
        None,
    )
    cv_col = next(
        (c for c in df.columns if "a+b+c" in str(c).lower() or "cv access by company" in str(c).lower()),
        None,
    )

    df["cv_usage"] = pd.to_numeric(df[cv_col], errors="coerce").fillna(0).astype(int) if cv_col else 0
    df["nvites_usage"] = pd.to_numeric(df[nvites_col], errors="coerce").fillna(0).astype(int) if nvites_col else 0

    rows = df[["email", "cv_usage", "nvites_usage"]].to_dict("records")
    return date_range, rows
