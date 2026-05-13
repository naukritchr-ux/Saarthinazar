from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func
from app.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(100), unique=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    partner_name = Column(String(255), nullable=False)
    invoice_type = Column(String(50), default="overage")
    invoice_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    amount = Column(Float, default=0)
    paid_amount = Column(Float, default=0)
    status = Column(String(50), default="Unpaid")
    payment_date = Column(Date, nullable=True)
    notes = Column(Text, default="")
    items_json = Column(Text, default="[]")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
