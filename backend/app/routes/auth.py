from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    UploadFile,
    File
)

from sqlalchemy.orm import Session

from app.database import get_db

from app.models.user import User

from app.schemas.auth_schema import (
    LoginSchema,
    ChangePasswordSchema
)

from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)

import os
import shutil

router = APIRouter(prefix="/auth")

UPLOAD_DIR = "uploads/pfp"

os.makedirs(UPLOAD_DIR, exist_ok=True)


# LOGIN
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
        "username": user.username,
        "profile_picture": user.profile_picture
    }


# CURRENT USER
@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user)
):

    return {
        "username": current_user.username,
        "role": current_user.role,
        "profile_picture": current_user.profile_picture
    }


# CHANGE PASSWORD
@router.post("/change-password")
def change_password(
    data: ChangePasswordSchema,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    if not verify_password(
        data.old_password,
        current_user.password
    ):

        raise HTTPException(
            status_code=400,
            detail="Old password incorrect"
        )

    current_user.password = hash_password(
        data.new_password
    )

    db.commit()

    return {
        "message": "Password updated"
    }


# UPLOAD PROFILE PICTURE
@router.post("/upload-pfp")
def upload_pfp(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    extension = file.filename.split(".")[-1]

    filename = f"{current_user.username}.{extension}"

    filepath = os.path.join(
        UPLOAD_DIR,
        filename
    )

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(
            file.file,
            buffer
        )

    current_user.profile_picture = filepath

    db.commit()

    return {
        "message": "Profile picture uploaded",
        "profile_picture": filepath
    }


# DELETE PROFILE PICTURE
@router.delete("/delete-pfp")
def delete_pfp(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.profile_picture:
        # Delete file from disk if it exists
        if os.path.exists(current_user.profile_picture):
            os.remove(current_user.profile_picture)
        current_user.profile_picture = None
        db.commit()

    return {"message": "Profile picture removed"}