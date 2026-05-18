"""
Migration: Add financial_year column to topups table.
Run once with:  python -m app.migrations.add_topup_financial_year
"""

from app.database import engine
from sqlalchemy import text


def run():
    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'topups' AND column_name = 'financial_year'
        """))
        if result.fetchone():
            print("Column topups.financial_year already exists — nothing to do.")
            return

        # Add the column
        conn.execute(text("""
            ALTER TABLE topups
            ADD COLUMN financial_year VARCHAR(20) DEFAULT '2025-2026'
        """))

        # Backfill existing rows
        conn.execute(text("""
            UPDATE topups SET financial_year = '2025-2026'
            WHERE financial_year IS NULL
        """))

        conn.commit()
        print("Done. topups.financial_year column added and backfilled with '2025-2026'.")


if __name__ == "__main__":
    run()
