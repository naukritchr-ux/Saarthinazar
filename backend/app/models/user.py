from sqlalchemy import (
    Column,
    Integer,
    String
)

from app.database import Base


class User(Base):

    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True
    )

    username = Column(
        String(100),
        unique=True
    )

    password = Column(
        String(255)
    )

    role = Column(
        String(50),
        default="employee"
    )

    profile_image = Column(
        String(255),
        nullable=True
    )