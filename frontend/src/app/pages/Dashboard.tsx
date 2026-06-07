import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileUp, AlertCircle, TrendingUp, Users,
  FileText, DollarSign, Plus, X, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { useFY } from "../context/FYContext";

import API from "../services/api";

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

interface TeamData {
  id: number;
  name: string;
  status: string;
  usage: { cv: number; nvites: number; jobs: number };
  total_limits: { cv: number; nvites: number; jobs: number };
  usage_percent: { cv: number; nvites: number; jobs: number };
  outstanding_invoice: number;
}

type CriticalTeam = TeamData;

export default function Dashboard() {
  const navigate = useNavigate();

  // ── FY from shared context ──────────────────────────
  const { financialYear, setFinancialYear, financialYears, refreshFYs, isLoading: fyLoading } = useFY();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [criticalTeams, setCriticalTeams] = useState<CriticalTeam[]>([]);
  const [allTeams, setAllTeams] = useState<TeamData[]>([]);
  const [chartData, setChartData] = useState<ChartTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [showYearModal, setShowYearModal] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [yearMessage, setYearMessage] = useState("");

  // ===================================================
  // LISTEN FOR UPLOAD EVENT — refresh after upload
  // ===================================================
  useEffect(() => {
    const handleUpload = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.financialYear && detail.financialYear !== financialYear) {
        setFinancialYear(detail.financialYear);
      } else {
        setRefreshKey((k) => k + 1);
      }
    };
    window.addEventListener("reportUploaded", handleUpload);
    return () => window.removeEventListener("reportUploaded", handleUpload);
  }, [financialYear, setFinancialYear]);

  // ===================================================
  // FETCH DASHBOARD DATA
  // ===================================================
  useEffect(() => {
    // Don't fetch if FY is not set
    if (!financialYear) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setDashboardError(null);
    setSummary(null);
    setCriticalTeams([]);
    setAllTeams([]);
    setChartData([]);

    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };
    const fy = encodeURIComponent(financialYear);

    fetch(`${API}/dashboard/all?financial_year=${fy}`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(`Dashboard fetch failed: ${r.status}`);
        return r.json();
      })
      .then(({ summary: summaryData, critical: criticalData, teams: teamsData }) => {
        if (cancelled) return;
        setSummary(summaryData);
        setCriticalTeams(Array.isArray(criticalData) ? criticalData.slice(0, 5) : []);
        setAllTeams(Array.isArray(teamsData) ? teamsData : []);
        const sorted = (Array.isArray(teamsData) ? teamsData : [])
          .sort((a: any, b: any) => (b.usage?.cv ?? 0) - (a.usage?.cv ?? 0))
          .slice(0, 10)
          .map((t: any) => ({
            name: t.name.length > 12 ? t.name.slice(0, 12) + "…" : t.name,
            cv: t.usage?.cv ?? 0,
            nvites: t.usage?.nvites ?? 0,
            jobs: t.usage?.jobs ?? 0,
          }));
        setChartData(sorted);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Dashboard fetch error:", err);
        if (!cancelled) {
          setDashboardError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [financialYear, refreshKey]);

  // ===================================================
  // ADD FINANCIAL YEAR
  // ===================================================
  const handleAddFinancialYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYear) { 
      setYearMessage("Please enter a financial year (e.g., 2026-2027)."); 
      return; 
    }
    
    const body = new FormData();
    body.append("label", newYear);
    body.append("uploaded_by", localStorage.getItem("username") || "Kajal");
    if (masterFile) body.append("master_file", masterFile);

    try {
      const response = await fetch(`${API}/financial-years/`, { method: "POST", body });
      const result = await response.json();
      setYearMessage(result.message || "Financial year saved.");
      if (result.status === "success") {
        refreshFYs();
        setFinancialYear(result.financial_year.label);
        setNewYear("");
        setMasterFile(null);
        setShowYearModal(false);
      }
    } catch (error) {
      setYearMessage("Error adding financial year. Please try again.");
      console.error(error);
    }
  };

  const uploadReminder = summary?.upload_reminder ?? false;
  const uploadOverdue = summary?.upload_overdue ?? false;
  const daysSinceUpload = summary?.days_since_upload ?? null;

  const formatDate = (d: string | null) => {
    if (!d) return "Never";
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
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
          {/* FY SELECTOR */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Financial Year:</label>
            <select
              value={financialYear}
              onChange={(e) => setFinancialYear(e.target.value)}
              disabled={fyLoading || financialYears.length === 0}
              className="px-4 py-2 border border-slate-300 rounded-xl bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
            >
              {fyLoading ? (
                <option>Loading years...</option>
              ) : financialYears.length > 0 ? (
                financialYears.map((y) => (
                  <option key={y.id} value={y.label}>
                    FY {y.label}
                  </option>
                ))
              ) : (
                <option value={financialYear}>FY {financialYear}</option>
              )}
            </select>
          </div>

          <button
            onClick={() => setShowYearModal(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Financial Year
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {dashboardError && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="text-red-600 w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-red-900">Error loading dashboard</p>
            <p className="text-sm text-red-800 mt-1">{dashboardError}</p>
          </div>
          <button
            onClick={() => setDashboardError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* UPLOAD OVERDUE BANNER */}
      {uploadOverdue && !loading && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="text-amber-600 w-5 h-5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-900">Weekly reports overdue</p>
            <p className="text-sm text-amber-800 mt-1">
              {daysSinceUpload === null
                ? "No reports uploaded for this financial year."
                : `Last upload was ${daysSinceUpload} days ago. Please update your weekly data.`}
            </p>
          </div>
          <button
            onClick={() => navigate("/upload-reports")}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition text-sm flex-shrink-0"
          >
            Upload Now
          </button>
        </div>
      )}

      {/* LOADING STATE */}
      {(loading || fyLoading) && (
        <div className="grid grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 animate-pulse">
              <div className="h-4 bg-slate-200 rounded mb-4 w-24"></div>
              <div className="h-8 bg-slate-200 rounded w-32"></div>
            </div>
          ))}
        </div>
      )}

      {/* MAIN CONTENT — only show when not loading */}
      {!loading && !fyLoading && summary && (
        <>
          {/* KPI CARDS */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm">Total Teams</p>
                  <p className="text-3xl font-bold mt-2">{summary.total_teams}</p>
                </div>
                <Users className="w-12 h-12 text-blue-100" />
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm">CV Access Used</p>
                  <p className="text-3xl font-bold mt-2">{(summary.total_cv_usage / 1000).toFixed(1)}k</p>
                </div>
                <FileText className="w-12 h-12 text-green-100" />
              </div>
            </div>

            <div
              className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 cursor-pointer hover:border-orange-300 transition"
              onClick={() => navigate("/invoices")}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm">Outstanding Invoices</p>
                  <p className="text-3xl font-bold mt-2">₹{(summary.outstanding_invoices / 100000).toFixed(1)}L</p>
                  {summary.outstanding_invoice_count > 0 && (
                    <p className="text-xs text-orange-600 mt-1 font-medium">{summary.outstanding_invoice_count} unpaid invoice{summary.outstanding_invoice_count !== 1 ? "s" : ""}</p>
                  )}
                </div>
                <DollarSign className="w-12 h-12 text-orange-100" />
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm">Alert Teams</p>
                  <p className="text-3xl font-bold mt-2 text-red-600">
                    {summary.critical_teams + summary.warning_teams}
                  </p>
                </div>
                <AlertCircle className="w-12 h-12 text-red-100" />
              </div>
            </div>
          </div>

          {/* CHARTS & ALERTS */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="col-span-2 bg-white rounded-xl p-6 shadow-sm border border-slate-200">
              <h3 className="text-lg mb-4">Top 10 Teams by CV Usage</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
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
                    const colorClass = isOver || team.status === "Critical"
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
                      <div key={team.id} className={`flex items-center justify-between p-3 border rounded-lg ${colorClass}`}>
                        <div>
                          <p className="font-medium text-sm">{team.name}</p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            CV: {team.usage?.cv?.toLocaleString()} / {team.total_limits?.cv?.toLocaleString()} · Peak: {worstPct}%
                          </p>
                        </div>
                        <span className={`px-2 py-1 text-xs rounded-full ${badgeClass}`}>{team.status}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* TEAMS WITH OUTSTANDING INVOICES */}
          {allTeams.some(t => (t.outstanding_invoice || 0) > 0) && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Teams with Outstanding Invoices</h3>
                <button onClick={() => navigate("/invoices")} className="text-sm text-purple-600 hover:underline">View all invoices →</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Team</th>
                      <th className="pb-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Usage Status</th>
                      <th className="pb-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">CV Used</th>
                      <th className="pb-2 text-right text-xs font-medium text-slate-500 uppercase tracking-wide">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTeams
                      .filter(t => (t.outstanding_invoice || 0) > 0)
                      .sort((a, b) => (b.outstanding_invoice || 0) - (a.outstanding_invoice || 0))
                      .map(team => {
                        const statusColor =
                          team.status === "Critical" || team.status === "Over limit" ? "bg-red-100 text-red-700"
                          : team.status === "Warning" ? "bg-orange-100 text-orange-700"
                          : "bg-green-100 text-green-700";
                        return (
                          <tr key={team.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                            <td className="py-3 text-sm font-medium text-slate-800">{team.name}</td>
                            <td className="py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                                {team.status}
                              </span>
                            </td>
                            <td className="py-3 text-right text-sm text-slate-600">
                              {(team.usage?.cv || 0).toLocaleString("en-IN")}
                              <span className="text-slate-400"> / {(team.total_limits?.cv || 0).toLocaleString("en-IN")}</span>
                            </td>
                            <td className="py-3 text-right">
                              <span className="text-sm font-semibold text-orange-600">
                                ₹{(team.outstanding_invoice || 0).toLocaleString("en-IN")}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
                    onClick={() => navigate("/alerts")}
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
                <p className="text-sm text-slate-600 mt-1">Add a new financial year to begin tracking usage.</p>
              </div>
              <button onClick={() => setShowYearModal(false)} className="text-slate-500 hover:text-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddFinancialYear} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Financial Year</label>
                <input
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value)}
                  placeholder="2026-2027"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Master Data File (optional)</label>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setMasterFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl bg-white"
                />
              </div>
              {yearMessage && (
                <div className={`border rounded-xl p-3 text-sm ${
                  yearMessage.includes("success") || yearMessage.includes("saved")
                    ? "bg-green-50 border-green-200 text-green-900"
                    : "bg-purple-50 border-purple-200 text-purple-900"
                }`}>
                  {yearMessage}
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowYearModal(false); setYearMessage(""); }} className="px-4 py-2 border border-slate-300 rounded-lg text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm">Save Year</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
