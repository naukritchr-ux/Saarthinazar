from sqlalchemy import inspect, text

from app.database import Base, SessionLocal, engine
from app.models.audit import AuditLog
from app.models.financial_year import FinancialYear
from app.models.invoice import Invoice
from app.models.pricing import PricingPlan
from app.models.report_upload import ReportUpload
from app.models.template import UploadTemplate
from app.models.team import Team
from app.models.topup import TopUp
from app.models.usage import SubUserUsage
from app.models.user import User
from app.services.naukri_rules import seed_defaults


EXPECTED_COLUMNS = {
    "teams": {
        "partner_name": "VARCHAR(255) DEFAULT ''",
        "partner_email": "VARCHAR(255) DEFAULT ''",
        "partner_type": "VARCHAR(100) DEFAULT 'New Partner'",
        "join_period": "VARCHAR(100) DEFAULT 'Q1 (Apr-Jun)'",
        "licence_fee": "FLOAT DEFAULT 0",
        "cost_share": "FLOAT DEFAULT 0",
        "is_active": "BOOLEAN DEFAULT 1",
    },
    "topups": {
        "team_id": "INTEGER",
        "purchase_date": "DATE",
        "added_by": "VARCHAR(100) DEFAULT 'Kajal'",
        "created_at": "DATETIME DEFAULT CURRENT_TIMESTAMP",
    },
    "invoices": {
        "team_id": "INTEGER",
        "invoice_type": "VARCHAR(50) DEFAULT 'overage'",
        "invoice_date": "DATE",
        "due_date": "DATE",
        "paid_amount": "FLOAT DEFAULT 0",
        "payment_date": "DATE",
        "notes": "TEXT DEFAULT ''",
        "items_json": "TEXT DEFAULT '[]'",
        "created_at": "DATETIME DEFAULT CURRENT_TIMESTAMP",
    },
}


def ensure_database():
    # Keep model imports above: Base.metadata needs all tables registered.
    _ = (AuditLog, FinancialYear, Invoice, PricingPlan, ReportUpload, SubUserUsage, Team, TopUp, UploadTemplate, User)
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)

    with engine.begin() as connection:
        for table_name, columns in EXPECTED_COLUMNS.items():
            if table_name not in inspector.get_table_names():
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            for column_name, ddl in columns.items():
                if column_name not in existing:
                    connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}"))

    db = SessionLocal()
    try:
        seed_defaults(db)
    finally:
        db.close()
