Create a modern, minimal, enterprise-grade SaaS web application UI called “Naukri Usage Monitor & Billing System” with a premium purple + white theme inspired by Stripe, Linear, Notion, and Zoho CRM. The design must feel like a real production SaaS platform used internally by enterprise operations teams. Use clean typography (Inter/Poppins), soft shadows, rounded corners (12–16px), spacious layouts, subtle purple accents (#7B2CBF), white/light-grey backgrounds (#F5F6FA), minimal charts, clean icons, and strong visual hierarchy. Avoid clutter, overly colorful dashboards, heavy gradients, pie charts, donut charts, or unnecessary analytics visuals.
The application must use a horizontal top navigation bar (NOT sidebar) with:


Dashboard


Team Usage


Alerts


Top-Ups


Invoices & Payments


Financial Insights (Owner Only)


Master Data (Owner Only)


Top-right section includes:


Profile


Settings


User Role Indicator (Kajal / Rashesh)


The system supports 2 roles with strict role-based UI restrictions:
Kajal (Operations User) can:


Upload weekly reports


View dashboard & team usage


Send alerts


Add top-ups


Generate invoices


Track payments


View expandable user usage breakdown


Kajal cannot:


View pricing structure


View company cost


View profitability


View financial insights


Edit licence allocations


Rashesh (Owner/Admin) has full access including:


Financial dashboard


Revenue vs cost


Gross profit


Profit per partner


Outstanding receivables


Licence allocation editing


Pricing structure management


Inventory management


Company cost visibility


Restricted sections should be hidden automatically depending on role.
IMPORTANT SYSTEM FLOW:
Every Monday Kajal uploads:


Resdex Usage Report (.xls)


Job Posting Report (.xlsx / CSV)


Both reports MUST:


Be uploaded simultaneously


Cover the date range from 1 April of the selected financial year to today


Match each other exactly in date range


Be validated before upload acceptance


Validation Rules:


If either report does not start from 1 April → hard error


If report date ranges mismatch → hard error


If only one file is uploaded → hard error


Show elegant validation UI with message:
“Report date mismatch. Please upload both reports from 01 Apr 2026 to today.”


Matching Logic:


Reports are matched using subuser email ID ONLY (e.g. gauri.naik@talentcorner.in)


Team names are unreliable due to formatting inconsistencies


Subuser email is the unique identifier


After matching subusers, data is rolled up to team-level for dashboard analytics


Dashboard Page:
Minimal overview dashboard with:


KPI cards:


Total CV Usage


Total NVites Usage


Total Job Postings


Critical Teams


Outstanding Invoices


Last Upload Date




Financial Year selector (2025–2026, 2026–2027 etc.)


Upload reminder banner if no upload in last 8 days


Pending actions section


Critical teams section


Minimal bar charts only (no pie/donut charts)


Upload Reports Section:


Financial Year selector


Drag & drop upload UI


Upload history


Uploaded by


Upload timestamp


Validation status


Success/failure logs


Elegant error state cards


Team Usage Page:
Professional clean enterprise table with:


Team Name


Licence Count


Original Assigned Limits


Additional Top-Ups


Total Available Limits


CV Usage


NVites Usage


Job Posting Usage


Remaining Balance


Usage %


Status


Outstanding Invoice


Actions


Display inventory like:
3000 + 1000 Top-Up = 4000
Expandable rows show sub-user/member usage:


Name


Email


CV usage


NVites usage


Job posting usage


Usage status colors:


Green (<70%)


Amber (70–90%)


Red (>90%)


Dark Red (>100%)


Alerts Page:
Modern alert management page showing:


Teams approaching limits


Teams exceeding limits


Alert history


Include polished WhatsApp + Email alert preview modal containing:


Team name


Full usage summary


Remaining balance


Team-member-wise breakdown


Overage amount


Invoice payment button/link


Top-Ups Page:
Minimal form UI containing:


Team selector


CV/NVites/Jobs top-up inputs


Amount


Date picker


Display:


Original limits


Purchased top-ups


Final available inventory


Recent top-up activity log


Invoices & Payments Page:
Professional invoice management UI with:


Invoice ID


Partner Name


Amount


Due Date


Payment Status


Payment Date


Invoice Link/Button


Include:


Generate Invoice button


Paid / Partial / Unpaid badges


Subtle overdue invoice highlighting


Financial Insights Page (Visible ONLY to Rashesh):
Minimal executive-focused financial dashboard containing:


Revenue summary


Gross profit


Profit per partner


Outstanding receivables


Overage revenue


Revenue vs cost cards


MASTER DATA MODULE (Owner Only):
Create a dedicated Master Data page where Rashesh can manage:


Team licence counts


Pricing structure


Inventory allocation


Partner type


Quarterly pricing configuration


Manual overrides


The system must support multi-licence partners where inventory scales automatically based on licence count.
Example:
2 licences in Q1 =


6000 CVs


45000 NVites


200 Job Postings


Quarterly inventory & pricing structure must support manual editing and timestamp logging.
Pricing & Inventory Table:
Q1 (Apr–Jun):


Early Renewal: ₹80,000 → 3000 CV / 22500 NVites / 100 Jobs


New Partner: ₹80,000 → 3000 CV / 22500 NVites / 100 Jobs


Late Existing Partner: ₹84,000 → 3000 CV / 22500 NVites / 100 Jobs


Q2 (Jul–Sep):


New Partner: ₹65,000 → 3000 CV / 22500 NVites / 100 Jobs


Returning Partner: ₹70,000 → 3000 CV / 22500 NVites / 100 Jobs


Oct–Nov:


New Partner: ₹48,000 → 2000 CV / 11250 NVites / 70 Jobs


Returning Partner: ₹52,000 → 2000 CV / 11250 NVites / 70 Jobs


December:


FREE → 1000 CV / 7500 NVites / 50 Jobs


January:


₹15,000 → 750 CV / 5000 NVites / 30 Jobs


February:


FREE → 500 CV / 2500 NVites / 20 Jobs


March:


FREE → 250 CV / 2500 NVites / 20 Jobs


Additional Requirements:


Rashesh can manually edit pricing and inventory at any time


All changes must be audit logged with timestamp


System maintains editable master team list


Master data page visible only to owner


Technical/UI Requirements:


React + modern SaaS architecture


Clean reusable components


Responsive layout


Card-based UI


Subtle animations


Soft shadows


Modern tables


Elegant empty/error states


Minimal enterprise UX


Avoid clutter completely


Use centered layouts and strong spacing


Ensure every React list item has unique key props to avoid warnings


Final goal:
Build a production-grade, minimal, role-based enterprise SaaS platform optimized for operational workflows, report validation, inventory monitoring, billing management, and financial tracking while remaining extremely intuitive for non-technical admin users. 