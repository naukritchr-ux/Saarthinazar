from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class FinancialYear(Base):
    __tablename__ = "financial_years"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(20), unique=True, index=True, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
