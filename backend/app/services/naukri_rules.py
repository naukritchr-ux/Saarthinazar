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

DEFAULT_TEAMS = [
    ("Talent Corner", "Gauri Naik", "gauri.naik@talentcorner.in", 1, "Early Renewal", "Q1 (Apr-Jun)", 80000, 56000, 3000, 22500, 100),
    ("HR Solutions", "Amit Kumar", "amit.kumar@hrsolutions.in", 1, "New Partner", "Q1 (Apr-Jun)", 80000, 58000, 3000, 22500, 100),
    ("Staffing Pro", "Vikram Singh", "vikram.singh@staffingpro.in", 2, "New Partner", "Q1 (Apr-Jun)", 160000, 115000, 6000, 45000, 200),
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
            db.add(PricingPlan(period=period, partner_type=partner_type, price=price, cv_limit=cv, nvites_limit=nvites, jobs_limit=jobs))

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

    if db.query(SubUserUsage).count() == 0:
        teams = {team.name: team for team in db.query(Team).all()}
        for team_name, name, email, cv, nvites, jobs in DEFAULT_USAGE:
            team = teams.get(team_name)
            if team:
                db.add(SubUserUsage(team_id=team.id, team_name=team.name, name=name, email=email, cv_usage=cv, nvites_usage=nvites, jobs_usage=jobs))

    if db.query(TopUp).count() == 0:
        talent = db.query(Team).filter(Team.name == "Talent Corner").first()
        global_recruit = db.query(Team).filter(Team.name == "Global Recruit").first()
        if talent:
            db.add(TopUp(team_id=talent.id, team_name=talent.name, cv_topup=1000, nvites_topup=5000, jobs_topup=20, amount=25000, purchase_date=date(2026, 4, 15), added_by="Kajal"))
        if global_recruit:
            db.add(TopUp(team_id=global_recruit.id, team_name=global_recruit.name, cv_topup=500, amount=12500, purchase_date=date(2026, 4, 10), added_by="Kajal"))

    if db.query(ReportUpload).count() == 0:
        db.add(
            ReportUpload(
                resdex_file="Resdex_Usage_01Apr-30Apr.xls",
                job_posting_file="Job_Posting_01Apr-30Apr.xlsx",
                uploaded_by="Kajal",
                range_start=date(2026, 4, 1),
                range_end=date(2026, 4, 30),
                status="success",
                message="Reports uploaded and rolled up by subuser email.",
            )
        )

    if db.query(Invoice).count() == 0:
        teams = {team.name: team for team in db.query(Team).all()}
        seed_invoices = [
            ("INV-2026-001", "Talent Corner", "topup", date(2026, 4, 15), date(2026, 4, 30), 45000, 0, "Unpaid", "Top-up and usage overage follow-up"),
            ("INV-2026-002", "HR Solutions", "licence", date(2026, 4, 1), date(2026, 4, 25), 80000, 80000, "Paid", "Licence fee received"),
            ("INV-2026-003", "Staffing Pro", "licence", date(2026, 4, 1), date(2026, 5, 10), 160000, 100000, "Partially paid", "Part payment received"),
            ("INV-2026-004", "Global Recruit", "overage", date(2026, 4, 10), date(2026, 4, 25), 65000, 0, "Unpaid", "Overage invoice pending"),
            ("INV-2026-005", "Smart Hire", "licence", date(2026, 4, 1), date(2026, 5, 5), 80000, 80000, "Paid", "Licence fee received"),
        ]
        for number, team_name, invoice_type, invoice_date, due_date, amount, paid_amount, status, notes in seed_invoices:
            team = teams.get(team_name)
            db.add(
                Invoice(
                    invoice_number=number,
                    team_id=team.id if team else None,
                    partner_name=team_name,
                    invoice_type=invoice_type,
                    invoice_date=invoice_date,
                    due_date=due_date,
                    amount=amount,
                    paid_amount=paid_amount,
                    status=status,
                    payment_date=invoice_date if status == "Paid" else None,
                    notes=notes,
                    items_json=json.dumps([{"label": notes, "total": amount}]),
                )
            )
    db.commit()


def parse_date(value) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if value is None:
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y", "%d %B %Y"):
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


def create_team_from_upload(db: Session, team_name: str, partner_email: str, partner_name: str = "", licences: int = 1) -> Team:
    plan = default_pricing_plan(db)
    team = Team(
        name=team_name,
        partner_name=partner_name or team_name,
        partner_email=partner_email,
        licences=licences,
        partner_type=plan.partner_type if plan else "New Partner",
        join_period=plan.period if plan else "Q1 (Apr-Jun)",
        licence_fee=(plan.price if plan else 0) * licences,
        cost_share=0,
        cv_limit=(plan.cv_limit if plan else 0) * licences,
        nvites_limit=(plan.nvites_limit if plan else 0) * licences,
        jobs_limit=(plan.jobs_limit if plan else 0) * licences,
        is_active=True,
    )
    db.add(team)
    db.flush()
    add_audit(
        db,
        "system",
        "auto_create_team_from_upload",
        "team",
        team.id,
        {"team_name": team_name, "partner_email": partner_email, "licences": licences},
    )
    return team


def validate_report_ranges(resdex_range: tuple[date | None, date | None], job_range: tuple[date | None, date | None], financial_year: str):
    start = financial_year_start(financial_year)
    if not resdex_range[0] or not job_range[0] or resdex_range[0] != start or job_range[0] != start:
        raise HTTPException(status_code=400, detail=f"Report must start from {start.strftime('%d %b %Y')}. Please re-download from Naukri.")
    if resdex_range != job_range:
        raise HTTPException(status_code=400, detail=f"Report date mismatch. Please upload both reports from {start.strftime('%d %b %Y')} to today.")


def usage_totals(db: Session, team_id: int) -> dict:
    rows = db.query(SubUserUsage).filter(SubUserUsage.team_id == team_id).all()
    return {
        "cv": sum(row.cv_usage or 0 for row in rows),
        "nvites": sum(row.nvites_usage or 0 for row in rows),
        "jobs": sum(row.jobs_usage or 0 for row in rows),
    }


def topup_totals(db: Session, team_id: int) -> dict:
    rows = db.query(TopUp).filter(TopUp.team_id == team_id).all()
    return {
        "cv": sum(row.cv_topup or 0 for row in rows),
        "nvites": sum(row.nvites_topup or 0 for row in rows),
        "jobs": sum(row.jobs_topup or 0 for row in rows),
    }


def team_limits(team: Team, db: Session) -> dict:
    topups = topup_totals(db, team.id)
    return {
        "cv": (team.cv_limit or 0) + topups["cv"],
        "nvites": (team.nvites_limit or 0) + topups["nvites"],
        "jobs": (team.jobs_limit or 0) + topups["jobs"],
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


def status_for_team(team: Team, db: Session) -> str:
    usage = usage_totals(db, team.id)
    limits = team_limits(team, db)
    return status_for_percent(max(usage_percent(usage[key], limits[key]) for key in INVENTORY_TYPES))


def outstanding_for_team(db: Session, team_id: int) -> float:
    invoices = db.query(Invoice).filter(Invoice.team_id == team_id, Invoice.status != "Paid").all()
    return sum(max(0, (invoice.amount or 0) - (invoice.paid_amount or 0)) for invoice in invoices)


def team_payload(team: Team, db: Session, include_financial: bool = False) -> dict:
    usage = usage_totals(db, team.id)
    topups = topup_totals(db, team.id)
    limits = team_limits(team, db)
    percentages = {key: usage_percent(usage[key], limits[key]) for key in INVENTORY_TYPES}
    subusers = db.query(SubUserUsage).filter(SubUserUsage.team_id == team.id).order_by(SubUserUsage.name).all()
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
        "remaining": {key: limits[key] - usage[key] for key in INVENTORY_TYPES},
        "usage_percent": percentages,
        "status": status_for_percent(max(percentages.values())),
        "outstanding_invoice": outstanding_for_team(db, team.id),
        "subusers": [
            {"id": row.id, "name": row.name, "email": row.email, "cv_usage": row.cv_usage, "nvites_usage": row.nvites_usage, "jobs_usage": row.jobs_usage}
            for row in subusers
        ],
    }
    if include_financial:
        revenue = (team.licence_fee or 0) + sum(invoice.amount or 0 for invoice in db.query(Invoice).filter(Invoice.team_id == team.id).all())
        payload.update({"licence_fee": team.licence_fee or 0, "cost_share": team.cost_share or 0, "revenue": revenue, "profit": revenue - (team.cost_share or 0)})
    return payload


def overage_items(team: Team, db: Session) -> list[dict]:
    usage = usage_totals(db, team.id)
    limits = team_limits(team, db)
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


def next_invoice_number(db: Session) -> str:
    return f"INV-2026-{db.query(Invoice).count() + 1:03d}"


def create_invoice(db: Session, team: Team, invoice_type: str, items: list[dict], actor: str = "system", notes: str = "") -> Invoice:
    amount = sum(item["total"] for item in items)
    invoice = Invoice(
        invoice_number=next_invoice_number(db),
        team_id=team.id,
        partner_name=team.name,
        invoice_type=invoice_type,
        invoice_date=date.today(),
        due_date=date.today() + timedelta(days=14),
        amount=amount,
        paid_amount=0,
        status="Unpaid",
        notes=notes,
        items_json=json.dumps(items),
    )
    db.add(invoice)
    db.flush()
    add_audit(db, actor, "create_invoice", "invoice", invoice.invoice_number, {"team": team.name, "amount": amount, "type": invoice_type})
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


def invoice_summary(invoices: Iterable[Invoice]) -> dict:
    invoices = list(invoices)
    outstanding = sum(max(0, (invoice.amount or 0) - (invoice.paid_amount or 0)) for invoice in invoices if invoice.status != "Paid")
    paid = sum(invoice.paid_amount or 0 for invoice in invoices)
    partial_pending = sum(max(0, (invoice.amount or 0) - (invoice.paid_amount or 0)) for invoice in invoices if invoice.status == "Partially paid")
    overdue = sum(max(0, (invoice.amount or 0) - (invoice.paid_amount or 0)) for invoice in invoices if invoice.status != "Paid" and invoice.due_date and invoice.due_date < date.today())
    return {"outstanding": outstanding, "paid": paid, "partial_pending": partial_pending, "overdue": overdue, "pending_count": len([i for i in invoices if i.status != "Paid"])}


def alert_message(team: Team, db: Session) -> dict:
    payload = team_payload(team, db)
    items = overage_items(team, db)
    overage_amount = sum(item["total"] for item in items)
    lines = [
        f"Usage Alert: {team.name}",
        f"Dear {team.partner_name or 'Team'},",
        "This is your current Naukri usage summary:",
        f"CV Access: {payload['usage']['cv']} / {payload['total_limits']['cv']} ({payload['usage_percent']['cv']}%)",
        f"NVites: {payload['usage']['nvites']} / {payload['total_limits']['nvites']} ({payload['usage_percent']['nvites']}%)",
        f"Job Postings: {payload['usage']['jobs']} / {payload['total_limits']['jobs']} ({payload['usage_percent']['jobs']}%)",
        "Member-wise breakdown:",
    ]
    lines.extend(f"- {row['name']} ({row['email']}): CV {row['cv_usage']}, NVites {row['nvites_usage']}, Jobs {row['jobs_usage']}" for row in payload["subusers"])
    if overage_amount:
        lines.append(f"Overage invoice amount including GST: Rs {round(overage_amount)}")
    lines.append("Please review your usage and plan accordingly.")
    return {"team": payload, "overage_items": items, "overage_amount": overage_amount, "message": "\n".join(lines)}
