from sqlalchemy import Boolean, Column, Float, Integer, String
from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, index=True, nullable=False)
    partner_name = Column(String(255), default="")
    partner_email = Column(String(255), default="")
    licences = Column(Integer, default=1)
    partner_type = Column(String(100), default="New Partner")
    join_period = Column(String(100), default="Q1 (Apr-Jun)")
    licence_fee = Column(Float, default=0)
    cost_share = Column(Float, default=0)
    cv_limit = Column(Integer, default=0)
    nvites_limit = Column(Integer, default=0)
    jobs_limit = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
