from sqlalchemy import Column, Integer, String, Float
from app.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    invoice_number = Column(String(100))
    partner_name = Column(String(255))
    amount = Column(Float)
    status = Column(String(50))