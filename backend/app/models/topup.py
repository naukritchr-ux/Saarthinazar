from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.sql import func
from app.database import Base


class TopUp(Base):
    __tablename__ = "topups"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    team_name = Column(String(255), nullable=False)
    financial_year = Column(String(20), nullable=True, default="2025-2026")
    cv_topup = Column(Integer, default=0)
    nvites_topup = Column(Integer, default=0)
    jobs_topup = Column(Integer, default=0)
    amount = Column(Float, default=0)
    subtotal = Column(Float, default=0)
    gst_amount = Column(Float, default=0)
    purchase_date = Column(Date, nullable=True)
    added_by = Column(String(100), default="Kajal")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
