from sqlalchemy import Column, Integer, Float, String
from app.database import Base


class TopUp(Base):
    __tablename__ = "topups"

    id = Column(Integer, primary_key=True)
    team_name = Column(String(255))
    cv_topup = Column(Integer)
    nvites_topup = Column(Integer)
    jobs_topup = Column(Integer)
    amount = Column(Float)