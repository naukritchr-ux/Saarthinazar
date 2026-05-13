from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.team import Team
from app.services.naukri_rules import alert_message, status_for_team

router = APIRouter(prefix="/alerts")


@router.get("/")
def get_alerts(db: Session = Depends(get_db)):
    alerts = []
    for team in db.query(Team).order_by(Team.name).all():
        status = status_for_team(team, db)
        if status in {"Warning", "Critical", "Over limit"}:
            alert = alert_message(team, db)
            alert["type"] = "exceeded" if status == "Over limit" else status.lower()
            alerts.append(alert)
    return alerts


@router.get("/{team_id}/preview")
def preview_alert(team_id: int, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        return {"error": "Team not found"}
    return alert_message(team, db)
