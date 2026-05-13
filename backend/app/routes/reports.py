import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.report_upload import ReportUpload
from app.models.team import Team
from app.models.usage import SubUserUsage
from app.services.google_sheets_store import GoogleSheetsStore
from app.services.naukri_rules import add_audit, create_team_from_upload
from services.report_processor import ReportProcessor

router = APIRouter(prefix="/reports")
UPLOAD_DIR = Path("uploaded_reports")


@router.get("/")
def reports(db: Session = Depends(get_db)):
    return [
        {
            "id": item.id,
            "date": item.created_at.isoformat() if item.created_at else None,
            "resdex_file": item.resdex_file,
            "job_posting_file": item.job_posting_file,
            "uploaded_by": item.uploaded_by,
            "range_start": item.range_start.isoformat() if item.range_start else None,
            "range_end": item.range_end.isoformat() if item.range_end else None,
            "status": item.status,
            "message": item.message,
        }
        for item in db.query(ReportUpload).order_by(ReportUpload.created_at.desc()).all()
    ]


@router.post("/upload")
def upload_reports(
    financial_year: str = Form("2026-2027"),
    uploaded_by: str = Form("Kajal"),
    resdex_report: UploadFile = File(...),
    job_posting_report: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not resdex_report or not job_posting_report:
        return {"status": "error", "message": "Please upload both the Resdex Usage Report and the Job Posting Report together."}

    UPLOAD_DIR.mkdir(exist_ok=True)
    resdex_path = UPLOAD_DIR / resdex_report.filename
    job_path = UPLOAD_DIR / job_posting_report.filename
    with resdex_path.open("wb") as target:
        shutil.copyfileobj(resdex_report.file, target)
    with job_path.open("wb") as target:
        shutil.copyfileobj(job_posting_report.file, target)

    processor = ReportProcessor()
    try:
        result = processor.process_reports(str(resdex_path), str(job_path), financial_year)
    except Exception as exc:
        upload = ReportUpload(
            resdex_file=resdex_report.filename,
            job_posting_file=job_posting_report.filename,
            uploaded_by=uploaded_by,
            status="error",
            message=str(exc),
        )
        db.add(upload)
        db.commit()
        return {"status": "error", "message": str(exc)}

    teams = {team.name.strip().lower(): team for team in db.query(Team).all()}
    created_teams = []
    db.query(SubUserUsage).delete()
    for row in result["rows"]:
        team_name = str(row.get("team_name") or "").strip()
        team = teams.get(team_name.lower())
        if not team:
            inferred_name = team_name or f"Unassigned - {row['email']}"
            team = create_team_from_upload(
                db,
                inferred_name,
                str(row["email"]).lower(),
                str(row.get("name") or inferred_name),
            )
            teams[inferred_name.lower()] = team
            created_teams.append({"id": team.id, "name": team.name, "partner_email": team.partner_email})
        db.add(
            SubUserUsage(
                team_id=team.id,
                team_name=team.name,
                name=str(row.get("name") or row["email"]),
                email=str(row["email"]).lower(),
                cv_usage=int(row.get("cv_usage") or 0),
                nvites_usage=int(row.get("nvites_usage") or 0),
                jobs_usage=int(row.get("jobs_usage") or 0),
            )
        )

    message = "Reports uploaded, validated, matched by subuser email, and rolled up to team usage."
    if created_teams:
        message += " New teams were automatically created: " + ", ".join(item["name"] for item in created_teams)
    upload = ReportUpload(
        resdex_file=resdex_report.filename,
        job_posting_file=job_posting_report.filename,
        uploaded_by=uploaded_by,
        range_start=result["range_start"],
        range_end=result["range_end"],
        status="success",
        message=message,
    )
    db.add(upload)
    add_audit(db, uploaded_by, "upload_reports", "report_upload", resdex_report.filename, {"warnings": result["warnings"], "created_teams": created_teams})
    db.commit()
    sheets_result = GoogleSheetsStore().append_rows(
        "Report Uploads",
        [
            {
                "financial_year": financial_year,
                "resdex_file": resdex_report.filename,
                "job_posting_file": job_posting_report.filename,
                "uploaded_by": uploaded_by,
                "range_start": result["range_start"],
                "range_end": result["range_end"],
                "created_teams": created_teams,
            }
        ],
    )
    return {
        "status": "success",
        "message": message,
        "warnings": result["warnings"],
        "created_teams": created_teams,
        "google_sheets": sheets_result,
    }
