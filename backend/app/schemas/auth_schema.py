from pydantic import BaseModel


class RegisterSchema(BaseModel):
    username: str
    password: str
    role: str


class LoginSchema(BaseModel):
    username: str
    password: str

class ChangePasswordSchema(BaseModel):
    old_password: str
    new_password: str