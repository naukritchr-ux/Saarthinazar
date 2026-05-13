from sqlalchemy import Column, Date, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class ReportUpload(Base):
    __tablename__ = "report_uploads"

    id = Column(Integer, primary_key=True, index=True)
    resdex_file = Column(String(255), nullable=False)
    job_posting_file = Column(String(255), nullable=False)
    uploaded_by = Column(String(100), default="Kajal")
    range_start = Column(Date, nullable=True)
    range_end = Column(Date, nullable=True)
    status = Column(String(50), default="success")
    message = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
