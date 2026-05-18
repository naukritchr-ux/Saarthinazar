# backend/app/services/invoice_generator.py

import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.team import Team

from app.services.invoice_pdf_generator import (
    generate_invoice_pdf
)

# =====================================================
# CONFIG
# =====================================================

CV_RATE = 10
NVITES_RATE = 5
JOB_RATE = 100

GST_PERCENTAGE = 18

# =====================================================
# GENERATE INVOICE NUMBER
# =====================================================


def generate_invoice_number():

    year = datetime.now().year

    month = datetime.now().month

    return f"INV-{year}-{month}-{int(datetime.utcnow().timestamp())}"


# =====================================================
# CALCULATE OVERAGES
# =====================================================


def calculate_overages(team):

    cv_overage = max(
        0,
        team.cv_usage - team.cv_limit
    )

    nvites_overage = max(
        0,
        team.nvites_usage - team.nvites_limit
    )

    jobs_overage = max(
        0,
        team.jobs_usage - team.jobs_limit
    )

    return {
        "cv_overage": cv_overage,
        "nvites_overage": nvites_overage,
        "jobs_overage": jobs_overage,
    }


# =====================================================
# CALCULATE AMOUNT
# =====================================================


def calculate_invoice_amount(overages):

    cv_amount = (
        overages["cv_overage"] * CV_RATE
    )

    nvites_amount = (
        overages["nvites_overage"] * NVITES_RATE
    )

    jobs_amount = (
        overages["jobs_overage"] * JOB_RATE
    )

    subtotal = (
        cv_amount +
        nvites_amount +
        jobs_amount
    )

    gst_amount = round(
        subtotal * GST_PERCENTAGE / 100,
        2
    )

    total_amount = round(
        subtotal + gst_amount,
        2
    )

    return {
        "subtotal": subtotal,
        "gst_amount": gst_amount,
        "total_amount": total_amount,
        "items": [
            {
                "name": "CV Access Overage",
                "qty": overages["cv_overage"],
                "rate": CV_RATE,
                "amount": cv_amount,
            },
            {
                "name": "Nvites Overage",
                "qty": overages["nvites_overage"],
                "rate": NVITES_RATE,
                "amount": nvites_amount,
            },
            {
                "name": "Job Posting Overage",
                "qty": overages["jobs_overage"],
                "rate": JOB_RATE,
                "amount": jobs_amount,
            },
        ]
    }


# =====================================================
# GENERATE ALL INVOICES
# =====================================================


def generate_invoices(db: Session):

    generated = []

    teams = db.query(Team).all()

    for team in teams:

        overages = calculate_overages(team)

        total_usage = (
            overages["cv_overage"] +
            overages["nvites_overage"] +
            overages["jobs_overage"]
        )

        if total_usage <= 0:
            continue

        amounts = calculate_invoice_amount(
            overages
        )

        invoice = Invoice(

            invoice_number=generate_invoice_number(),

            partner_name=team.name,

            financial_year="2025-2026",

            team_id=team.id,

            invoice_date=datetime.utcnow(),

            due_date=(
                datetime.utcnow() +
                timedelta(days=15)
            ),

            amount=amounts["subtotal"],

            gst_amount=amounts["gst_amount"],

            total_amount=amounts["total_amount"],

            payment_status="unpaid",

            invoice_type="overage",

            items_json=json.dumps(
                amounts["items"]
            )
        )

        db.add(invoice)

        db.commit()

        db.refresh(invoice)

        pdf_path = generate_invoice_pdf(
            invoice=invoice,
            items=amounts["items"]
        )

        invoice.pdf_path = pdf_path

        db.commit()

        generated.append({
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "partner_name": invoice.partner_name,
            "amount": invoice.total_amount,
            "pdf_path": pdf_path
        })

    return generated