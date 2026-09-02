import sys
sys.path.insert(0, '.')
from app.services.report_processor import ReportProcessor

rp = ReportProcessor()

# Read resdex
df_raw = rp._read_file('uploaded_reports/Resdex_Usage_Report-01-Apr-26_To_30-Apr-26.xls')
df = rp._normalize_resdex(df_raw)
print('=== RESDEX NORMALIZED ===')
for i in range(min(10, len(df))):
    row = df.iloc[i]
    email = row["email"]
    cv = row["cv_usage"]
    nv = row["nvites_usage"]
    name = row["name"]
    print(f"  {email:40s} cv={cv:5d} nvites={nv:5d} name={name}")

print()

# Read jobs
df_raw_j = rp._read_file('uploaded_reports/SUSER-01APR_30APR.xlsx')
df_j = rp._normalize_jobs(df_raw_j)
print('=== JOBS NORMALIZED ===')
for i in range(min(10, len(df_j))):
    row = df_j.iloc[i]
    email = row["email"]
    jobs = row["jobs_usage"]
    print(f"  {email:40s} jobs={jobs:5d}")

print()

# Also print what columns the resdex file has and which were matched
print("=== RESDEX RAW COLUMNS ===")
for i, c in enumerate(df_raw.columns):
    print(f"  [{i}] {c}")

print()
print("=== SUSER RAW COLUMNS ===")
for i, c in enumerate(df_raw_j.columns):
    print(f"  [{i}] {c}")
