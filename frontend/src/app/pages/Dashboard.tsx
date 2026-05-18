import { useEffect, useState } from "react";
import {
  useNavigate,
  useLocation
} from "react-router-dom";
import {
  FileUp, AlertCircle, TrendingUp, Users,
  FileText, DollarSign, Plus, X, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

const API = "http://127.0.0.1:8000";

interface Summary {
  financial_year: string;
  total_teams: number;
  total_cv_usage: number;
  total_nvites_usage: number;
  total_job_postings: number;
  critical_teams: number;
  warning_teams: number;
  outstanding_invoices: number;
  outstanding_invoice_count: number;
  last_upload_date: string | null;
  upload_reminder: boolean;
  upload_overdue: boolean;
  upload_this_week: boolean;
  is_monday: boolean;
  days_since_upload: number | null;
  date_range: { start: string | null; end: string | null };
}

interface ChartTeam {
  name: string;
  cv: number;
  nvites: number;
  jobs: number;
}

interface CriticalTeam {
  id: number;
  name: string;
  status: string;
  usage: { cv: number; nvites: number; jobs: number };
  total_limits: { cv: number; nvites: number; jobs: number };
  usage_percent: { cv: number; nvites: number; jobs: number };
}

interface FinancialYear {
  id: number;
  label: string;
  is_active: boolean;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [financialYear, setFinancialYear] = useState("");
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [criticalTeams, setCriticalTeams] = useState<CriticalTeam[]>([]);
  const [chartData, setChartData] = useState<ChartTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0); // bumped after upload to force re-fetch

  const [showYearModal, setShowYearModal] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [yearMessage, setYearMessage] = useState("");

  // ===================================================
  // FETCH FINANCIAL YEARS
  // ===================================================

useEffect(() => {

  fetch(`${API}/dashboard/financial-years`)
    .then((r) => r.json())
    .then((data: FinancialYear[]) => {

      if (Array.isArray(data) && data.length) {

        setFinancialYears(data);

        // ==========================================
        // PRIORITY 1:
        // FY passed from Alerts page
        // ==========================================

        if (location.state?.financialYear) {

          setFinancialYear(
            location.state.financialYear
          );

          return;
        }

        // ==========================================
        // PRIORITY 2:
        // active FY
        // ==========================================

        const active =
          data.find((y) => y.is_active)
          ?? data[0];

        if (active) {

          setFinancialYear(active.label);
        }
      }
    })
    .catch(() => undefined);

}, [location.state]);

  // ===================================================
  // LISTEN FOR UPLOAD EVENT — refresh dashboard immediately after upload
  // ===================================================

  useEffect(() => {
    const handleUpload = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.financialYear && detail.financialYear !== financialYear) {
        setFinancialYear(detail.financialYear);
      } else {
        // Same FY — bump refreshKey to force re-fetch
        setRefreshKey((k) => k + 1);
      }
    };
    window.addEventListener("reportUploaded", handleUpload);
    return () => window.removeEventListener("reportUploaded", handleUpload);
  }, [financialYear]);

  // ===================================================
  // FETCH DASHBOARD DATA when FY changes or refreshKey bumps
  // ===================================================

