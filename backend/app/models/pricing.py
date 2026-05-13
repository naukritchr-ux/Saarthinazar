from sqlalchemy import Column, DateTime, Float, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class PricingPlan(Base):
    __tablename__ = "pricing_plans"

    id = Column(Integer, primary_key=True, index=True)
    period = Column(String(100), nullable=False)
    partner_type = Column(String(100), nullable=False)
    price = Column(Float, default=0)
    cv_limit = Column(Integer, default=0)
    nvites_limit = Column(Integer, default=0)
    jobs_limit = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
