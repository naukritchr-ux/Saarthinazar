import os

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    Image,
)
from reportlab.lib.styles import getSampleStyleSheet

from num2words import num2words

from app.services.supabase_storage import (
    upload_invoice_pdf,
    is_configured,
)

# =====================================================
# PATHS
# =====================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.dirname(__file__)
    )
)

ASSET_DIR = os.path.join(BASE_DIR, "static", "assets")

INVOICE_DIR = os.path.join(BASE_DIR, "static", "invoices")

os.makedirs(INVOICE_DIR, exist_ok=True)

# =====================================================
# AMOUNT TO WORDS
# =====================================================

def amount_to_words(amount: int) -> str:
    words = num2words(amount, lang="en_IN")
    return f"INR {words.title()} Only"


# =====================================================
# GENERATE PDF
# Saves locally first, then uploads to Supabase
#
# Returns:
#   - Supabase public URL (if configured)
#   - Local static URL fallback
# =====================================================

def generate_invoice_pdf(invoice, items) -> str:

    filename = f"{invoice.invoice_number}.pdf"
    filepath = os.path.join(INVOICE_DIR, filename)

    # =====================================================
    # PDF DOCUMENT
    # =====================================================

    doc = SimpleDocTemplate(
        filepath,
        pagesize=A4,
        rightMargin=20,
        leftMargin=20,
        topMargin=20,
        bottomMargin=20,
    )

    styles = getSampleStyleSheet()
    elements = []

    # =====================================================
    # ASSETS
    # =====================================================

    logo_path = os.path.join(ASSET_DIR, "logo.png")
    stamp_path = os.path.join(ASSET_DIR, "stamp.png")

    sign_path = os.path.join(ASSET_DIR, "sign.jpg")

    if not os.path.exists(sign_path):
        sign_path = os.path.join(ASSET_DIR, "sign.jpg.jpeg")

    missing = [
        name
        for path, name in [
            (logo_path, "logo.png"),
            (stamp_path, "stamp.png"),
            (sign_path, "signature (sign.jpg)"),
        ]
        if not os.path.exists(path)
    ]

    if missing:
        raise FileNotFoundError(
            f"Missing assets in {ASSET_DIR}: {', '.join(missing)}"
        )

    # =====================================================
    # HEADER
    # =====================================================

    logo = Image(logo_path, width=80, height=80)

    address = Paragraph(
        """
        <b>708/709, Bhaveshwar Arcade NX</b><br/>
        Opp Shreyas Cinema, LBS Marg<br/>
        Ghatkopar (W), Mumbai - 400086<br/>
        Mobile : 9820522847
        """,
        styles["Normal"],
    )

    header = Table(
        [[logo, address]],
        colWidths=[150, 320]
    )

    header.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )

    elements.append(header)
    elements.append(Spacer(1, 10))

    # =====================================================
    # TITLE
    # =====================================================

    title = Table(
        [["TAX INVOICE"]],
        colWidths=[470]
    )

    title.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, colors.black),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 14),
        ])
    )

    elements.append(title)

    # =====================================================
    # INVOICE META
    # =====================================================

    meta = Table(
        [[
            f"INVOICE NO.: {invoice.invoice_number}",
            f"DATE: {invoice.invoice_date.strftime('%d-%b-%Y')}",
        ]],
        colWidths=[235, 235],
    )

    meta.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, colors.black),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ])
    )

    elements.append(meta)

    # =====================================================
    # BILL TO
    # =====================================================

    bill_to = Paragraph(
        f"<b>BILL TO:</b><br/>{invoice.partner_name}",
        styles["Normal"],
    )

    bill_table = Table(
        [[bill_to]],
        colWidths=[470]
    )

    bill_table.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, colors.black),
        ])
    )

    elements.append(bill_table)
    elements.append(Spacer(1, 10))

    # =====================================================
    # ITEMS TABLE
    # =====================================================

    table_data = [["Particulars", "Qty", "Rate", "Amount"]]

    for item in items:

        if item["qty"] <= 0:
            continue

        table_data.append([
            item["name"],
            str(item["qty"]),
            f"₹ {item['rate']}",
            f"₹ {item['amount']}",
        ])

    item_table = Table(
        table_data,
        colWidths=[220, 60, 80, 110]
    )

    item_table.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ])
    )

    elements.append(item_table)
    elements.append(Spacer(1, 20))

    # =====================================================
    # GST + TOTAL
    # =====================================================

    gst_table = Table(
        [
            ["Subtotal", f"₹ {invoice.amount:,.2f}"],
            ["IGST 18%", f"₹ {invoice.gst_amount:,.2f}"],
            ["TOTAL", f"₹ {invoice.total_amount:,.2f}"],
        ],
        colWidths=[320, 150],
    )

    gst_table.setStyle(
        TableStyle([
            ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ])
    )

    elements.append(gst_table)
    elements.append(Spacer(1, 10))

    # =====================================================
    # AMOUNT IN WORDS
    # =====================================================

    elements.append(
        Paragraph(
            amount_to_words(int(invoice.total_amount)),
            styles["Normal"],
        )
    )

    elements.append(Spacer(1, 20))

    # =====================================================
    # FOOTER (SIGN + STAMP)
    # =====================================================

    sign = Image(sign_path, width=80, height=30)
    stamp = Image(stamp_path, width=70, height=70)

    footer = Table(
        [[
            Paragraph(
                """
                GSTIN/UIN : 27AACCT6635P1ZP<br/>
                PAN NO. : AACCT6635P<br/>
                MSME NO. : UDYAM-MH-19-0067990
                """,
                styles["Normal"],
            ),
            sign,
            stamp,
        ]],
        colWidths=[250, 100, 120],
    )

    footer.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 1, colors.black),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )

    elements.append(footer)
    elements.append(Spacer(1, 10))

    # =====================================================
    # BANK DETAILS
    # =====================================================

    bank_details = Paragraph(
        """
        Bank Details : HDFC BANK LIMITED 1964
        (Ghatkopar West Branch)<br/>
        Account No. :- 04062020001964<br/>
        RTGS/NEFT IFSC :- HDFC0000406
        """,
        styles["Normal"],
    )

    elements.append(bank_details)

    # =====================================================
    # BUILD PDF
    # =====================================================

    doc.build(elements)

    print(f"[invoice_pdf_generator] ✅ PDF built: {filepath}")

    # =====================================================
    # UPLOAD TO SUPABASE (if configured)
    # =====================================================

    if is_configured():

        try:

            public_url = upload_invoice_pdf(
                filepath,
                filename
            )

            print(
                "[invoice_pdf_generator] ✅ Uploaded to Supabase:",
                public_url
            )

            return public_url

        except Exception as upload_err:

            print(
                "[invoice_pdf_generator] ⚠ Supabase upload failed "
                f"(falling back to local): {upload_err}"
            )

    # =====================================================
    # LOCAL FALLBACK
    # =====================================================

    return f"/static/invoices/{filename}"