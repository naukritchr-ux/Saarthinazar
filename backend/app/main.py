from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.inventory_adjustments import router as inventory_adjustments_router
from app.routes.invoice_routes import router as invoice_router

# =====================================================
# ROUTES
# ===========================================from fastapi import FastAPI==========

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


# =====================================================
# FASTAPI APP
# =====================================================

app = FastAPI(

    title="Naukri Usage Monitor",

    description="""
    Recruitment Billing & Analytics System

    Features:
    - Usage monitoring
    - Team management
    - Invoice generation
    - Financial analytics
    - Report uploads
    - Top-up management
    - Alerts & overage tracking
    """,

    version="1.0.0"
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
# REGISTER ROUTES
# =====================================================

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

app.include_router(invoice_router)

app.include_router(
    inventory_adjustments_router
)
# =====================================================
# ROOT
# =====================================================

@app.get("/")
def home():

    return {

        "message":
            "Naukri Usage Monitor Backend Running",

        "status":
            "success"
    }


# =====================================================
# HEALTH CHECK
# =====================================================

@app.get("/health")
def health_check():

    return {

        "status": "healthy"
    }