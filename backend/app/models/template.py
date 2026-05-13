from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class UploadTemplate(Base):
    __tablename__ = "upload_templates"

    id = Column(Integer, primary_key=True, index=True)
    template_type = Column(String(50), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    file_name = Column(String(255), default="")
    content = Column(Text, default="")
    created_by = Column(String(100), default="system")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
