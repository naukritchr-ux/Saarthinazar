from app.database import engine
from app.models.user import User
from app.models.team import Team
from app.models.invoice import Invoice
from app.models.topup import TopUp

from app.database import Base

Base.metadata.create_all(bind=engine)

print("Tables created")