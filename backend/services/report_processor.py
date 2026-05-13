from pathlib import Path

import pandas as pd

from app.services.naukri_rules import parse_date_range_from_text, validate_report_ranges


class ReportProcessor:
    """Reads Naukri reports, validates the date range, and rolls usage up by email."""

    EMAIL_ALIASES = ("email", "email id", "subuser email", "sub user email", "subuser email id", "user email")
    NAME_ALIASES = ("name", "subuser", "sub user", "user name", "subuser name")
    TEAM_ALIASES = ("team", "team name", "company", "partner", "franchise")
    CV_ALIASES = ("cv access total", "cv access", "resumes", "resume access", "cv used")
    NVITES_ALIASES = ("nvites", "n-vites", "mass mails", "mass mail", "nvites used")
    JOB_ALIASES = ("total job expense", "job postings", "jobs", "jobs used", "posting usage")

    def _read_file(self, path: str) -> pd.DataFrame:
        suffix = Path(path).suffix.lower()
        if suffix == ".csv":
            return pd.read_csv(path)
        return pd.read_excel(path)

    def _header_text(self, path: str) -> str:
        suffix = Path(path).suffix.lower()
        try:
            if suffix == ".csv":
                raw = pd.read_csv(path, header=None, nrows=8)
            else:
                raw = pd.read_excel(path, header=None, nrows=8)
        except Exception:
            return Path(path).name
        return " ".join(str(value) for value in raw.fillna("").values.flatten())

    def _normalize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df.columns = [str(column).strip().lower() for column in df.columns]
        return df

    def _find_column(self, df: pd.DataFrame, aliases: tuple[str, ...], required: bool = True) -> str | None:
        for column in df.columns:
            compact = column.strip().lower()
            if compact in aliases or any(alias in compact for alias in aliases):
                return column
        if required:
            raise ValueError(f"Could not find required column. Expected one of: {', '.join(aliases)}")
        return None

    def _clean_numeric(self, series: pd.Series) -> pd.Series:
        return pd.to_numeric(series.fillna(0).astype(str).str.replace(",", "", regex=False), errors="coerce").fillna(0).astype(int)

    def _normalize_resdex(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._normalize_columns(df)
        email_col = self._find_column(df, self.EMAIL_ALIASES)
        cv_col = self._find_column(df, self.CV_ALIASES)
        nvites_col = self._find_column(df, self.NVITES_ALIASES)
        name_col = self._find_column(df, self.NAME_ALIASES, required=False)
        team_col = self._find_column(df, self.TEAM_ALIASES, required=False)
        return pd.DataFrame(
            {
                "email": df[email_col].astype(str).str.strip().str.lower(),
                "name": df[name_col].astype(str).str.strip() if name_col else "",
                "team_name": df[team_col].astype(str).str.strip() if team_col else "",
                "cv_usage": self._clean_numeric(df[cv_col]),
                "nvites_usage": self._clean_numeric(df[nvites_col]),
            }
        )

    def _normalize_jobs(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._normalize_columns(df)
        email_col = self._find_column(df, self.EMAIL_ALIASES)
        jobs_col = self._find_column(df, self.JOB_ALIASES)
        team_col = self._find_column(df, self.TEAM_ALIASES, required=False)
        return pd.DataFrame(
            {
                "email": df[email_col].astype(str).str.strip().str.lower(),
                "job_team_name": df[team_col].astype(str).str.strip() if team_col else "",
                "jobs_usage": self._clean_numeric(df[jobs_col]),
            }
        )

    def process_reports(self, resdex_path: str, job_path: str, financial_year: str):
        resdex_range = parse_date_range_from_text(self._header_text(resdex_path))
        job_range = parse_date_range_from_text(self._header_text(job_path))
        validate_report_ranges(resdex_range, job_range, financial_year)

        resdex_df = self._normalize_resdex(self._read_file(resdex_path))
        job_df = self._normalize_jobs(self._read_file(job_path))
        merged = pd.merge(resdex_df, job_df, on="email", how="outer").fillna(0)
        merged["name"] = merged["name"].replace(0, "")
        merged["team_name"] = merged["team_name"].where(merged["team_name"] != 0, merged["job_team_name"])

        warnings = []
        missing_resdex = merged.loc[merged["cv_usage"].eq(0) & merged["nvites_usage"].eq(0), "email"].tolist()
        missing_jobs = merged.loc[merged["jobs_usage"].eq(0), "email"].tolist()
        if missing_resdex:
            warnings.append({"type": "missing_resdex", "emails": missing_resdex})
        if missing_jobs:
            warnings.append({"type": "missing_jobs", "emails": missing_jobs})

        return {
            "range_start": resdex_range[0],
            "range_end": resdex_range[1],
            "rows": merged[["email", "name", "team_name", "cv_usage", "nvites_usage", "jobs_usage"]].to_dict("records"),
            "warnings": warnings,
        }
