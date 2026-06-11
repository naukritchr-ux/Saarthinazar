"""
app/services/report_processor.py
"""

from html.parser import HTMLParser
from pathlib import Path

import pandas as pd

from app.services.naukri_rules import (
    parse_date_range_from_text,
    validate_report_ranges,
)


class ReportProcessor:
    """
    Reads Naukri reports,
    validates financial year range,
    normalizes usage data,
    and merges reports by email.
    """

    EMAIL_ALIASES = (
        "email",
        "email id",
        "subuser email",
        "sub user email",
        "subuser email id",
        "user email",
    )

    NAME_ALIASES = (
        "name",
        "subuser",
        "sub user",
        "user name",
        "subuser name",
    )

    TEAM_ALIASES = (
        "team",
        "team name",
        "company",
        "partner",
        "franchise",
    )

    CV_ALIASES = (
        "cv access by company",
        "cv access total",
        "cv access",
        "resumes",
        "resume access",
        "cv used",
    )

    NVITES_ALIASES = (
        "nvites",
        "n-vites",
        "mass mails",
        "mass mail",
        "nvites used",
    )

    JOB_ALIASES = (
        "total job expense",
        "job postings",
        "jobs",
        "jobs used",
        "posting usage",
    )

    # =====================================================
    # INTERNAL — HTML CELL EXTRACTOR
    # =====================================================

    class _CellExtractor(HTMLParser):

        def __init__(self):

            super().__init__()

            self.first_cell = ""

            self._in_cell = False

            self._done = False

        def handle_starttag(self, tag, attrs):

            if not self._done and tag in ("td", "th"):

                self._in_cell = True

        def handle_endtag(self, tag):

            if tag in ("td", "th"):

                self._in_cell = False

        def handle_data(self, data):

            if self._in_cell and not self._done:

                text = data.strip()

                if text:

                    self.first_cell = text

                    self._done = True

    # =====================================================
    # INTERNAL — DETECT HTML XLS
    # =====================================================

    def _is_html_file(
        self,
        path: str
    ) -> bool:

        try:

            with open(path, "rb") as file:

                header = file.read(200)

            return b"<html" in header.lower()

        except Exception:

            return False

    # =====================================================
    # INTERNAL — READ HTML XLS
    # =====================================================

    def _read_html_xls(
        self,
        path: str,
        header_row: int = 1,
    ) -> pd.DataFrame:

        with open(
            path,
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as file:

            content = file.read()

        if "shLink" in content and "sheet001.htm" in content:

            stem = Path(path).stem

            raise ValueError(

                f"The file '{Path(path).name}' is a "
                f"multi-part HTML Workbook.\n\n"

                f"Its actual data exists inside:\n"
                f"'{stem}_files/sheet001.htm'\n\n"

                f"Please:\n"
                f"1. Open the file in Excel\n"
                f"2. File → Save As\n"
                f"3. Save as .xlsx or .csv\n"
                f"4. Upload again."
            )

        import io

        tables = pd.read_html(
            io.StringIO(content),
            header=header_row,
        )

        if not tables:

            raise ValueError(
                f"No table found inside '{Path(path).name}'."
            )

        return tables[0]

    # =====================================================
    # READ FILE
    # =====================================================

    def _read_file(
        self,
        path: str,
    ) -> pd.DataFrame:

        suffix = Path(path).suffix.lower()

        filename = Path(path).name.lower()

        # ==========================================
        # DETECT HEADER ROW
        # ==========================================

        header_row = 1

        # Job posting files: Naukri exports them as "Job Posting Report..."
        # or "SUSER-..." (Sub-User wise report). Both need header_row=4.
        if "job" in filename or "suser" in filename:

            header_row = 4

        print("READING FILE:", filename)

        print("USING HEADER ROW:", header_row)

        # ==========================================
        # CSV
        # ==========================================

        if suffix == ".csv":

            return pd.read_csv(
                path,
                header=header_row
            )

        # ==========================================
        # XLS
        # ==========================================

        if suffix == ".xls":

            if self._is_html_file(path):

                return self._read_html_xls(
                    path,
                    header_row=header_row
                )

            return pd.read_excel(
                path,
                header=header_row,
                engine="xlrd",
            )

        # ==========================================
        # XLSX
        # ==========================================

        return pd.read_excel(
            path,
            header=header_row
        )

    # =====================================================
    # READ HEADER TEXT
    # =====================================================

    def _header_text(
        self,
        path: str
    ) -> str:

        suffix = Path(path).suffix.lower()

        try:

            if suffix == ".csv":

                raw = pd.read_csv(
                    path,
                    header=None,
                    nrows=30
                )

            elif suffix == ".xls":

                if self._is_html_file(path):

                    import io

                    with open(
                        path,
                        "r",
                        encoding="utf-8",
                        errors="ignore"
                    ) as file:

                        content = file.read()

                    tables = pd.read_html(
                        io.StringIO(content)
                    )

                    raw = tables[0]

                else:

                    raw = pd.read_excel(
                        path,
                        header=None,
                        nrows=30,
                        engine="xlrd"
                    )

            else:

                raw = pd.read_excel(
                    path,
                    header=None,
                    nrows=30
                )

            for row_index in range(len(raw)):

                row_values = [

                    str(value).strip()

                    for value in raw.iloc[row_index].fillna("")
                ]

                for col_index, value in enumerate(row_values):

                    lower_value = value.lower()

                    if (
                        "01-apr" in lower_value
                        and
                        "31-mar" in lower_value
                    ):

                        return value

                    if "duration" in lower_value:

                        if col_index + 1 < len(row_values):

                            next_value = row_values[col_index + 1]

                            if next_value.strip():

                                return next_value

            text = " ".join(

                str(value)

                for value in raw.fillna("").values.flatten()
            )

            return text

        except Exception as exc:

            print("HEADER READ ERROR:", exc)

            return Path(path).name

    # =====================================================
    # NORMALIZE COLUMNS
    # =====================================================

    def _normalize_columns(
        self,
        df: pd.DataFrame,
    ) -> pd.DataFrame:

        df = df.copy()

        df.columns = [

            str(col)
            .strip()
            .strip("'")
            .strip('"')
            .lower()

            for col in df.columns
        ]

        print("NORMALIZED COLUMNS:")

        print(df.columns.tolist())

        return df

    # =====================================================
    # FIND COLUMN
    # =====================================================

    def _find_column(
        self,
        df: pd.DataFrame,
        aliases: tuple[str, ...],
        required: bool = True,
    ) -> str | None:

        # Normalise all column names once
        compact_cols = [
            (
                col,
                str(col).strip().strip("'").strip('"').lower()
            )
            for col in df.columns
        ]

        # Priority 1: exact match against any alias (aliases are ordered
        # most-specific first, so the first exact hit wins)
        for alias in aliases:
            for col, compact in compact_cols:
                if compact == alias:
                    return col

        # Priority 2: alias is a substring of the column header —
        # iterate aliases first so the most-specific alias wins, not
        # whichever column happens to appear earliest in the sheet.
        for alias in aliases:
            for col, compact in compact_cols:
                if alias in compact:
                    return col

        if required:
            raise ValueError(
                f"Could not find required column. "
                f"Expected one of: "
                f"{', '.join(aliases)}"
            )

        return None

    # =====================================================
    # CLEAN NUMERIC
    # =====================================================

    def _clean_numeric(
        self,
        series: pd.Series,
    ) -> pd.Series:

        return (

            pd.to_numeric(

                series
                .fillna(0)
                .astype(str)
                .str.replace(
                    ",",
                    "",
                    regex=False
                ),

                errors="coerce",
            )

            .fillna(0)

            .astype(int)
        )

    # =====================================================
    # NORMALIZE RESDEX
    # =====================================================

    def _normalize_resdex(
        self,
        df: pd.DataFrame,
    ) -> pd.DataFrame:

        df = self._normalize_columns(df)

        email_col = self._find_column(
            df,
            self.EMAIL_ALIASES,
            required=False
        )

        subuser_col = self._find_column(
            df,
            self.NAME_ALIASES
        )

        if not email_col:

            df["parsed_email"] = (

                df[subuser_col]
                .astype(str)
                .str.extract(
                    r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"
                )[0]
            )

            email_col = "parsed_email"

        df["parsed_name"] = (

            df[subuser_col]
            .astype(str)
            .str.split("|")
            .str[0]
            .str.strip()
        )

        cv_col = self._find_column(
            df,
            self.CV_ALIASES
        )

        nvites_col = self._find_column(
            df,
            self.NVITES_ALIASES
        )

        team_col = self._find_column(
            df,
            self.TEAM_ALIASES,
            required=False
        )

        normalized_df = pd.DataFrame({

            "email": (

                df[email_col]
                .astype(str)
                .str.strip()
                .str.lower()
            ),

            "name":
                df["parsed_name"],

            "team_name": (

                df[team_col]
                .astype(str)
                .str.strip()

                if team_col

                else ""
            ),

            "cv_usage":
                self._clean_numeric(df[cv_col]),

            "nvites_usage":
                self._clean_numeric(df[nvites_col]),
        })

        # ==========================================
        # FILTER EMPTY EMAILS
        # ==========================================

        normalized_df = normalized_df[
            normalized_df["email"].notna()
        ]

        normalized_df = normalized_df[
            normalized_df["email"] != ""
        ]

        return normalized_df

    # =====================================================
    # NORMALIZE JOBS (with team name)
    # =====================================================

    def _normalize_jobs_with_team(
        self,
        df: pd.DataFrame,
    ) -> pd.DataFrame:
        """Like _normalize_jobs but also captures the team name column.
        Used during the merge so SUSER team names serve as fallback
        for subusers who appear only in the job posting report."""

        df = self._normalize_columns(df)

        email_col = self._find_column(
            df, self.EMAIL_ALIASES, required=False
        )
        if not email_col:
            email_col = self._find_column(df, ("subuser", "sub user"))

        jobs_col = self._find_column(df, self.JOB_ALIASES)

        team_col = self._find_column(
            df, self.TEAM_ALIASES, required=False
        )

        normalized_df = pd.DataFrame({
            "email": (
                df[email_col]
                .astype(str)
                .str.extract(
                    r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"
                )[0]
                .str.strip()
                .str.lower()
            ),
            "jobs_usage": self._clean_numeric(df[jobs_col]),
            "team_name": (
                df[team_col].astype(str).str.strip()
                if team_col else ""
            ),
        })

        normalized_df = normalized_df[
            normalized_df["email"].notna()
        ]
        normalized_df = normalized_df[
            normalized_df["email"] != ""
        ]

        # Deduplicate by email
        normalized_df = (
            normalized_df
            .groupby("email", as_index=False)
            .agg({"jobs_usage": "sum", "team_name": "first"})
        )

        return normalized_df

    # =====================================================
    # NORMALIZE JOBS
    # =====================================================

    def _normalize_jobs(
        self,
        df: pd.DataFrame,
    ) -> pd.DataFrame:

        df = self._normalize_columns(df)

        email_col = self._find_column(
            df,
            self.EMAIL_ALIASES,
            required=False
        )

        if not email_col:

            email_col = self._find_column(
                df,
                ("subuser", "sub user")
            )

        jobs_col = self._find_column(
            df,
            self.JOB_ALIASES
        )

        normalized_df = pd.DataFrame({

            "email": (

                df[email_col]
                .astype(str)
                .str.extract(
                    r"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})"
                )[0]
                .str.strip()
                .str.lower()
            ),

            "jobs_usage":
                self._clean_numeric(df[jobs_col]),
        })

        # ==========================================
        # FILTER EMPTY EMAILS
        # ==========================================

        normalized_df = normalized_df[
            normalized_df["email"].notna()
        ]

        normalized_df = normalized_df[
            normalized_df["email"] != ""
        ]

        return normalized_df

    # =====================================================
    # PROCESS REPORTS
    # =====================================================

    def process_reports(
        self,
        resdex_path: str,
        job_path: str,
        financial_year: str,
    ):

        resdex_text = self._header_text(
            resdex_path
        )

        job_text = self._header_text(
            job_path
        )

        print("RESDEX HEADER:")
        print(resdex_text)

        print("JOB HEADER:")
        print(job_text)

        # ==========================================
        # DATE VALIDATION
        # ==========================================

        resdex_range = parse_date_range_from_text(
            resdex_text
        )

        job_range = parse_date_range_from_text(
            job_text
        )

        validate_report_ranges(
            resdex_range,
            job_range,
            financial_year,
        )

        # ==========================================
        # READ FILES
        # ==========================================

        resdex_df = self._normalize_resdex(
            self._read_file(resdex_path)
        )

        job_df = self._normalize_jobs(
            self._read_file(job_path)
        )

        # ==========================================
        # REMOVE DUPLICATE EMAILS
        # ==========================================

        resdex_df = (

            resdex_df

            .groupby("email", as_index=False)

            .agg({

                "name": "first",

                "team_name": "first",

                "cv_usage": "sum",

                "nvites_usage": "sum",
            })
        )

        job_df = (

            job_df

            .groupby("email", as_index=False)

            .agg({

                "jobs_usage": "sum",
            })
        )

        # ==========================================
        # MERGE — primary key is subuser EMAIL
        # Team names are intentionally NOT used as
        # the join key because they differ between
        # reports (trailing spaces, case, formatting).
        # After merging by email, the Resdex team_name
        # is preferred; SUSER team_name is used as
        # fallback for rows that appear only in jobs.
        # ==========================================

        # Bring SUSER team_name into job_df before merge
        # so we can use it as fallback
        job_df_full = self._normalize_jobs_with_team(
            self._read_file(job_path)
        )

        merged = pd.merge(
            resdex_df,
            job_df_full,
            on="email",
            how="outer",
            suffixes=("_resdex", "_jobs"),
        ).fillna(0)

        merged["name"] = (
            merged["name"]
            .replace(0, "")
        )

        # Prefer Resdex team name; fall back to SUSER team name
        if "team_name_resdex" in merged.columns and "team_name_jobs" in merged.columns:
            merged["team_name"] = merged.apply(
                lambda r: r["team_name_resdex"]
                if str(r["team_name_resdex"]).strip() not in ("", "0", "nan", "none")
                else r["team_name_jobs"],
                axis=1,
            )
            merged = merged.drop(columns=["team_name_resdex", "team_name_jobs"], errors="ignore")
        elif "team_name" not in merged.columns:
            merged["team_name"] = ""

        # ==========================================
        # CLEAN TEAM NAMES
        # ==========================================

        merged["team_name"] = (
            merged["team_name"]
            .fillna("")
            .astype(str)
            .str.strip()
            .str.replace(r"\s+", " ", regex=True)
            .replace("0", "")
            .replace("nan", "")
            .replace("none", "")
        )

        # ==========================================
        # REMOVE EMPTY / STUB TEAM ROWS
        # ==========================================

        # Remove rows with no team name at all + zero usage
        merged = merged[
            ~(
                (merged["team_name"] == "")
                &
                (merged["cv_usage"] == 0)
                &
                (merged["nvites_usage"] == 0)
            )
        ]

        # Remove known Naukri stub / inactive sub-accounts.
        # These appear in the report as separate rows but are not real
        # billable partners (e.g. "Avadai Inactive", "Surbhi Mr India").
        STUB_SUFFIXES = ("inactive", "mr india", " in ")
        def _is_stub(name: str) -> bool:
            n = name.lower().strip()
            return any(n.endswith(s) or s in n for s in STUB_SUFFIXES)

        merged = merged[~merged["team_name"].apply(_is_stub)]

        # Remove rows where ALL three usage columns are zero — these are
        # sub-users who appear in the report header but did nothing this month.
        merged = merged[
            ~(
                (merged["cv_usage"] == 0)
                &
                (merged["nvites_usage"] == 0)
                &
                (merged["jobs_usage"] == 0)
            )
        ]

        # ==========================================
        # WARNINGS
        # ==========================================

        warnings = []

        missing_resdex = (

            merged
            .loc[
                merged["cv_usage"].eq(0)
                &
                merged["nvites_usage"].eq(0),

                "email",
            ]
            .tolist()
        )

        missing_jobs = (

            merged
            .loc[
                merged["jobs_usage"].eq(0),
                "email",
            ]
            .tolist()
        )

        if missing_resdex:

            warnings.append({

                "type":
                    "missing_resdex",

                "emails":
                    missing_resdex,
            })

        if missing_jobs:

            warnings.append({

                "type":
                    "missing_jobs",

                "emails":
                    missing_jobs,
            })

        # ==========================================
        # RETURN
        # ==========================================

        return {

            "range_start":
                resdex_range[0],

            "range_end":
                resdex_range[1],

            "rows": (

                merged[[
                    "email",
                    "name",
                    "team_name",
                    "cv_usage",
                    "nvites_usage",
                    "jobs_usage",
                ]]

                .to_dict("records")
            ),

            "warnings":
                warnings,
        }