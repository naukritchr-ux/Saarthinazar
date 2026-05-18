from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Boolean,
)

from app.database import Base


class PricingPlan(Base):

    __tablename__ = "pricing_plans"
    financial_year = Column(
        String(20),
        nullable=False,
        index=True
    )
    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    # =====================================
    # PLAN PERIOD
    # =====================================

    # Examples:
    # Q1
    # Q2
    # Oct-Nov
    # December
    # January
    # February
    # March

    period = Column(
        String(100),
        nullable=False
    )

    # =====================================
    # FINANCIAL YEAR
    # =====================================

    # Examples:
    # 2025-2026
    # 2026-2027

    financial_year = Column(
        String(20),
        nullable=False
    )

    # =====================================
    # PARTNER TYPE
    # =====================================

    # Examples:
    # Early Renewal
    # New Partner
    # Returning Partner
    # Late Existing

    partner_type = Column(
        String(100),
        nullable=False
    )

    # =====================================
    # LICENCE FEE
    # =====================================

    licence_fee = Column(
        Float,
        default=0
    )

    # =====================================
    # INVENTORY LIMITS
    # =====================================

    cv_limit = Column(
        Integer,
        default=0
    )

    nvites_limit = Column(
        Integer,
        default=0
    )

    jobs_limit = Column(
        Integer,
        default=0
    )

    # =====================================
    # FLAGS
    # =====================================

    is_free_plan = Column(
        Boolean,
        default=False
    )

    is_active = Column(
        Boolean,
        default=True
    )

    # =====================================
    # LOCK PRICING
    # =====================================

    # Prevent accidental editing
    # after pricing approval

    is_locked = Column(
        Boolean,
        default=False
    )

    # =====================================
    # OVERRIDE CONTROL
    # =====================================

    # Allow or restrict
    # manual team-level overrides

    override_allowed = Column(
        Boolean,
        default=True
    )

    # =====================================
    # SPECIAL OFFERS / NOTES
    # =====================================

    # Examples:
    # Diwali Offer
    # Year-End Pricing
    # Custom Discount
    # Enterprise Exception

    notes = Column(
        String,
        nullable=True
    )

    # =====================================
    # AUDIT
    # =====================================

    created_by = Column(
        String,
        nullable=True
    )

    updated_by = Column(
        String,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )