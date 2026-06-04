from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    DateTime,
    Text,
    ForeignKey
)

from app.database import Base


class Invoice(Base):

    __tablename__ = "invoices"

    # =====================================================
    # PRIMARY KEY
    # =====================================================

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    # =====================================================
    # BASIC INFO
    # =====================================================

    invoice_number = Column(
        String,
        nullable=False,
        unique=True
    )

    partner_name = Column(
        String,
        nullable=False
    )

    financial_year = Column(
        String,
        nullable=False
    )

    team_id = Column(
        Integer,
        ForeignKey("teams.id"),
        nullable=True
    )

    # =====================================================
    # DATES
    # =====================================================

    invoice_date = Column(
        DateTime,
        default=datetime.utcnow
    )

    due_date = Column(
        DateTime,
        nullable=True
    )

    payment_date = Column(
        DateTime,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    # =====================================================
    # AMOUNTS
    # =====================================================

    amount = Column(
        Float,
        default=0
    )

    gst_amount = Column(
        Float,
        default=0
    )

    total_amount = Column(
        Float,
        default=0
    )

    paid_amount = Column(
        Float,
        default=0
    )

    # =====================================================
    # STATUS
    # =====================================================

    # OLD FIELD
    status = Column(
        String,
        default="unpaid"
    )

    # NEW FIELD
    payment_status = Column(
        String,
        default="unpaid"
    )

    invoice_type = Column(
        String,
        default="overage"
    )

    # =====================================================
    # EXTRA
    # =====================================================

    notes = Column(
        Text,
        nullable=True
    )

    pdf_path = Column(
        String,
        nullable=True
    )

    items_json = Column(
        Text,
        nullable=True
    )

    # Snapshot of partner contact details at invoice-generation time
    # Stored as JSON: {"address": ..., "phone": ..., "gstin": ..., "state_code": ..., "email": ...}
    partner_details = Column(
        Text,
        nullable=True
    )