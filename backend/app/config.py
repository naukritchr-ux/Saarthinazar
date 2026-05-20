"""
app/config.py
"""

import os

from dotenv import load_dotenv

load_dotenv()


# =====================================================
# AUTH
# =====================================================

SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "super-secret-key"
)

ALGORITHM = os.getenv(
    "ALGORITHM",
    "HS256"
)

ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv(
        "ACCESS_TOKEN_EXPIRE_MINUTES",
        "480"  # 8 hours — lasts a full work day
    )
)


# =====================================================
# SUPABASE
# =====================================================

SUPABASE_URL = os.getenv(
    "SUPABASE_URL",
    ""
)

SUPABASE_ANON_KEY = os.getenv(
    "SUPABASE_ANON_KEY",
    ""
)

SUPABASE_SERVICE_KEY = os.getenv(
    "SUPABASE_SERVICE_KEY",
    ""
)


# =====================================================
# DATABASE
# =====================================================

_DB_USER     = os.getenv("DB_USER")
_DB_PASSWORD = os.getenv("DB_PASSWORD")
_DB_HOST     = os.getenv("DB_HOST")
_DB_PORT     = os.getenv("DB_PORT", "5432")
_DB_NAME     = os.getenv("DB_NAME")

if all([_DB_USER, _DB_PASSWORD, _DB_HOST, _DB_NAME]):
    DATABASE_URL = (
        f"postgresql+psycopg2://{_DB_USER}:{_DB_PASSWORD}"
        f"@{_DB_HOST}:{_DB_PORT}/{_DB_NAME}?sslmode=require"
    )
else:
    # Fallback to SQLite for local dev if no DB vars set
    DATABASE_URL = os.getenv(
        "DATABASE_URL",
        "sqlite:///./naukri_usage.db"
    )


# =====================================================
# FILE STORAGE
# =====================================================

UPLOAD_DIR = os.getenv(
    "UPLOAD_DIR",
    "uploaded_reports"
)


# =====================================================
# DEFAULT FINANCIAL YEAR
# =====================================================

DEFAULT_FINANCIAL_YEAR = os.getenv(
    "DEFAULT_FINANCIAL_YEAR",
    "2026-2027"
)


# =====================================================
# EMAIL (GMAIL SMTP)
# =====================================================

SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")


# =====================================================
# WHATSAPP (TWILIO)
# =====================================================

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
