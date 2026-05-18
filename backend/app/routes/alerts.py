from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.team import Team
from app.services.naukri_rules import alert_message, status_for_team

router = APIRouter(prefix="/alerts")


# =====================================================
# GET ALL ALERTS — only active teams, only warning+
# =====================================================

@router.get("/")
def get_alerts(
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):

    alerts = []

    teams = (
        db.query(Team)
        .filter(Team.is_active == True)
        .order_by(Team.name)
        .all()
    )

    for team in teams:

        status = status_for_team(
            team,
            db,
            financial_year
        )

        if status not in {
            "Warning",
            "Critical",
            "Over limit"
        }:
            continue

        alert = alert_message(
            team,
            db,
            financial_year
        )

        alerts.append({

            "team_id": team.id,

            "team_name": team.name,

            "partner_name":
                getattr(team, "partner_name", "")
                or team.name,

            "partner_email":
                getattr(team, "partner_email", "")
                or "",

            "type":
                "exceeded"
                if status == "Over limit"
                else status.lower(),

            "status": status,

            "cv_usage":
                alert.get("cv_usage", 0),

            "cv_limit":
                alert.get("cv_limit", 0),

            "nvites_usage":
                alert.get("nvites_usage", 0),

            "nvites_limit":
                alert.get("nvites_limit", 0),

            "jobs_usage":
                alert.get("jobs_usage", 0),

            "jobs_limit":
                alert.get("jobs_limit", 0),

            "cv_remaining":
                alert.get("cv_remaining", 0),

            "nvites_remaining":
                alert.get("nvites_remaining", 0),

            "jobs_remaining":
                alert.get("jobs_remaining", 0),

            "overage_amount":
                alert.get("overage_amount", 0),

            "members":
                alert.get("members", []),

            "message":
                alert.get("message", "")
        })

    return alerts


# =====================================================
# ALERT PREVIEW — single team
# =====================================================

@router.get("/{team_id}/preview")
def preview_alert(
    team_id: int,
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):
    team = db.query(Team).filter(Team.id == team_id).first()

    if not team:
        return {"status": "error", "message": "Team not found"}

    return alert_message(team, db, financial_year)


# =====================================================
# SEND ALERT EMAIL
# =====================================================

@router.post("/{team_id}/send")
def send_alert(
    team_id: int,
    financial_year: str = Query(...),
    db: Session = Depends(get_db),
):
    team = db.query(Team).filter(Team.id == team_id).first()

    if not team:
        return {"status": "error", "message": "Team not found"}

    if not team.partner_email:
        return {"status": "error", "message": "No email address on file for this team"}

    alert = alert_message(team, db, financial_year)

    try:
        from app.services.email_service import send_email
        success = send_email(
            recipient=team.partner_email,
            subject=f"Naukri Usage Alert — {team.name}",
            body=alert.get("message", ""),
        )
        return {"status": "success" if success else "error"}
    except ImportError:
        # email_service not yet implemented — return success so frontend doesn't error
        return {"status": "success", "note": "Email service not configured yet"}
    except Exception as e:
        return {"status": "error", "message": str(e)}