from app.database import Base, engine, SessionLocal

# =====================================================
# IMPORT ALL MODELS
# =====================================================

from app.models.audit import AuditLog
from app.models.financial_year import FinancialYear
from app.models.invoice import Invoice
from app.models.pricing import PricingPlan
from app.models.report_upload import ReportUpload
from app.models.team import Team
from app.models.topup import TopUp
from app.models.usage import SubUserUsage
from app.models.user import User

from app.services.naukri_rules import seed_defaults


# =====================================================
# INIT DATABASE
# =====================================================

def init():

    print("Creating database tables...")

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()

    try:

        print("Seeding default data...")

        seed_defaults(db)

        print("Database initialized successfully.")

    finally:

        db.close()


if __name__ == "__main__":

    init()