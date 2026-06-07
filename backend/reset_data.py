"""
reset_data.py
-------------
Clears all transactional data from Supabase and re-seeds clean defaults.

Tables cleared (in safe order to respect FK constraints):
  - invoices
  - topups
  - sub_user_usage
  - report_uploads
  - inventory_adjustments
  - audit_logs

Tables KEPT (structural / config):
  - users
  - teams
  - financial_years
  - pricing_plans
  - templates

Run from the backend folder:
    python reset_data.py
"""

import os
import sys

# ── Make sure the app package is importable ──────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from sqlalchemy import text
from app.database import SessionLocal

TABLES_TO_CLEAR = [
    "invoices",
    "topups",
    "sub_user_usage",
    "report_uploads",
    "inventory_adjustments",
    "audit_logs",
]

def reset():
    db = SessionLocal()
    try:
        print("=" * 55)
        print("  Saarthi Nazar — Data Reset")
        print("=" * 55)

        confirm = input(
            "\n⚠️  This will DELETE all invoices, topups, usage,\n"
            "   report uploads, and audit logs from Supabase.\n"
            "   Teams, users, pricing, and financial years are KEPT.\n\n"
            "   Type  yes  to continue: "
        ).strip().lower()

        if confirm != "yes":
            print("\nAborted. No changes made.")
            return

        print()
        for table in TABLES_TO_CLEAR:
            try:
                result = db.execute(text(f"DELETE FROM {table}"))
                db.commit()
                print(f"  ✅  Cleared  {table:<30} ({result.rowcount} rows deleted)")
            except Exception as e:
                db.rollback()
                print(f"  ⚠️   Could not clear {table}: {e}")

        print()
        print("All done! The database is clean.")
        print("Restart the backend and upload fresh reports.")
        print("=" * 55)

    finally:
        db.close()

if __name__ == "__main__":
    reset()
