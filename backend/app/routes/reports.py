import re
import shutil

from pathlib import Path

import pandas as pd

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
)

from sqlalchemy.orm import Session

from app.database import get_db

from app.models.report_upload import ReportUpload
from app.models.team import Team
from app.models.usage import SubUserUsage

from app.services.naukri_rules import (
    add_audit,
    create_team_from_upload,
)

from app.services.report_processor import ReportProcessor


router = APIRouter(prefix="/reports")

UPLOAD_DIR = Path("uploaded_reports")


# ---------------------------------------------------------------------------
# Canonical team name normalizer
# Used EVERYWHERE: building the map, looking up teams, creating new teams.
# "Talent Corner." / "TALENT CORNER" / "talent corner " → "talent corner"
# ---------------------------------------------------------------------------

def canonical(name: str) -> str:
    """Return a fully-normalized key used only for deduplication lookups."""
    s = str(name or "").lower().strip()
    s = re.sub(r"[^a-z0-9\s]", "", s)   # strip punctuation
    s = re.sub(r"\s+", " ", s).strip()  # collapse whitespace
    return s or "unassigned"


def display_name(name: str) -> str:
    """Return a clean title-cased display name stored in the DB."""
    return canonical(name).title() or "Unassigned"


def team_name_from_email(email: str) -> str:
    """Derive a fallback team name from the email domain."""
    try:
        domain = email.split("@")[1].split(".")[0]
        return domain.replace("-", " ").replace("_", " ").title()
    except Exception:
        return "Unassigned"


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/")
def reports(db: Session = Depends(get_db)):
    uploads = (
        db.query(ReportUpload)
        .order_by(ReportUpload.created_at.desc())
        .all()
    )
    return [
        {
            "id": item.id,
            "financial_year": item.financial_year,
            "date": item.created_at.isoformat() if item.created_at else None,
            "resdex_file": item.resdex_file,
            "job_posting_file": item.job_posting_file,
            "uploaded_by": item.uploaded_by,
            "range_start": item.range_start.isoformat() if item.range_start else None,
            "range_end": item.range_end.isoformat() if item.range_end else None,
            "status": item.status,
            "message": item.message,
        }
        for item in uploads
    ]