useEffect(() => {

  if (!financialYear) return;

  let cancelled = false;

  setLoading(true);

  // ==========================================
  // CLEAR OLD DATA IMMEDIATELY
  // prevents wrong FY data flash
  // ==========================================

  setSummary(null);

  setCriticalTeams([]);

  setChartData([]);

  const token = localStorage.getItem("token");

  const headers = {
    Authorization: `Bearer ${token}`
  };

  const fy = encodeURIComponent(financialYear);

  Promise.all([

    fetch(
      `${API}/dashboard/summary?financial_year=${fy}`,
      { headers }
    ).then((r) => r.json()),

    fetch(
      `${API}/dashboard/critical?financial_year=${fy}`,
      { headers }
    ).then((r) => r.json()),

    fetch(
      `${API}/dashboard/teams?financial_year=${fy}`,
      { headers }
    ).then((r) => r.json()),

  ])
    .then(([summaryData, criticalData, teamsData]) => {

      // Ignore stale requests

      if (cancelled) return;

      setSummary(summaryData);

      setCriticalTeams(
        criticalData.slice(0, 5)
      );

      const sorted = [...teamsData]

        .sort(
          (a: any, b: any) =>
            (b.usage?.cv ?? 0) -
            (a.usage?.cv ?? 0)
        )

        .slice(0, 10)

        .map((t: any) => ({

          name:
            t.name.length > 12
              ? t.name.slice(0, 12) + "…"
              : t.name,

          cv: t.usage?.cv ?? 0,

          nvites: t.usage?.nvites ?? 0,

          jobs: t.usage?.jobs ?? 0,
        }));

      setChartData(sorted);
    })

    .catch(console.error)

    .finally(() => {

      if (!cancelled) {

        setLoading(false);
      }
    });

  return () => {

    cancelled = true;
  };

}, [financialYear, refreshKey]);

  // ===================================================
  // ADD FINANCIAL YEAR
  // ===================================================

  const handleAddFinancialYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYear) {
      setYearMessage("Please enter a financial year.");
      return;
    }
    const body = new FormData();
    body.append("label", newYear);
    body.append("uploaded_by", localStorage.getItem("username") || "Kajal");
    if (masterFile) body.append("master_file", masterFile);

    const response = await fetch(`${API}/financial-years/`, { method: "POST", body });
    const result = await response.json();
    setYearMessage(result.message || "Financial year saved.");
    if (result.status === "success") {
      setFinancialYears((prev) => {
        const exists = prev.find((y) => y.label === result.financial_year.label);
        return exists ? prev : [result.financial_year, ...prev];
      });
      setFinancialYear(result.financial_year.label);
      setNewYear("");
      setMasterFile(null);
      setShowYearModal(false);
    }
  };

  const uploadReminder = summary?.upload_reminder ?? false;
  const uploadOverdue  = summary?.upload_overdue  ?? false;
  const daysSinceUpload = summary?.days_since_upload ?? null;

  const formatDate = (d: string | null) => {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  };

  return (
    <div className="p-8">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Dashboard</h1>
          <p className="text-slate-600">Overview of usage and billing activity</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-xl bg-white"
          >
            {financialYears.length > 0
              ? financialYears.map((y) => (
                  <option key={y.id} value={y.label}>FY {y.label}</option>
                ))
              : <option value={financialYear}>FY {financialYear}</option>}
          </select>
          <button
            onClick={() => setShowYearModal(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Financial Year
          </button>
        </div>
      </div>

      {/* UPLOAD OVERDUE BANNER */}
      {uploadOverdue && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="text-amber-600 w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-900 font-medium">Upload Reminder</p>
            <p className="text-amber-800 text-sm">
              {daysSinceUpload !== null
                ? `No fresh report uploaded in ${daysSinceUpload} days.`
                : "No reports uploaded yet for this financial year."}{" "}
              Please upload the weekly Resdex and Job Posting reports.
            </p>
          </div>
          <button
            onClick={() => navigate("/upload-reports")}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition"
          >
            Upload Now
          </button>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      )}

      {!loading && summary && (
        <>
          {/* STAT CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-slate-600">Total CV Usage</h3>
              </div>
              <p className="text-3xl mb-1">{summary.total_cv_usage.toLocaleString("en-IN")}</p>
              <p className="text-sm text-slate-500">across {summary.total_teams} teams</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-slate-600">Total NVites Usage</h3>
              </div>
              <p className="text-3xl mb-1">{summary.total_nvites_usage.toLocaleString("en-IN")}</p>
              <p className="text-sm text-slate-500">FY {financialYear}</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-slate-600">Total Job Postings</h3>
              </div>
              <p className="text-3xl mb-1">{summary.total_job_postings.toLocaleString("en-IN")}</p>
              <p className="text-sm text-slate-500">FY {financialYear}</p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-slate-600">Critical Teams</h3>
              </div>
              <p className="text-3xl mb-1">{summary.critical_teams}</p>
              <p className="text-sm text-slate-500">
                {summary.warning_teams} warning · {summary.critical_teams} critical
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="text-slate-600">Outstanding Invoices</h3>
              </div>
              <p className="text-3xl mb-1">
                ₹{summary.outstanding_invoices.toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-slate-500">
                {summary.outstanding_invoice_count} pending payment{summary.outstanding_invoice_count !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${uploadOverdue ? "bg-amber-100" : "bg-green-100"}`}>
                  <FileUp className={`w-5 h-5 ${uploadOverdue ? "text-amber-600" : "text-green-600"}`} />
                </div>
                <h3 className="text-slate-600">Last Upload</h3>
              </div>
              <p className="text-3xl mb-1">{formatDate(summary.last_upload_date)}</p>
              <p className={`text-sm ${uploadOverdue ? "text-amber-600 font-medium" : "text-slate-500"}`}>
                {daysSinceUpload !== null
                  ? `${daysSinceUpload} day${daysSinceUpload !== 1 ? "s" : ""} ago`
                  : "No uploads yet"}
              </p>
            </div>
          </div>

          {/* CHARTS + CRITICAL TEAMS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg mb-4">Top Teams — CV Usage</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="cv" fill="#7B2CBF" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
                  No data for FY {financialYear}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg mb-4">
                Critical & Warning Teams
                {criticalTeams.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
                    {criticalTeams.length}
                  </span>
                )}
              </h3>
              {criticalTeams.length === 0 ? (
                <div className="h-40 flex items-center justify-center text-green-600 text-sm font-medium">
                  ✓ All teams within limits
                </div>
              ) : (
                <div className="space-y-3">
                  {criticalTeams.map((team) => {
                    const isOver = team.status === "Over limit";
                    const colorClass = isOver
                      ? "bg-red-50 border-red-200"
                      : team.status === "Critical"
                      ? "bg-red-50 border-red-200"
                      : "bg-orange-50 border-orange-200";
                    const badgeClass = isOver
                      ? "bg-red-700 text-white"
                      : team.status === "Critical"
                      ? "bg-red-500 text-white"
                      : "bg-orange-500 text-white";
                    const worstPct = Math.max(
                      team.usage_percent?.cv ?? 0,
                      team.usage_percent?.nvites ?? 0,
                      team.usage_percent?.jobs ?? 0
                    );
                    return (
                      <div
                        key={team.id}
                        className={`flex items-center justify-between p-3 border rounded-lg ${colorClass}`}
                      >
                        <div>
                          <p className="font-medium text-sm">{team.name}</p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            CV: {team.usage?.cv?.toLocaleString()} / {team.total_limits?.cv?.toLocaleString()} ·{" "}
                            Peak: {worstPct}%
                          </p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${badgeClass}`}>
                          {team.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* PENDING ACTIONS */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-lg mb-4">Pending Actions</h3>
            <div className="space-y-3">

              {uploadReminder && (
                <div className="flex items-center justify-between p-4 border border-amber-200 bg-amber-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileUp className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="font-medium">Upload weekly reports</p>
                      <p className="text-sm text-slate-600">
                        Today is Monday — weekly Resdex and Job Posting reports are due.
                        {daysSinceUpload !== null
                          ? ` Last upload was ${daysSinceUpload} days ago.`
                          : " No reports uploaded yet for this financial year."}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate("/upload-reports")}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
                  >
                    Upload
                  </button>
                </div>
              )}

              {(summary.critical_teams + summary.warning_teams) > 0 && (
                <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <div>
                      <p className="font-medium">Send usage alerts</p>
                      <p className="text-sm text-slate-600">
                        {summary.critical_teams + summary.warning_teams} team{(summary.critical_teams + summary.warning_teams) !== 1 ? "s" : ""} approaching or exceeding limits
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                    navigate("/alerts", {
                    state: {
                    financialYear
                    }
                  })
              }
                    className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition text-sm"
                  >
                    Review
                  </button>
                </div>
              )}

              {summary.outstanding_invoice_count > 0 && (
                <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-orange-600" />
                    <div>
                      <p className="font-medium">Follow up on payments</p>
                      <p className="text-sm text-slate-600">
                        {summary.outstanding_invoice_count} invoice{summary.outstanding_invoice_count !== 1 ? "s" : ""} pending ·{" "}
                        ₹{summary.outstanding_invoices.toLocaleString("en-IN")} outstanding
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate("/invoices")}
                    className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition text-sm"
                  >
                    View
                  </button>
                </div>
              )}

              {!uploadReminder &&
                (summary.critical_teams + summary.warning_teams) === 0 &&
                summary.outstanding_invoice_count === 0 && (
                  <div className="text-center py-8 text-green-600 text-sm font-medium">
                    ✓ No pending actions — all systems clear
                  </div>
                )}
            </div>
          </div>
        </>
      )}

      {/* ADD FINANCIAL YEAR MODAL */}
      {showYearModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl border border-slate-200">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-medium">Add Financial Year</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Add a new financial year to begin tracking usage.
                </p>
              </div>
              <button onClick={() => setShowYearModal(false)} className="text-slate-500 hover:text-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddFinancialYear} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Financial Year
                </label>
                <input
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="2027-2028"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Master Data File (optional)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setMasterFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white"
                />
              </div>
              {yearMessage && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-900">
                  {yearMessage}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowYearModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  Save Year
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
