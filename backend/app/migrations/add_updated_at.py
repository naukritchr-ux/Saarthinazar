from app.database import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'teams' AND column_name = 'updated_at'
        """))
        if result.fetchone():
            print("Column already exists.")
            return
        conn.execute(text(
            "ALTER TABLE teams ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
        ))
        conn.execute(text("UPDATE teams SET updated_at = NOW() WHERE updated_at IS NULL"))
        conn.commit()
        print("Done. updated_at column added.")

if __name__ == "__main__":
    run()