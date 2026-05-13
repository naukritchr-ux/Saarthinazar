from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.invoice import Invoice
from app.models.report_upload import ReportUpload
from app.models.team import Team
from app.services.naukri_rules import invoice_summary, status_for_team, team_payload, usage_totals

router = APIRouter(prefix="/dashboard")


@router.get("/summary")
def dashboard_summary(db: Session = Depends(get_db)):
    teams = db.query(Team).order_by(Team.name).all()
    usages = [usage_totals(db, team.id) for team in teams]
    statuses = [status_for_team(team, db) for team in teams]
    invoices = db.query(Invoice).all()
    latest_upload = db.query(ReportUpload).order_by(ReportUpload.created_at.desc()).first()
    invoice_stats = invoice_summary(invoices)

    return {
        "total_cv_usage": sum(row["cv"] for row in usages),
        "total_nvites_usage": sum(row["nvites"] for row in usages),
        "total_job_postings": sum(row["jobs"] for row in usages),
        "critical_teams": len([value for value in statuses if value in {"Critical", "Over limit"}]),
        "warning_teams": len([value for value in statuses if value == "Warning"]),
        "outstanding_invoices": invoice_stats["outstanding"],
        "outstanding_invoice_count": invoice_stats["pending_count"],
        "last_upload_date": latest_upload.created_at.date().isoformat() if latest_upload and latest_upload.created_at else None,
        "date_range": {
            "start": latest_upload.range_start.isoformat() if latest_upload and latest_upload.range_start else None,
            "end": latest_upload.range_end.isoformat() if latest_upload and latest_upload.range_end else None,
        },
        "upload_reminder": not latest_upload or not latest_upload.created_at or (date.today() - latest_upload.created_at.date()).days > 8,
    }


@router.get("/teams")
def dashboard_teams(db: Session = Depends(get_db)):
    return [team_payload(team, db) for team in db.query(Team).order_by(Team.name).all()]


@router.get("/critical")
def critical_teams(db: Session = Depends(get_db)):
    teams = [team_payload(team, db) for team in db.query(Team).order_by(Team.name).all()]
    return [team for team in teams if team["status"] in {"Warning", "Critical", "Over limit"}]
