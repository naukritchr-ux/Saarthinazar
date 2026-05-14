"""
app/services/whatsapp_service.py
"""

from app.config import (
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM,
)


# =====================================================
# WHATSAPP MESSAGE BUILDER
# =====================================================

def build_whatsapp_message(
    team_name: str,
    financial_year: str,
    usage: dict,
    members: list,
) -> str:
    """
    Builds the WhatsApp alert message string.

    usage keys expected:
        cv_used, cv_limit, cv_pct,
        nvites_used, nvites_limit, nvites_pct,
        jobs_used, jobs_limit, jobs_pct

    members: list of dicts with keys:
        name, cv, nvites, jobs
    """

    cv_pct    = int(usage.get("cv_pct", 0))
    nvites_pct = int(usage.get("nvites_pct", 0))
    jobs_pct  = int(usage.get("jobs_pct", 0))

    def alert_emoji(pct: int) -> str:
        if pct >= 100:
            return "🔴"
        if pct >= 80:
            return "🟡"
        return "🟢"

    lines = [
        f"🔔 *Naukri Usage Alert — {team_name}*",
        f"📅 Financial Year: {financial_year}",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "📊 *Usage Summary*",
        "━━━━━━━━━━━━━━━━━━━━",
        f"{alert_emoji(cv_pct)} *CV Downloads:*",
        f"   {usage.get('cv_used', 0)} / {usage.get('cv_limit', 0)} — ({cv_pct}%)",
        "",
        f"{alert_emoji(nvites_pct)} *NVites Usage:*",
        f"   {usage.get('nvites_used', 0)} / {usage.get('nvites_limit', 0)} — ({nvites_pct}%)",
        "",
        f"{alert_emoji(jobs_pct)} *Job Postings:*",
        f"   {usage.get('jobs_used', 0)} / {usage.get('jobs_limit', 0)} — ({jobs_pct}%)",
    ]

    # ── member breakdown ────────────────────────────────────────

    if members:
        lines += [
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            "👥 *Member-wise Breakdown*",
            "━━━━━━━━━━━━━━━━━━━━",
        ]
        for m in members:
            lines.append(
                f"• *{m.get('name', 'Unknown')}*\n"
                f"   CVs: {m.get('cv', 0)} | "
                f"NVites: {m.get('nvites', 0)} | "
                f"Jobs: {m.get('jobs', 0)}"
            )

    # ── notice ──────────────────────────────────────────────────

    lines += [
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "⚠️ Your team has approached or exceeded the allocated usage threshold.",
        "",
        "📄 *Invoice has been attached to the email* sent to your registered address.",
        "Please review and complete payment before the due date to avoid service interruption.",
        "",
        "— Operations Team | Naukri Usage Monitor",
    ]

    return "\n".join(lines)


# =====================================================
# SEND WHATSAPP
# =====================================================

def send_whatsapp(
    to_number: str,
    message: str,
    invoice_url: str | None = None,
) -> bool:
    """
    Sends a WhatsApp message via Twilio.

    to_number    : recipient in E.164 format e.g. +919876543210
    message      : pre-built message string from build_whatsapp_message()
    invoice_url  : optional public URL to invoice PDF (Phase 2 — Supabase Storage)
    """

    # ── credentials check ──────────────────────────────────────

    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        print("Twilio credentials missing. WhatsApp skipped.")
        return False

    if not to_number:
        print("No phone number provided. WhatsApp skipped.")
        return False

    try:

        from twilio.rest import Client

        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

        body = message

        # attach invoice URL if provided (Supabase public URL in Phase 2)
        if invoice_url:
            body += f"\n\n📎 Invoice: {invoice_url}"

        client.messages.create(
            from_=TWILIO_WHATSAPP_FROM,
            to=f"whatsapp:{to_number}",
            body=body,
        )

        print(f"WhatsApp sent to {to_number}")
        return True

    except Exception as e:
        print("WHATSAPP ERROR:", str(e))
        return False