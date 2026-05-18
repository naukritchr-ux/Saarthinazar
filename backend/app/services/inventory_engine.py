from sqlalchemy.orm import Session

from app.models.topup import TopUp
from app.models.inventory_adjustment import InventoryAdjustment


# =====================================================
# EFFECTIVE INVENTORY LIMITS
# =====================================================

def effective_limits(
    team,
    db: Session,
    financial_year: str
):

    # =====================================
    # BASE LIMITS
    # =====================================

    base_cv = team.cv_limit or 0

    base_nvites = team.nvites_limit or 0

    base_jobs = team.jobs_limit or 0

    # =====================================
    # MULTI LICENCE SUPPORT
    # =====================================

    licences = team.licences or 1

    final_base_cv = base_cv * licences

    final_base_nvites = (
        base_nvites * licences
    )

    final_base_jobs = (
        base_jobs * licences
    )

    # =====================================
    # TOPUPS
    # =====================================

    topups = (

        db.query(TopUp)

        .filter(
            TopUp.team_id == team.id,
            TopUp.financial_year == financial_year
        )

        .all()
    )

    total_cv_topups = sum(
        t.cv_topup or 0
        for t in topups
    )

    total_nvites_topups = sum(
        t.nvites_topup or 0
        for t in topups
    )

    total_jobs_topups = sum(
        t.jobs_topup or 0
        for t in topups
    )

    # =====================================
    # MANUAL ADJUSTMENTS
    # =====================================

    adjustments = (

        db.query(InventoryAdjustment)

        .filter(
            InventoryAdjustment.team_id == team.id,
            InventoryAdjustment.financial_year == financial_year
        )

        .all()
    )

    total_cv_adjustments = sum(
        a.cv_adjustment or 0
        for a in adjustments
    )

    total_nvites_adjustments = sum(
        a.nvites_adjustment or 0
        for a in adjustments
    )

    total_jobs_adjustments = sum(
        a.jobs_adjustment or 0
        for a in adjustments
    )

    # =====================================
    # FINAL EFFECTIVE LIMITS
    # =====================================

    final_cv = (

        final_base_cv

        +

        total_cv_topups

        +

        total_cv_adjustments
    )

    final_nvites = (

        final_base_nvites

        +

        total_nvites_topups

        +

        total_nvites_adjustments
    )

    final_jobs = (

        final_base_jobs

        +

        total_jobs_topups

        +

        total_jobs_adjustments
    )

    # =====================================
    # RETURN
    # =====================================

    return {

        # FINAL EFFECTIVE LIMITS

        "cv_limit": final_cv,

        "nvites_limit": final_nvites,

        "jobs_limit": final_jobs,

        # BASE INVENTORY

        "base_cv": final_base_cv,

        "base_nvites": final_base_nvites,

        "base_jobs": final_base_jobs,

        # TOPUPS

        "topup_cv": total_cv_topups,

        "topup_nvites": total_nvites_topups,

        "topup_jobs": total_jobs_topups,

        # ADJUSTMENTS

        "adjustment_cv": total_cv_adjustments,

        "adjustment_nvites": total_nvites_adjustments,

        "adjustment_jobs": total_jobs_adjustments,

        # LICENCES

        "licences": licences,
    }