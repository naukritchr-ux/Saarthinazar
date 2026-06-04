# backend/app/services/supabase_storage.py

import os
import mimetypes

# ---------------------------------------------------------------------------
# Lazy import — supabase package is optional
# Falls back to local serving if unavailable
# ---------------------------------------------------------------------------

try:
    from supabase import create_client, Client

    _SUPABASE_AVAILABLE = True

except ImportError:

    _SUPABASE_AVAILABLE = False


# =====================================================
# GLOBALS
# =====================================================

_client = None

BUCKET = "invoices"


# =====================================================
# INTERNAL CLIENT LOADER
# =====================================================

def _get_client():
    """
    Return cached Supabase client.
    Returns None if not configured properly.
    """

    global _client

    if _client is not None:
        return _client

    if not _SUPABASE_AVAILABLE:
        print("[supabase_storage] ❌ supabase package not installed")
        return None

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    print("SUPABASE URL FOUND:", bool(url))
    print("SUPABASE KEY FOUND:", bool(key))
    print("SUPABASE PACKAGE AVAILABLE:", _SUPABASE_AVAILABLE)

    if not url or not key or key == "your_service_role_key_here":
        print("[supabase_storage] ❌ Missing Supabase configuration")
        return None

    try:
        _client = create_client(url, key)
        print("[supabase_storage] ✅ Client initialized")
        return _client

    except Exception as exc:
        print(f"[supabase_storage] ❌ Could not create client: {exc}")
        return None


# =====================================================
# PUBLIC API
# =====================================================

def upload_invoice_pdf(local_path: str, filename: str) -> str | None:
    """
    Upload invoice PDF to Supabase Storage and return public URL.

    IMPORTANT: The local file is only deleted AFTER a confirmed
    successful upload. If upload fails, the local file is kept
    so the download route can still serve it.
    """

    client = _get_client()

    if client is None:
        print("[supabase_storage] ❌ Supabase client NOT configured")
        return None

    if not os.path.exists(local_path):
        raise FileNotFoundError(f"PDF file not found: {local_path}")

    with open(local_path, "rb") as f:
        data = f.read()

    content_type = mimetypes.guess_type(filename)[0] or "application/pdf"

    try:
        client.storage.from_(BUCKET).upload(
            path=filename,
            file=data,
            file_options={
                "content-type": content_type,
                "upsert": "true",
            },
        )

        supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
        public_url = (
            f"{supabase_url}/storage/v1/object/public/{BUCKET}/{filename}"
        )

        print("✅ Uploaded to Supabase:", public_url)

        # ── Only delete local file AFTER confirmed upload ──────────
        try:
            if os.path.exists(local_path):
                os.remove(local_path)
                print("🗑️ Deleted local temp PDF:", local_path)
        except Exception as exc:
            print("⚠️ Could not delete local PDF:", str(exc))

        return public_url

    except Exception as exc:
        print(f"[supabase_storage] ❌ Upload failed — local file kept: {exc}")
        # Return None so caller falls back to local path
        return None


# =====================================================
# CONFIG CHECK
# =====================================================

def is_configured() -> bool:
    """Return True if Supabase storage is properly configured."""
    return _get_client() is not None
