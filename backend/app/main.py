from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.services.db_bootstrap import ensure_database

from app.routes import (
    auth,
    dashboard,
    reports,
    invoices,
    alerts,
    topups,
    financial,
    financial_years,
    master_data,
    templates,
)

app = FastAPI(title="Naukri Usage Monitor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(invoices.router)
app.include_router(alerts.router)
app.include_router(topups.router)
app.include_router(financial.router)
app.include_router(financial_years.router)
app.include_router(master_data.router)
app.include_router(templates.router)


@app.on_event("startup")
def startup():
    ensure_database()


@app.get("/")
def home():
    return {
        "message": "Backend Running"
    }
