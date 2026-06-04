import os
import json

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    Image,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

from app.services.supabase_storage import (
    upload_invoice_pdf,
    is_configured,
)

# =====================================================
# PATHS
# =====================================================

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

ASSET_DIR   = os.path.join(BASE_DIR, "static", "assets")
INVOICE_DIR = os.path.join(BASE_DIR, "static", "invoices")

os.makedirs(INVOICE_DIR, exist_ok=True)


# =====================================================
# UNICODE FONT SETUP
# ReportLab's built-in Helvetica does NOT support Rs.
# We try to register a system font that does, falling
# back to "Rs." if none is found.
# =====================================================

_RUPEE = "Rs."   # fallback

def _try_register_unicode_font():
    """Try to register DejaVu or a system font that covers Rs. (U+20B9)."""
    global _RUPEE

    candidates = [
        # Linux / Docker
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        # Windows
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
        # macOS
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]

    for path in candidates:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont("UniFont", path))
                _RUPEE = "\u20B9"   # Rs. glyph confirmed available
                return "UniFont"
            except Exception:
                continue

    # No suitable font found -- keep Rs. fallback
    return None


_UNICODE_FONT = _try_register_unicode_font()


def _font(bold=False):
    """Return fontName depending on what is available."""
    if _UNICODE_FONT:
        return _UNICODE_FONT
    return "Helvetica-Bold" if bold else "Helvetica"


def _rs(amount: float) -> str:
    """Format a currency amount with Rs. symbol."""
    return f"{_RUPEE} {amount:,.2f}"


# =====================================================
# AMOUNT TO WORDS  (pure Python, no external package)
# =====================================================

