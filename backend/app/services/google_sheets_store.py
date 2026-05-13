import json
from pathlib import Path
from typing import Iterable

from app.config import GOOGLE_SHEETS_CREDENTIALS_FILE, GOOGLE_SHEETS_SPREADSHEET_ID


class GoogleSheetsStore:
    """Optional Google Sheets persistence adapter.

    The app still writes to SQLite for local development. When Google credentials
    are provided, route handlers can also mirror operational rows into Sheets.
    """

    def __init__(self):
        self.spreadsheet_id = GOOGLE_SHEETS_SPREADSHEET_ID
        self.credentials_file = GOOGLE_SHEETS_CREDENTIALS_FILE

    @property
    def enabled(self) -> bool:
        return bool(self.spreadsheet_id and self.credentials_file and Path(self.credentials_file).exists())

    def append_rows(self, sheet_name: str, rows: Iterable[dict]) -> dict:
        rows = list(rows)
        if not self.enabled:
            return {
                "enabled": False,
                "message": "Google Sheets is not configured. Set GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_CREDENTIALS_FILE.",
                "rows_queued": len(rows),
            }

        try:
            from google.oauth2.service_account import Credentials
            from googleapiclient.discovery import build
        except ImportError:
            return {
                "enabled": False,
                "message": "Google Sheets dependencies are missing. Install google-api-python-client and google-auth.",
                "rows_queued": len(rows),
            }

        credentials = Credentials.from_service_account_file(
            self.credentials_file,
            scopes=["https://www.googleapis.com/auth/spreadsheets"],
        )
        service = build("sheets", "v4", credentials=credentials)
        values = [[json.dumps(row, default=str)] for row in rows]
        service.spreadsheets().values().append(
            spreadsheetId=self.spreadsheet_id,
            range=f"{sheet_name}!A:A",
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": values},
        ).execute()
        return {"enabled": True, "message": "Rows appended to Google Sheets.", "rows_appended": len(rows)}
