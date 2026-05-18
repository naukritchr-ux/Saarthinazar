from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String
)

from sqlalchemy.sql import func

from app.database import Base


class Team(Base):

    __tablename__ = "teams"

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

    name = Column(
        String(255),
        unique=True,
        index=True,
        nullable=False
    )

    partner_name = Column(
        String(255),
        default=""
    )

    partner_email = Column(
        String(255),
        default=""
    )

    licences = Column(
        Integer,
        default=1
    )

    partner_type = Column(
        String(100),
        default="New Partner"
    )

    join_period = Column(
        String(100),
        default="Q1 (Apr-Jun)"
    )

    # =====================================================
    # BILLING
    # =====================================================

    licence_fee = Column(
        Float,
        default=0
    )

    cost_share = Column(
        Float,
        default=0
    )

    # =====================================================
    # LIMITS
    # =====================================================

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

    # =====================================================
    # USAGE
    # =====================================================

    cv_usage = Column(
        Integer,
        default=0
    )

    nvites_usage = Column(
        Integer,
        default=0
    )

    jobs_usage = Column(
        Integer,
        default=0
    )

    # =====================================================
    # STATUS
    # =====================================================

    is_active = Column(
        Boolean,
        default=True
    )

    # =====================================================
    # TIMESTAMPS
    # =====================================================

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )