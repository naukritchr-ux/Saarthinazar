"""
Migration: Add ALL missing columns to the topups table.
Run once with:  python -m app.migrations.add_topup_columns
"""

from app.database import engine
from sqlalchemy import text


COLUMNS_TO_ADD = [
    # column_name, sql_type, default
    ("financial_year", "VARCHAR(20)", "'2025-2026'"),
    ("subtotal",       "FLOAT",       "0"),
    ("gst_amount",     "FLOAT",       "0"),
    ("team_name",      "VARCHAR(255)", "''"),
]


def run():
    with engine.connect() as conn:
        for col, dtype, default in COLUMNS_TO_ADD:
            result = conn.execute(text(f"""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'topups' AND column_name = '{col}'
            """))
            if result.fetchone():
                print(f"  Column topups.{col} already exists — skipping.")
                continue

            conn.execute(text(f"""
                ALTER TABLE topups
                ADD COLUMN {col} {dtype} DEFAULT {default}
            """))

            # Backfill nulls
            conn.execute(text(f"""
                UPDATE topups SET {col} = {default}
                WHERE {col} IS NULL
            """))

            print(f"  ✓ Added topups.{col}")

        conn.commit()
        print("Done. All missing topup columns added.")


if __name__ == "__main__":
    run()
