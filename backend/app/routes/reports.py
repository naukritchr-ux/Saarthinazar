import re
import shutil
from datetime import date, timedelta
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
from sqlalchemy import func

from app.database import get_db
from app.models.pricing import PricingPlan
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
# ADMIN: fix teams whose financial_year column doesn't match their usage FY
# Call once after upgrading to fix historical data.
# ---------------------------------------------------------------------------

@router.post("/fix-team-financial-years")
def fix_team_financial_years(db: Session = Depends(get_db)):
    """One-shot migration: update team.financial_year to match the FY of their
    SubUserUsage records.  Safe to call multiple times — idempotent."""
    from sqlalchemy import func as sqlfunc
    from app.models.usage import SubUserUsage

    # Find the dominant financial_year per team from usage records
    usage_fy = (
        db.query(
            SubUserUsage.team_id,
            SubUserUsage.financial_year,
            sqlfunc.count(SubUserUsage.id).label("cnt"),
        )
        .group_by(SubUserUsage.team_id, SubUserUsage.financial_year)
        .all()
    )

    # Pick the FY with the most usage rows per team
    team_dominant_fy: dict[int, str] = {}
    team_dominant_cnt: dict[int, int] = {}
    for row in usage_fy:
        if row.cnt > team_dominant_cnt.get(row.team_id, 0):
            team_dominant_fy[row.team_id] = row.financial_year
            team_dominant_cnt[row.team_id] = row.cnt

    updated = []
    for team_id, dominant_fy in team_dominant_fy.items():
        team = db.query(Team).filter(Team.id == team_id).first()
        if team and getattr(team, "financial_year", None) != dominant_fy:
            old_fy = team.financial_year
            team.financial_year = dominant_fy
            updated.append({"team": team.name, "old_fy": old_fy, "new_fy": dominant_fy})

    db.commit()
    return {"status": "success", "updated": updated, "count": len(updated)}


# ---------------------------------------------------------------------------
# ADD TEAM MEMBER MANUALLY
# ---------------------------------------------------------------------------

