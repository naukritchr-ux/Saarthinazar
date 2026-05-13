from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.financial_year import FinancialYear
from app.services.naukri_rules import add_audit, financial_year_dates

router = APIRouter(prefix="/financial-years")


@router.get("/")
def list_financial_years(db: Session = Depends(get_db)):
    years = db.query(FinancialYear).order_by(FinancialYear.start_date.desc()).all()
    return [
        {
            "id": year.id,
            "label": year.label,
            "start_date": year.start_date.isoformat(),
            "end_date": year.end_date.isoformat(),
            "is_active": year.is_active,
        }
        for year in years
    ]


@router.post("/")
def add_financial_year(
    label: str = Form(...),
    uploaded_by: str = Form("Kajal"),
    master_file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    existing = db.query(FinancialYear).filter(FinancialYear.label == label).first()
    if existing:
        return {"status": "error", "message": "Financial year already exists."}

    start_date, end_date = financial_year_dates(label)
    year = FinancialYear(label=label, start_date=start_date, end_date=end_date, is_active=False)
    db.add(year)
    db.flush()

    add_audit(
        db,
        uploaded_by,
        "create_financial_year",
        "financial_year",
        year.id,
        {
            "label": label,
            "master_file": master_file.filename if master_file else None,
            "note": "Master file received for initial team/pricing import flow.",
        },
    )
    db.commit()
    return {
        "status": "success",
        "message": "Financial year added. Upload the master data file next to initialise teams and allocations.",
        "financial_year": {
            "id": year.id,
            "label": year.label,
            "start_date": year.start_date.isoformat(),
            "end_date": year.end_date.isoformat(),
            "is_active": year.is_active,
        },
        "master_file_received": bool(master_file),
    }


@router.patch("/{year_id}/activate")
def activate_financial_year(year_id: int, db: Session = Depends(get_db)):
    target = db.query(FinancialYear).filter(FinancialYear.id == year_id).first()
    if not target:
        return {"status": "error", "message": "Financial year not found."}
    for year in db.query(FinancialYear).all():
        year.is_active = year.id == target.id
    add_audit(db, "system", "activate_financial_year", "financial_year", target.id, {"label": target.label})
    db.commit()
    return {"status": "success", "message": f"{target.label} activated."}
