from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.auth_schema import (
    RegisterSchema,
    LoginSchema,
    ChangePasswordSchema
)

from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token
)

router = APIRouter(prefix="/auth")


@router.post("/register")
def register(
    data: RegisterSchema,
    db: Session = Depends(get_db)
):

    existing_user = db.query(User).filter(
        User.username == data.username
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User already exists"
        )

    user = User(
        username=data.username,
        password=hash_password(data.password),
        role=data.role
    )

    db.add(user)
    db.commit()

    return {
        "message": "User registered"
    }


@router.post("/login")
def login(
    data: LoginSchema,
    db: Session = Depends(get_db)
):

    user = db.query(User).filter(
        User.username == data.username
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid username"
        )

    if not verify_password(
        data.password,
        user.password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid password"
        )

    token = create_access_token({
        "username": user.username,
        "role": user.role
    })

    return {
        "access_token": token,
        "role": user.role,
        "username": user.username
    }

@router.post("/change-password")
def change_password(
    data: ChangePasswordSchema,
    db: Session = Depends(get_db)
):

    user = db.query(User).first()

    if not verify_password(
        data.old_password,
        user.password
    ):

        raise HTTPException(
            status_code=400,
            detail="Old password incorrect"
        )

    user.password = hash_password(
        data.new_password
    )

    db.commit()

    return {
        "message": "Password updated"
    }