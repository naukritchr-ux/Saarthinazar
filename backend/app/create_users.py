from app.database import SessionLocal
from app.models.user import User
from app.utils.security import hash_password

db = SessionLocal()

users = [
    {
        "username": "rashesh",
        "password": "admin123",
        "role": "admin"
    },
    {
        "username": "kajal",
        "password": "employee123",
        "role": "employee"
    }
]

for u in users:

    existing = db.query(User).filter(
        User.username == u["username"]
    ).first()

    if not existing:

        user = User(
            username=u["username"],
            password=hash_password(u["password"]),
            role=u["role"]
        )

        db.add(user)

db.commit()

print("Default users created")