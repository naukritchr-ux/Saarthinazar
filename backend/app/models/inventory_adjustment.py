from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
)

from sqlalchemy.orm import relationship

from app.database import Base


class InventoryAdjustment(Base):

    __tablename__ = "inventory_adjustments"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    # =====================================
    # TEAM
    # =====================================

    team_id = Column(
        Integer,
        ForeignKey("teams.id"),
        nullable=False
    )

    # =====================================
    # FINANCIAL YEAR
    # =====================================

    financial_year = Column(
        String,
        nullable=False
    )

    # =====================================
    # INVENTORY ADJUSTMENTS
    # =====================================

    cv_adjustment = Column(
        Integer,
        default=0
    )

    nvites_adjustment = Column(
        Integer,
        default=0
    )

    jobs_adjustment = Column(
        Integer,
        default=0
    )

    # =====================================
    # REASON
    # =====================================

    reason = Column(
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

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    # =====================================
    # RELATIONSHIP
    # =====================================

    team = relationship(
        "Team"
    )