@router.post("/teams/{team_id}/members")
def add_team_member(
    team_id: int,
    payload: dict,
    db: Session = Depends(get_db),
):
    """Manually add a sub-user (0 usage) to a team for a given financial year."""
    from fastapi import Header
    from app.models.team import Team
    from app.services.naukri_rules import add_audit

    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    financial_year = str(payload.get("financial_year", "2025-2026")).strip()
    added_by = str(payload.get("added_by", "Kajal")).strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")

    existing = (
        db.query(SubUserUsage)
        .filter(
            SubUserUsage.team_id == team_id,
            SubUserUsage.email == email,
            SubUserUsage.financial_year == financial_year,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Member already exists in this team for this financial year")

    new_member = SubUserUsage(
        financial_year=financial_year,
        team_id=team_id,
        team_name=team.name,
        name=name or email,
        email=email,
        cv_usage=0,
        nvites_usage=0,
        jobs_usage=0,
    )
    db.add(new_member)

    add_audit(
        db,
        added_by,
        "add_member_manual",
        "team",
        str(team_id),
        {"email": email, "name": name, "financial_year": financial_year},
    )

    db.commit()
    db.refresh(new_member)

    return {
        "status": "success",
        "id": new_member.id,
        "email": new_member.email,
        "name": new_member.name,
        "team_id": team_id,
        "team_name": team.name,
    }


# ---------------------------------------------------------------------------
# Canonical team name normalizer
# ---------------------------------------------------------------------------

def canonical(name: str) -> str:
    """Return a fully-normalized key used only for deduplication lookups."""
    s = str(name or "").lower().strip()
    s = re.sub(r"[^a-z0-9\s]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
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
            "range_start": (
                item.range_start.isoformat()
                if item.range_start
                else None
            ),
            "range_end": (
                item.range_end.isoformat()
                if item.range_end
                else None
            ),
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
    # WEEKLY UPLOAD LOCK
    # One successful upload per calendar week (Mon–Sun) per financial year.
    # Uploading on any day (not just Monday) still consumes the weekly slot.
    # =========================================================================

    if not overwrite_existing:
        today = date.today()
        week_start = today - timedelta(days=today.weekday())   # Monday
        week_end   = week_start + timedelta(days=6)            # Sunday
        next_monday = week_start + timedelta(days=7)

        existing_this_week = (
            db.query(ReportUpload)
            .filter(
                ReportUpload.financial_year == financial_year,
                ReportUpload.status == "success",
                func.date(ReportUpload.created_at) >= week_start,
                func.date(ReportUpload.created_at) <= week_end,
            )
            .first()
        )

        if existing_this_week:
            upload_day = existing_this_week.created_at.strftime("%A, %d %b %Y")
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Upload already done this week (uploaded on {upload_day}). "
                    f"Only one upload is allowed per week regardless of the day. "
                    f"Next upload window opens on Monday, "
                    f"{next_monday.strftime('%d %b %Y')}."
                ),
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

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

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
    # OVERWRITE: DELETE OLD SUBUSER ROWS
    # =========================================================================

    if existing_upload and overwrite_existing:

        db.query(SubUserUsage).filter(
            SubUserUsage.financial_year == financial_year,
            SubUserUsage.upload_range_start == result["range_start"],
            SubUserUsage.upload_range_end == result["range_end"],
        ).delete()

    # =========================================================================
    # BUILD TEAM MAP
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
    # =========================================================================

    for team in all_teams:

        team.cv_usage = 0
        team.nvites_usage = 0
        team.jobs_usage = 0

    db.flush()

    # =========================================================================
    # PROCESS EACH ROW
    # =========================================================================

    for row in result["rows"]:

        # ---------------------------------------------------------------------
        # EMAIL
        # ---------------------------------------------------------------------

        email = str(row.get("email") or "").strip().lower()

        if not email or "@" not in email:
            continue

        # ---------------------------------------------------------------------
        # TEAM NAME
        # ---------------------------------------------------------------------

        raw_team_name = row.get("team_name")

        if (
            pd.isna(raw_team_name)
            if isinstance(raw_team_name, float)
            else not raw_team_name
        ):
            raw_team_name = ""

        raw_team_name_str = str(raw_team_name).strip()

        if (
            not raw_team_name_str
            or raw_team_name_str.lower()
            in ("unassigned", "nan", "none", "0", "")
        ):
            raw_team_name_str = team_name_from_email(email)

        lookup_key = canonical(raw_team_name_str)
        stored_name = display_name(raw_team_name_str)

        # ---------------------------------------------------------------------
        # FIND TEAM
        # ---------------------------------------------------------------------

        team = team_map.get(lookup_key)

        # If found but financial_year doesn't match, update it so the team
        # appears in the correct FY bucket for TopUps / MasterData
        if team and getattr(team, "financial_year", None) != financial_year:
            team.financial_year = financial_year

        # ---------------------------------------------------------------------
        # CREATE TEAM
        # ---------------------------------------------------------------------

        if not team:

            licences = int(row.get("licences") or 1)

            partner_type = "New Partner"
            join_period = "Q1"

            pricing = (
                db.query(PricingPlan)
                .filter(
                    PricingPlan.financial_year == financial_year,
                    PricingPlan.is_locked == True,
                    PricingPlan.is_active == True,
                )
                .first()
            )

            if not pricing:
                # Fallback: any active plan for this FY (unlocked)
                pricing = (
                    db.query(PricingPlan)
                    .filter(
                        PricingPlan.financial_year == financial_year,
                        PricingPlan.is_active == True,
                    )
                    .first()
                )

            if not pricing:
                # Last resort: most recent plan across all years
                pricing = (
                    db.query(PricingPlan)
                    .order_by(PricingPlan.id.desc())
                    .first()
                )

            # Use plan limits if found, else 0 (Rashesh can adjust later in Master Data)
            cv_lim      = pricing.cv_limit      if pricing else 0
            nvites_lim  = pricing.nvites_limit  if pricing else 0
            jobs_lim    = pricing.jobs_limit    if pricing else 0
            lfee        = pricing.licence_fee   if pricing else 0

            team = create_team_from_upload(
                db=db,
                team_name=stored_name,
                partner_name=str(row.get("name") or email),
                partner_email=email,
                licences=licences,
                partner_type=partner_type,
                join_period=join_period,
                licence_fee=lfee,
                cv_limit=cv_lim,
                nvites_limit=nvites_lim,
                jobs_limit=jobs_lim,
                financial_year=financial_year,   # ← was missing; caused team.financial_year = "2025-2026"
            )

            db.flush()

            team_map[lookup_key] = team

            created_teams.append(
                {
                    "id": team.id,
                    "name": team.name,
                    "partner_email": team.partner_email,
                    "licences": licences,
                    "cv_limit": team.cv_limit,
                    "nvites_limit": team.nvites_limit,
                    "jobs_limit": team.jobs_limit,
                }
            )

        # ---------------------------------------------------------------------
        # UPDATE TEAM TOTAL USAGE
        # ---------------------------------------------------------------------

        team.cv_usage = (
            int(team.cv_usage or 0)
            + int(row.get("cv_usage") or 0)
        )

        team.nvites_usage = (
            int(team.nvites_usage or 0)
            + int(row.get("nvites_usage") or 0)
        )

        team.jobs_usage = (
            int(team.jobs_usage or 0)
            + int(row.get("jobs_usage") or 0)
        )

        # ---------------------------------------------------------------------
        # UPSERT SUBUSER USAGE
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

            existing_usage.upload_range_start = result["range_start"]
            existing_usage.upload_range_end = result["range_end"]

            existing_usage.team_id = team.id
            existing_usage.team_name = team.name

            existing_usage.name = str(row.get("name") or email)

            existing_usage.cv_usage = int(
                row.get("cv_usage") or 0
            )

            existing_usage.nvites_usage = int(
                row.get("nvites_usage") or 0
            )

            existing_usage.jobs_usage = int(
                row.get("jobs_usage") or 0
            )

            updated_subusers += 1

        else:

            db.add(
                SubUserUsage(
                    financial_year=financial_year,
                    upload_range_start=result["range_start"],
                    upload_range_end=result["range_end"],
                    team_id=team.id,
                    team_name=team.name,
                    name=str(row.get("name") or email),
                    email=email,
                    cv_usage=int(row.get("cv_usage") or 0),
                    nvites_usage=int(
                        row.get("nvites_usage") or 0
                    ),
                    jobs_usage=int(
                        row.get("jobs_usage") or 0
                    ),
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
        f"({added_subusers} new, "
        f"{updated_subusers} updated). "
        f"{len(created_teams)} new team(s) created."
    )

    db.add(
        ReportUpload(
            financial_year=financial_year,
            resdex_file=resdex_report.filename,
            job_posting_file=job_posting_report.filename,
            uploaded_by=uploaded_by,
            range_start=result["range_start"],
            range_end=result["range_end"],
            status="success",
            message=message,
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
            "warnings": result["warnings"],
            "created_teams": created_teams,
            "financial_year": financial_year,
            "added_subusers": added_subusers,
            "updated_subusers": updated_subusers,
        },
    )

    db.commit()

    # =========================================================================
    # FRIENDLY WARNINGS
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
                "Subusers in Job Posting report but not "
                f"in Resdex (partial data): {preview_str}"
            )

        elif w["type"] == "missing_jobs":

            friendly_warnings.append(
                "Subusers in Resdex report but not "
                f"in Job Posting (partial data): {preview_str}"
            )

    return {
        "status": "success",
        "message": message,
        "financial_year": financial_year,
        "warnings": result["warnings"],
        "friendly_warnings": friendly_warnings,
        "created_teams": created_teams,
        "new_teams_added": len(created_teams),
        "subusers_added": added_subusers,
        "subusers_updated": updated_subusers,
        "subusers_total": total_processed,
    }