from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invoice import Invoice
from app.models.team import Team
from app.models.user import User
from app.services.naukri_rules import MASTER_NAUKRI_COST, invoice_summary, team_payload
from app.utils.security import get_current_user

router = APIRouter(prefix="/financial")


@router.get("/overview")
def financial_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role.lower() not in {"owner", "admin", "rashesh"}:
        raise HTTPException(status_code=403, detail="Owner access required")
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
        "partner_profit": [team_payload(team, db, financial_year="", include_financial=True) for team in teams],
    }
# =====================================================
# REALTIME FINANCIAL INSIGHTS
# =====================================================

@router.get("/insights")
def get_financial_insights(
    financial_year: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role.lower() not in {"owner", "admin", "rashesh"}:
        raise HTTPException(status_code=403, detail="Owner access required")

    invoices = (

        db.query(Invoice)

        .filter(
            Invoice.financial_year == financial_year
        )

        .all()
    )

    # Teams don't have a financial_year column — filter by teams
    # that have actual usage data in this financial year instead
    from app.models.usage import SubUserUsage
    team_ids = (
        db.query(SubUserUsage.team_id)
        .filter(SubUserUsage.financial_year == financial_year)
        .distinct()
        .subquery()
    )
    teams = (
        db.query(Team)
        .filter(Team.id.in_(team_ids))
        .order_by(Team.name)
        .all()
    )

    # =====================================================
    # SUMMARY
    # =====================================================

    total_revenue = sum(
        i.total_amount or 0
        for i in invoices
    )

    outstanding = sum(

        i.total_amount or 0

        for i in invoices

        if i.payment_status != "paid"
    )

    paid_amount = sum(

        i.total_amount or 0

        for i in invoices

        if i.payment_status == "paid"
    )

    partial_amount = sum(

        i.total_amount or 0

        for i in invoices

        if i.payment_status == "partial"
    )

    unpaid_amount = sum(

        i.total_amount or 0

        for i in invoices

        if i.payment_status == "unpaid"
    )

    # =====================================================
    # PARTNER SUMMARY
    # =====================================================

    partner_summary = []

    for team in teams:

        team_invoices = [

            i for i in invoices

            if i.team_id == team.id
        ]

        revenue = sum(
            i.total_amount or 0
            for i in team_invoices
        )

        outstanding_team = sum(

            i.total_amount or 0

            for i in team_invoices

            if i.payment_status != "paid"
        )

        company_cost = revenue * 0.7

        profit = revenue - company_cost

        margin = 0

        if revenue > 0:

            margin = round(
                (profit / revenue) * 100,
                1
            )

        partner_summary.append({

            "team_name": team.name,

            "revenue": revenue,

            "cost": company_cost,

            "profit": profit,

            "margin": margin,

            "outstanding": outstanding_team,
        })

    # =====================================================
    # MONTHLY REVENUE TREND
    # =====================================================

    monthly_map = {}

    for invoice in invoices:

        if not invoice.invoice_date:
            continue

        month = invoice.invoice_date.strftime("%b")

        if month not in monthly_map:

            monthly_map[month] = {

                "month": month,

                "revenue": 0,

                "cost": 0,
            }

        monthly_map[month]["revenue"] += (
            invoice.total_amount or 0
        )

        monthly_map[month]["cost"] += (
            (invoice.total_amount or 0) * 0.7
        )

    revenue_trend = list(
        monthly_map.values()
    )

    # =====================================================
    # RESPONSE
    # =====================================================

    return {

        "summary": {

            "total_revenue": total_revenue,

            "outstanding": outstanding,

            "paid_amount": paid_amount,

            "partial_amount": partial_amount,

            "unpaid_amount": unpaid_amount,

            "active_partners": len(teams),
        },

        "revenue_trend": revenue_trend,

        "partner_summary": partner_summary,
    }