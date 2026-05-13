from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.sql import func

from app.database import Base


class SubUserUsage(Base):
    __tablename__ = "subuser_usages"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    team_name = Column(String(255), nullable=False)
    name = Column(String(255), default="")
    email = Column(String(255), index=True, nullable=False)
    cv_usage = Column(Integer, default=0)
    nvites_usage = Column(Integer, default=0)
    jobs_usage = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
