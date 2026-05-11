from sqlalchemy import Column, Integer, String
from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True)
    name = Column(String(255))
    licences = Column(Integer)
    cv_limit = Column(Integer)
    nvites_limit = Column(Integer)
    jobs_limit = Column(Integer)