@router.post("/upload")
def upload_reports(
    financial_year: str = Form(...),
    uploaded_by: str = Form("Kajal"),
    overwrite_existing: bool = Form(False),
    resdex_report: UploadFile = File(...),
    job_posting_report: UploadFile = File(...),
    db: Session = Depends(get_db),
):

    # =========================================================================
    # VALIDATION
    # =========================================================================

    if not resdex_report or not job_posting_report:
        raise HTTPException(
            status_code=400,
            detail="Please upload both reports together.",
        )

    # =========================================================================
    # SAVE FILES
    # =========================================================================

    UPLOAD_DIR.mkdir(exist_ok=True)

    resdex_path = UPLOAD_DIR / resdex_report.filename
    job_path = UPLOAD_DIR / job_posting_report.filename

    with resdex_path.open("wb") as target:
        shutil.copyfileobj(resdex_report.file, target)

    with job_path.open("wb") as target:
        shutil.copyfileobj(job_posting_report.file, target)

    # =========================================================================
    # PROCESS REPORTS
    # =========================================================================

    processor = ReportProcessor()

    try:
        result = processor.process_reports(
            str(resdex_path),
            str(job_path),
            financial_year,
        )
    except Exception as exc:
        db.add(
            ReportUpload(
                financial_year=financial_year,
                resdex_file=resdex_report.filename,
                job_posting_file=job_posting_report.filename,
                uploaded_by=uploaded_by,
                status="error",
                message=str(exc),
            )
        )
        db.commit()
        raise HTTPException(status_code=400, detail=str(exc))

    # =========================================================================
    # DUPLICATE CHECK
    # =========================================================================

    existing_upload = (
        db.query(ReportUpload)
        .filter(
            ReportUpload.financial_year == financial_year,
            ReportUpload.range_start == result["range_start"],
            ReportUpload.range_end == result["range_end"],
            ReportUpload.status == "success",
        )
        .first()
    )

    if existing_upload and not overwrite_existing:
        return {
            "status": "duplicate",
            "message": "Reports for this date range already exist.",
            "existing_upload_id": existing_upload.id,
        }

    # =========================================================================
    # OVERWRITE: DELETE OLD SUBUSER ROWS FOR THIS RANGE
    # =========================================================================

    if existing_upload and overwrite_existing:
        db.query(SubUserUsage).filter(
            SubUserUsage.financial_year == financial_year,
            SubUserUsage.upload_range_start == result["range_start"],
            SubUserUsage.upload_range_end == result["range_end"],
        ).delete()

    # =========================================================================
    # BUILD CANONICAL TEAM MAP
    # Key  : canonical(team.name)  → always "talent corner"  (no punctuation,
    #                                 lower, collapsed spaces)
    # Value: Team ORM object
    # =========================================================================

    all_teams = db.query(Team).all()

    team_map: dict[str, Team] = {
        canonical(t.name): t
        for t in all_teams
    }

    created_teams: list[dict] = []
    added_subusers = 0
    updated_subusers = 0
    # =========================================================================
    # RESET TEAM USAGE
    # IMPORTANT:
    # Prevents duplicate accumulation on overwrite/re-upload
    # =========================================================================

    all_teams = db.query(Team).all()

    for team in all_teams:

        team.cv_usage = 0
        team.nvites_usage = 0
        team.jobs_usage = 0

    db.flush()
    # =========================================================================
    # PROCESS EACH SUBUSER ROW
    # =========================================================================

    for row in result["rows"]:

        # ---------------------------------------------------------------------
        # 1. EMAIL — skip rows with no email
        # ---------------------------------------------------------------------

        email = str(row.get("email") or "").strip().lower()
        if not email or "@" not in email:
            continue

        # ---------------------------------------------------------------------
        # 2. CANONICAL TEAM NAME — used for map lookup and deduplication
        #    If team_name is blank/unassigned, derive from email domain.
        #    display_team_name — stored in the DB (title-cased, clean)
        # ---------------------------------------------------------------------

        raw_team_name = row.get("team_name")

        if pd.isna(raw_team_name) if isinstance(raw_team_name, float) else not raw_team_name:
            raw_team_name = ""

        raw_team_name_str = str(raw_team_name).strip()

        # Fall back to email domain when Resdex doesn't include a team column
        if not raw_team_name_str or raw_team_name_str.lower() in ("unassigned", "nan", "none", "0", ""):
            raw_team_name_str = team_name_from_email(email)

        lookup_key = canonical(raw_team_name_str)          # e.g. "talent corner"
        stored_name = display_name(raw_team_name_str)      # e.g. "Talent Corner"

        # ---------------------------------------------------------------------
        # 3. FIND TEAM (canonical map lookup — NO DB query inside loop)
        # ---------------------------------------------------------------------

        team = team_map.get(lookup_key)

        # ---------------------------------------------------------------------
        # 4. CREATE TEAM if it doesn't exist yet
        # ---------------------------------------------------------------------

        if not team:
            licences = int(row.get("licences") or 1)

            BASE_CV     = 3000
            BASE_NVITES = 22500
            BASE_JOBS   = 100

            team = create_team_from_upload(
                db=db,
                team_name=stored_name,
                partner_name=str(row.get("name") or email),
                partner_email=email,
                licences=licences,
                partner_type="New Partner",
                join_period="Q1 (Apr-Jun)",
                licence_fee=80000,
                cv_limit=BASE_CV,
                nvites_limit=BASE_NVITES,
                jobs_limit=BASE_JOBS,
            )

            db.flush()

            team_map[lookup_key] = team

            created_teams.append({
                "id":            team.id,
                "name":          team.name,
                "partner_email": team.partner_email,
                "licences":      licences,
                "cv_limit":      team.cv_limit,
                "nvites_limit":  team.nvites_limit,
                "jobs_limit":    team.jobs_limit,
            })
        # ---------------------------------------------------------------------
        # 4.5 UPDATE TEAM TOTAL USAGE
        # IMPORTANT:
        # Team table stores TOTAL usage used by invoice generator
        # ---------------------------------------------------------------------

        team.cv_usage = (
            int(team.cv_usage or 0)
            +
            int(row.get("cv_usage") or 0)
        )

        team.nvites_usage = (
            int(team.nvites_usage or 0)
            +
            int(row.get("nvites_usage") or 0)
        )

        team.jobs_usage = (
            int(team.jobs_usage or 0)
            +
            int(row.get("jobs_usage") or 0)
        )
        # ---------------------------------------------------------------------
        # 5. UPSERT SUBUSER USAGE
        # ---------------------------------------------------------------------

        existing_usage = (
            db.query(SubUserUsage)
            .filter(
                SubUserUsage.financial_year == financial_year,
                SubUserUsage.email == email,
            )
            .first()
        )

        if existing_usage:
            # UPDATE — count these so the response is accurate
            existing_usage.upload_range_start = result["range_start"]
            existing_usage.upload_range_end   = result["range_end"]
            existing_usage.team_id            = team.id
            existing_usage.team_name          = team.name
            existing_usage.name               = str(row.get("name") or email)
            existing_usage.cv_usage           = int(row.get("cv_usage") or 0)
            existing_usage.nvites_usage       = int(row.get("nvites_usage") or 0)
            existing_usage.jobs_usage         = int(row.get("jobs_usage") or 0)
            updated_subusers += 1

        else:
            # INSERT
            db.add(
                SubUserUsage(
                    financial_year      = financial_year,
                    upload_range_start  = result["range_start"],
                    upload_range_end    = result["range_end"],
                    team_id             = team.id,
                    team_name           = team.name,
                    name                = str(row.get("name") or email),
                    email               = email,
                    cv_usage            = int(row.get("cv_usage") or 0),
                    nvites_usage        = int(row.get("nvites_usage") or 0),
                    jobs_usage          = int(row.get("jobs_usage") or 0),
                )
            )
            added_subusers += 1

    # =========================================================================
    # SAVE UPLOAD HISTORY
    # =========================================================================

    total_processed = added_subusers + updated_subusers

    message = (
        f"Upload successful. "
        f"{total_processed} subuser(s) processed "
        f"({added_subusers} new, {updated_subusers} updated). "
        f"{len(created_teams)} new team(s) created."
    )

    db.add(
        ReportUpload(
            financial_year   = financial_year,
            resdex_file      = resdex_report.filename,
            job_posting_file = job_posting_report.filename,
            uploaded_by      = uploaded_by,
            range_start      = result["range_start"],
            range_end        = result["range_end"],
            status           = "success",
            message          = message,
        )
    )

    # =========================================================================
    # AUDIT
    # =========================================================================

    add_audit(
        db,
        uploaded_by,
        "upload_reports",
        "report_upload",
        resdex_report.filename,
        {
            "warnings":       result["warnings"],
            "created_teams":  created_teams,
            "financial_year": financial_year,
            "added_subusers": added_subusers,
            "updated_subusers": updated_subusers,
        },
    )

    db.commit()

    # =========================================================================
    # BUILD HUMAN-READABLE WARNINGS
    # =========================================================================

    friendly_warnings = []
    for w in result["warnings"]:
        emails = w.get("emails", [])
        if not emails:
            continue
        preview = emails[:3]
        rest = len(emails) - 3
        preview_str = ", ".join(preview)
        if rest > 0:
            preview_str += f" +{rest} more"
        if w["type"] == "missing_resdex":
            friendly_warnings.append(
                f"Subusers in Job Posting report but not in Resdex (partial data): {preview_str}"
            )
        elif w["type"] == "missing_jobs":
            friendly_warnings.append(
                f"Subusers in Resdex report but not in Job Posting (partial data): {preview_str}"
            )

    return {
        "status":           "success",
        "message":          message,
        "financial_year":   financial_year,
        "warnings":         result["warnings"],
        "friendly_warnings": friendly_warnings,
        "created_teams":    created_teams,
        "new_teams_added":  len(created_teams),
        "subusers_added":   added_subusers,
        "subusers_updated": updated_subusers,
        "subusers_total":   total_processed,
    }