def _num_to_words(n: int) -> str:
    if n == 0:
        return "Zero"
    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
            "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
            "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty",
            "Sixty", "Seventy", "Eighty", "Ninety"]

    def _b100(x):
        if x < 20: return ones[x]
        return (tens[x // 10] + (" " + ones[x % 10] if x % 10 else "")).strip()

    def _b1000(x):
        if x < 100: return _b100(x)
        return ones[x // 100] + " Hundred" + (" and " + _b100(x % 100) if x % 100 else "")

    parts = []
    crore = n // 10_000_000; n %= 10_000_000
    lakh  = n // 100_000;    n %= 100_000
    thou  = n // 1_000;      n %= 1_000
    rest  = n
    if crore: parts.append(_b1000(crore) + " Crore")
    if lakh:  parts.append(_b100(lakh)   + " Lakh")
    if thou:  parts.append(_b1000(thou)  + " Thousand")
    if rest:  parts.append(_b1000(rest))
    return " ".join(parts)


def amount_to_words(amount: int) -> str:
    return f"INR {_num_to_words(int(amount))} Only"


# =====================================================
# STYLE HELPERS
# =====================================================

def _para_style(name, **kwargs):
    base = getSampleStyleSheet()["Normal"]
    return ParagraphStyle(name, parent=base, **kwargs)


def _p(text, **kwargs):
    """Shorthand: create a Paragraph."""
    style = _para_style("_p_" + text[:8].replace(" ", "_"), **kwargs)
    if _UNICODE_FONT:
        style.fontName = _UNICODE_FONT
    return Paragraph(text, style)


# =====================================================
# GENERATE PDF
# =====================================================

def generate_invoice_pdf(invoice, items) -> str:

    filename = f"{invoice.invoice_number}.pdf"
    filepath = os.path.join(INVOICE_DIR, filename)

    # --- VALIDATE ASSETS -------------------------------------------------
    logo_path  = os.path.join(ASSET_DIR, "logo.png")
    stamp_path = os.path.join(ASSET_DIR, "stamp.png")
    sign_path  = os.path.join(ASSET_DIR, "sign.jpg")
    if not os.path.exists(sign_path):
        sign_path = os.path.join(ASSET_DIR, "sign.jpg.jpeg")

    missing = [n for p, n in [(logo_path, "logo.png"), (stamp_path, "stamp.png"), (sign_path, "sign.jpg")] if not os.path.exists(p)]
    if missing:
        raise FileNotFoundError(f"Missing assets in {ASSET_DIR}: {', '.join(missing)}")

    # --- PAGE SETUP ------------------------------------------------------
    L = R = 15 * mm
    T = B = 10 * mm
    CONTENT_W = A4[0] - L - R

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        leftMargin=L, rightMargin=R, topMargin=T, bottomMargin=B,
        title=f"Invoice {invoice.invoice_number}",
        author="Talent Corner HR Services",
    )

    F  = _UNICODE_FONT or "Helvetica"
    FB = _UNICODE_FONT or "Helvetica-Bold"

    def s(text, size=8, bold=False, align=TA_LEFT, color=colors.black):
        return Paragraph(text, ParagraphStyle(
            "_s", fontName=FB if bold else F,
            fontSize=size, leading=size + 3,
            textColor=color, alignment=align,
        ))

    elements = []

    # ===== 1. HEADER =====================================================
    logo = Image(logo_path, width=45*mm, height=22*mm)
    addr = s(
        "<b>708/709, Bhaveshwar Arcade NX</b><br/>"
        "Opp Shreyas Cinema, LBS Marg<br/>"
        "Ghatkopar (W), Mumbai-400086<br/>"
        "Mobile : 9820522847",
        size=8, color=colors.white,
    )
    hdr = Table([[logo, addr]], colWidths=[CONTENT_W*0.45, CONTENT_W*0.55], rowHeights=[27*mm])
    hdr.setStyle(TableStyle([
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("BACKGROUND",    (1,0),(1,0),   colors.black),
        ("LEFTPADDING",   (1,0),(1,0),   8),
        ("RIGHTPADDING",  (1,0),(1,0),   6),
        ("TOPPADDING",    (1,0),(1,0),   6),
        ("BOTTOMPADDING", (1,0),(1,0),   6),
    ]))
    elements.append(hdr)

    # ===== 2. TAX INVOICE TITLE ==========================================
    title_tbl = Table([[s("TAX INVOICE", size=11, bold=True, align=TA_CENTER)]], colWidths=[CONTENT_W])
    title_tbl.setStyle(TableStyle([
        ("BOX",           (0,0),(-1,-1), 0.5, colors.black),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
    ]))
    elements.append(title_tbl)

    # ===== 3. INVOICE NO / DATE ==========================================
    inv_date = invoice.invoice_date.strftime("%d-%b-%y") if invoice.invoice_date else ""
    meta = Table([
        [s(f"<b>INVOICE NO.: {invoice.invoice_number}</b>"),
         s(f"<b>DATE: {inv_date}</b>")]
    ], colWidths=[CONTENT_W*0.5, CONTENT_W*0.5])
    meta.setStyle(TableStyle([
        ("BOX",           (0,0),(-1,-1), 0.5, colors.black),
        ("LINEBEFORE",    (1,0),(1,0),   0.5, colors.black),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
    ]))
    elements.append(meta)

    # ===== 4. BILL TO ====================================================
    # Parse partner contact details (snapshotted as JSON in invoice.partner_details)
    try:
        _pd_raw = getattr(invoice, "partner_details", None) or "{}"
        _pd = json.loads(_pd_raw)
    except Exception:
        _pd = {}

    p_address    = (_pd.get("address",    "") or "").strip()
    p_gstin      = (_pd.get("gstin",      "") or "").strip()
    p_phone      = (_pd.get("phone",      "") or "").strip()
    p_email      = (_pd.get("email",      "") or "").strip()
    p_state_code = (_pd.get("state_code", "") or "").strip()

    # Left column: full billing address block
    _bill_lines = [f"<b>BILL To :</b> {invoice.partner_name}"]
    if p_address:
        _bill_lines.append(p_address)
    _bill_lines += [
        f"GSTIN/UIN: {p_gstin}",
        f"Phone : {p_phone}",
        f"Email : {p_email}",
        f"State Code : {p_state_code}",
    ]
    _bill_left = "<br/>".join(_bill_lines)

    # Right column: date repeated + kind attn
    _bill_right = (
        f"DATE: {inv_date}"
        f"<br/><br/><b>Kind Attn : {invoice.partner_name}</b>"
    )

    bill = Table(
        [[s(_bill_left), s(_bill_right)]],
        colWidths=[CONTENT_W * 0.65, CONTENT_W * 0.35],
    )
    bill.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 0.5, colors.black),
        ("LINEBEFORE",    (1, 0), (1,  0),  0.5, colors.black),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
    ]))
    elements.append(bill)

    # ===== 5. PARTICULARS ================================================
    taxable = float(invoice.amount or 0)

    part_rows = [
        [s("<b>Particulars</b>", bold=True), s("<b>HSN/SAC</b>", bold=True, align=TA_CENTER), s("<b>Amount</b>", bold=True, align=TA_RIGHT)],
        [s("Being Job Portal CV Excess Charges"), s("998311", align=TA_CENTER), s(_rs(taxable), align=TA_RIGHT)],
    ]
    for item in items:
        if item.get("qty", 0) <= 0:
            continue
        part_rows.append([
            s(f"  \u2022 {item['name']}: {int(item['qty']):,} units \u00d7 {_RUPEE}{item['rate']}", color=colors.grey),
            s(""),
            s(_rs(float(item["amount"])), align=TA_RIGHT, color=colors.grey),
        ])

    part = Table(part_rows, colWidths=[CONTENT_W*0.66, CONTENT_W*0.14, CONTENT_W*0.20])
    part.setStyle(TableStyle([
        ("BOX",           (0,0),(-1,-1), 0.5, colors.black),
        ("LINEBELOW",     (0,0),(-1,0),  0.5, colors.black),
        ("GRID",          (0,0),(-1,-1), 0.3, colors.black),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
    ]))
    elements.append(part)

    # ===== 6. BLANK CANDIDATE DETAIL GRID (left half only) ===============
    detail_rows = [
        ["Name Of Candidate",   ""],
        ["Position:",           ""],
        ["Annual Remuneration", "0"],
        ["Date of Joining",     ""],
        ["Due Date",            ""],
    ]
    half = CONTENT_W * 0.5
    det = Table(
        [[s(r), s(v)] for r, v in detail_rows],
        colWidths=[half*0.45, half*0.55],
    )
    det.setStyle(TableStyle([
        ("GRID",          (0,0),(-1,-1), 0.3, colors.black),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
    ]))
    elements.append(Table([[det, ""]], colWidths=[half, half]))

    # ===== 7. OUTPUT IGST + TOTAL BOX ====================================
    gst   = float(invoice.gst_amount   or 0)
    total = float(invoice.total_amount or 0)

    gst_rows = [
        [s("Output IGST"),
         s(_rs(gst), align=TA_RIGHT)],
        # Total row: bold text + grey background highlight
        [s("<b>Total</b>", bold=True),
         s(f"<b>{_rs(total)}</b>", bold=True, align=TA_RIGHT)],
    ]
    gst_box = Table(gst_rows, colWidths=[CONTENT_W*0.6, CONTENT_W*0.4])
    gst_box.setStyle(TableStyle([
        ("BOX",           (0,0),(-1,-1), 0.5, colors.black),
        ("LINEABOVE",     (0,1),(-1,1),  0.5, colors.black),
        # Grey highlight on Total row
        ("BACKGROUND",    (0,1),(-1,1),  colors.Color(0.87, 0.87, 0.87)),
        ("TOPPADDING",    (0,0),(-1,-1), 4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 4),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
        ("RIGHTPADDING",  (0,0),(-1,-1), 4),
        ("ALIGN",         (1,0),(1,-1),  "RIGHT"),
    ]))
    elements.append(gst_box)

    # ===== 8. AMOUNT IN WORDS ============================================
    words = Table([[s(amount_to_words(int(round(total))))]], colWidths=[CONTENT_W])
    words.setStyle(TableStyle([
        ("BOX",           (0,0),(-1,-1), 0.5, colors.black),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
    ]))
    elements.append(words)

    # ===== 9. TAX BREAKDOWN TABLE ========================================
    # HSN/SAC | Taxable Value | IGST Rate | IGST Amount | Total Tax Amount
    tax_hdr = [
        s("<b>HSN/SAC</b>",           bold=True, align=TA_CENTER),
        s("<b>Taxable\nValue</b>",    bold=True, align=TA_CENTER),
        s("<b>IGST\nRate</b>",        bold=True, align=TA_CENTER),
        s("<b>IGST\nAmount</b>",      bold=True, align=TA_CENTER),
        s("<b>Total Tax\nAmount</b>", bold=True, align=TA_CENTER),
    ]
    tax_data_row = [
        s("998311",          align=TA_CENTER),
        s(f"{taxable:,.2f}", align=TA_CENTER),
        s("18%",             align=TA_CENTER),
        s(f"{gst:,.2f}",     align=TA_CENTER),
        s(f"{gst:,.2f}",     align=TA_CENTER),
    ]
    tax_total_row = [
        s("<b>Total</b>",           bold=True, align=TA_CENTER),
        s(f"<b>{taxable:,.2f}</b>", bold=True, align=TA_CENTER),
        s(""),
        s(f"<b>{gst:,.2f}</b>",     bold=True, align=TA_CENTER),
        s(f"<b>{gst:,.2f}</b>",     bold=True, align=TA_CENTER),
    ]

    col_w = CONTENT_W / 5
    tax_tbl = Table([tax_hdr, tax_data_row, tax_total_row], colWidths=[col_w]*5)
    tax_tbl.setStyle(TableStyle([
        ("GRID",          (0,0),(-1,-1), 0.3, colors.black),
        ("LINEBELOW",     (0,0),(-1,0),  0.5, colors.black),
        # Grey highlight on Total row of the tax breakdown table too
        ("BACKGROUND",    (0,2),(-1,2),  colors.Color(0.87, 0.87, 0.87)),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
    ]))
    elements.append(tax_tbl)

    # ===== 10. TAX AMOUNT IN WORDS =======================================
    elements.append(s(f"<b>Tax Amount (in words) : {amount_to_words(int(round(gst)))}</b>", bold=True))
    elements.append(Spacer(1, 4*mm))

    # ===== 11. FOOTER: reg info left | sig right =========================
    reg = s(
        "GSTIN/UIN : 27AACCT6635P1ZP<br/>"
        "PAN NO.   : AACCT6635P<br/>"
        "MSME NO.  : UDYAM-MH-19-0067990<br/>"
        "State Code : 27<br/>"
        "LUT NO.   :<br/>"
        "From : To"
    )

    sign_img  = Image(sign_path,  width=22*mm, height=11*mm)
    stamp_img = Image(stamp_path, width=22*mm, height=22*mm)

    sig_inner = Table(
        [[s("<b>For Talent Corner HR Services</b><br/><br/><br/><br/>Authorised Signatory", bold=True),
          sign_img, stamp_img]],
        colWidths=[CONTENT_W*0.25, CONTENT_W*0.12, CONTENT_W*0.13],
    )
    sig_inner.setStyle(TableStyle([("VALIGN", (0,0),(-1,-1), "TOP")]))

    footer = Table([[reg, sig_inner]], colWidths=[CONTENT_W*0.5, CONTENT_W*0.5])
    footer.setStyle(TableStyle([
        ("BOX",           (0,0),(-1,-1), 0.5, colors.black),
        ("LINEBEFORE",    (1,0),(1,0),   0.5, colors.black),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
    ]))
    elements.append(footer)

    # ===== 12. BANK DETAILS ==============================================
    elements.append(Spacer(1, 2*mm))
    elements.append(s(
        "Bank Details : HDFC BANK LIMITED 1964 (Ghatkopar West Branch), "
        "Account No. :- 04062020001964, RTGS/NEFT IFSC :- HDFC0000406",
        size=7,
    ))

    # ===== BUILD =========================================================
    doc.build(elements)
    print(f"[invoice_pdf_generator] PDF built: {filepath}")

    # ===== UPLOAD TO SUPABASE (if configured) ============================
    if is_configured():
        try:
            public_url = upload_invoice_pdf(filepath, filename)
            if public_url:
                print(f"[invoice_pdf_generator] Uploaded: {public_url}")
                return public_url
        except Exception as err:
            print(f"[invoice_pdf_generator] Supabase upload failed, serving locally: {err}")

    return f"/static/invoices/{filename}"
