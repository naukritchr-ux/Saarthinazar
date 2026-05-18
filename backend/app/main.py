import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.routes.inventory_adjustments import router as inventory_adjustments_router
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

app = FastAPI(
    title="Naukri Usage Monitor",
    description="Recruitment Billing & Analytics System",
    version="1.0.0",
)

# =====================================================
# CORS
# =====================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# STATIC FILES — serves /static/invoices/*.pdf for download
# =====================================================

STATIC_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "static"
)
os.makedirs(os.path.join(STATIC_DIR, "invoices"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "assets"), exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# =====================================================
# ROUTES
# =====================================================

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(alerts.router)
app.include_router(topups.router)
app.include_router(financial.router)
app.include_router(financial_years.router)
app.include_router(master_data.router)
app.include_router(templates.router)
app.include_router(invoices.router)
app.include_router(inventory_adjustments_router)

# =====================================================
# ROOT / HEALTH
# =====================================================

@app.get("/")
def home():
    return {"message": "Naukri Usage Monitor Backend Running", "status": "success"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
