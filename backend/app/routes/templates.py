from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.template import UploadTemplate
from app.services.naukri_rules import add_audit

router = APIRouter(prefix="/templates")
TEMPLATE_DIR = Path("uploaded_templates")


@router.get("/")
def list_templates(db: Session = Depends(get_db)):
    templates = db.query(UploadTemplate).order_by(UploadTemplate.created_at.desc()).all()
    return [
        {
            "id": item.id,
            "template_type": item.template_type,
            "name": item.name,
            "description": item.description,
            "file_name": item.file_name,
            "created_by": item.created_by,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in templates
    ]


@router.post("/")
def add_template(
    template_type: str = Form(...),
    name: str = Form(...),
    description: str = Form(""),
    created_by: str = Form("Kajal"),
    file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    TEMPLATE_DIR.mkdir(exist_ok=True)
    file_name = ""
    content = ""
    if file:
        file_name = file.filename
        target = TEMPLATE_DIR / file.filename
        content_bytes = file.file.read()
        target.write_bytes(content_bytes)
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            content = ""

    item = UploadTemplate(
        template_type=template_type,
        name=name,
        description=description,
        file_name=file_name,
        content=content,
        created_by=created_by,
    )
    db.add(item)
    db.flush()
    add_audit(db, created_by, "add_template", "upload_template", item.id, {"template_type": template_type, "name": name})
    db.commit()
    return {"status": "success", "message": "Template saved.", "id": item.id}
