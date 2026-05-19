import { useEffect, useState } from "react";

import {
  useNavigate
} from "react-router-dom";
import { useFY } from "../context/FYContext";
import {
  Send, MessageSquare, Mail, X,
  RefreshCw, AlertCircle, CheckCircle,
} from "lucide-react";

import API from "../services/api";

interface Member {
  name: string;
  email: string;
  cv_usage: number;
  nvites_usage: number;
  jobs_usage: number;
}

interface AlertTeam {
  team_id: number;
  team_name: string;
  partner_name: string;
  partner_email: string;
  type: "warning" | "critical" | "exceeded";
  status: string;
  cv_usage: number;
  cv_limit: number;
  nvites_usage: number;
  nvites_limit: number;
  jobs_usage: number;
  jobs_limit: number;
  cv_remaining: number;
  nvites_remaining: number;
  jobs_remaining: number;
  overage_amount: number;
  members: Member[];
  message: string;
}

// =====================================================
// WHATSAPP MESSAGE GENERATOR
// =====================================================

function buildWhatsAppMessage(a: AlertTeam): string {
  const pct = (u: number, l: number) =>
    l > 0 ? Math.round((u / l) * 100) : 0;

  const statusLine =
    a.type === "exceeded"
      ? "🔴 *LIMIT EXCEEDED*"
      : a.type === "critical"
      ? "🟠 *CRITICAL — Approaching Limit*"
      : "🟡 *WARNING — High Usage*";

  const memberLines = (a.members || [])
    .map(
      (m) =>
        `  • ${m.name || m.email} (${m.email})\n` +
        `    CV: ${(m.cv_usage ?? 0).toLocaleString("en-IN")} | NVites: ${m.nvites_usage.toLocaleString("en-IN")} | Jobs: ${m.jobs_usage}`
    )
    .join("\n");

  const overageLine =
    a.overage_amount > 0
      ? `\n⚠️ *Overage Amount Due (incl. GST): ₹${a.overage_amount.toLocaleString("en-IN")}*\nKindly clear this at the earliest.\n`
      : "";

  return (
    `Dear ${a.partner_name || a.team_name},\n\n` +
    `${statusLine}\n\n` +
    `We hope this message finds you well. This is a usage alert from *Talent Corner HR Services* regarding your Naukri.com account.\n\n` +
    `📊 *Usage Summary*\n` +
    `• CV Access    : ${a.cv_usage.toLocaleString("en-IN")} / ${a.cv_limit.toLocaleString("en-IN")} (${pct(a.cv_usage, a.cv_limit)}%) — Remaining: ${a.cv_remaining.toLocaleString("en-IN")}\n` +
    `• NVites       : ${a.nvites_usage.toLocaleString("en-IN")} / ${a.nvites_limit.toLocaleString("en-IN")} (${pct(a.nvites_usage, a.nvites_limit)}%) — Remaining: ${a.nvites_remaining.toLocaleString("en-IN")}\n` +
    `• Job Postings : ${a.jobs_usage} / ${a.jobs_limit} (${pct(a.jobs_usage, a.jobs_limit)}%) — Remaining: ${a.jobs_remaining}\n\n` +
    `👥 *Member-wise Breakdown*\n${memberLines}\n` +
    `${overageLine}\n` +
    `We request you to kindly review your usage and plan accordingly. Should you wish to purchase additional inventory, please reach out to us.\n\n` +
    `Thank you for your continued partnership.\n\n` +
    `Warm regards,\n` +
    `Operations Team\n` +
    `Talent Corner HR Services Pvt. Ltd.`
  );
}

function buildEmailBody(a: AlertTeam): string {
  const pct = (u: number, l: number) =>
    l > 0 ? Math.round((u / l) * 100) : 0;

  const memberRows = (a.members || [])
    .map(
      (m) =>
        `  - ${m.name || m.email} (${m.email})\n` +
        `    CV: ${(m.cv_usage ?? 0).toLocaleString("en-IN")} | NVites: ${m.nvites_usage.toLocaleString("en-IN")} | Jobs: ${m.jobs_usage}`
    )
    .join("\n");

  const statusLine =
    a.type === "exceeded"
      ? "LIMIT EXCEEDED"
      : a.type === "critical"
      ? "CRITICAL - Approaching Limit"
      : "WARNING - High Usage";

  const overageLine =
    a.overage_amount > 0
      ? `\nOVERAGE AMOUNT DUE (incl. GST): Rs. ${a.overage_amount.toLocaleString("en-IN")}\nKindly arrange payment at the earliest.\n`
      : "";

  return (
    `Dear ${a.partner_name || a.team_name},\n\n` +
    `We hope this message finds you well.\n\n` +
    `This is an automated usage alert from Talent Corner HR Services regarding your Naukri.com account.\n\n` +
    `STATUS: ${statusLine}\n\n` +
    `USAGE SUMMARY\n` +
    `${'='.repeat(50)}\n` +
    `CV Access    : ${a.cv_usage.toLocaleString("en-IN").padStart(8)} used / ${a.cv_limit.toLocaleString("en-IN").padStart(8)} allocated  (${pct(a.cv_usage, a.cv_limit)}%)  | Remaining: ${a.cv_remaining.toLocaleString("en-IN")}\n` +
    `NVites       : ${a.nvites_usage.toLocaleString("en-IN").padStart(8)} used / ${a.nvites_limit.toLocaleString("en-IN").padStart(8)} allocated  (${pct(a.nvites_usage, a.nvites_limit)}%)  | Remaining: ${a.nvites_remaining.toLocaleString("en-IN")}\n` +
    `Job Postings : ${String(a.jobs_usage).padStart(8)} used / ${String(a.jobs_limit).padStart(8)} allocated  (${pct(a.jobs_usage, a.jobs_limit)}%)  | Remaining: ${a.jobs_remaining}\n\n` +
    `MEMBER-WISE BREAKDOWN\n` +
    `${'='.repeat(50)}\n` +
    `${memberRows}\n` +
    `${overageLine}\n` +
    `We request you to review your usage at the earliest and plan accordingly. Should you wish to purchase additional inventory or discuss your account, please do not hesitate to contact us.\n\n` +
    `Thank you for your continued partnership.\n\n` +
    `Warm regards,\n` +
    `Operations Team\n` +
    `Talent Corner HR Services Pvt. Ltd.`
  );
}

// =====================================================
// BADGE HELPERS
// =====================================================

function AlertBadge({ type }: { type: string }) {
  if (type === "exceeded")
    return <span className="px-2 py-1 bg-red-700 text-white text-xs rounded-full">Exceeded</span>;
  if (type === "critical")
    return <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">Critical</span>;
  return <span className="px-2 py-1 bg-orange-500 text-white text-xs rounded-full">Warning</span>;
}

function alertBg(type: string) {
  if (type === "exceeded") return "border-red-200 bg-red-50";
  if (type === "critical") return "border-red-200 bg-red-50";
  return "border-orange-200 bg-orange-50";
}

function pct(u: number, l: number) {
  return l > 0 ? Math.round((u / l) * 100) : 0;
}

// =====================================================
// MAIN
// =====================================================

export default function Alerts() {

  const navigate = useNavigate();
  const { financialYear, setFinancialYear, financialYears } = useFY();
  const [alerts, setAlerts] = useState<AlertTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [previewAlert, setPreviewAlert] = useState<AlertTeam | null>(null);
  const [previewTab, setPreviewTab] = useState<"whatsapp" | "email">("whatsapp");
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sentIds, setSentIds] = useState<Set<number>>(new Set());

  // ---------------------------------------------------
  // Fetch alerts
  // ---------------------------------------------------
  const fetchAlerts = () => {
    if (!financialYear) return;
    setLoading(true);
    setError("");
    fetch(`${API}/alerts/?financial_year=${encodeURIComponent(financialYear)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAlerts(data);
        else setAlerts([]);
      })
      .catch(() => setError("Failed to load alerts. Is the server running?"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAlerts(); }, [financialYear]);

  // ---------------------------------------------------
  // Send alert email via backend
  // ---------------------------------------------------
  const handleSendAlert = async (a: AlertTeam) => {
    setSendingId(a.team_id);
    try {
      const res = await fetch(
        `${API}/alerts/${a.team_id}/send?financial_year=${encodeURIComponent(financialYear)}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.status === "success") {
        setSentIds((prev) => new Set([...prev, a.team_id]));
      } else {
        setError(`Failed to send alert for ${a.team_name}: ${data.message || "Unknown error"}`);
      }
    } catch {
      setError(`Server error while sending alert for ${a.team_name}.`);
    } finally {
      setSendingId(null);
    }
  };

  // ---------------------------------------------------
  // Open WhatsApp with pre-filled message
  // ---------------------------------------------------
  const openWhatsApp = (a: AlertTeam) => {
    const msg = encodeURIComponent(buildWhatsAppMessage(a));
    // Opens WhatsApp with message pre-filled; no phone hardcoded
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  // ---------------------------------------------------
  // Open email client with pre-filled draft
  // ---------------------------------------------------
  const openEmail = (a: AlertTeam) => {
    const subject = encodeURIComponent(`Naukri.com Usage Alert — ${a.team_name} | FY ${financialYear}`);
    const body = encodeURIComponent(buildEmailBody(a));
    const to = encodeURIComponent(a.partner_email || "");
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, "_blank");
  };

  // ---------------------------------------------------
  // Stats
  // ---------------------------------------------------
  const exceededCount = alerts.filter((a) => a.type === "exceeded").length;
  const criticalCount = alerts.filter((a) => a.type === "critical").length;
  const warningCount = alerts.filter((a) => a.type === "warning").length;

  return (
    <div className="p-8">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Alerts</h1>
          <p className="text-slate-600">Manage and send usage notifications to franchise partners</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-xl bg-white text-sm"
          >
            {financialYears.length > 0
              ? financialYears.map((y) => (
                  <option key={y.id} value={y.label}>FY {y.label}</option>
                ))
              : <option value={financialYear}>FY {financialYear}</option>}
          </select>
          <button
            onClick={fetchAlerts}
            className="px-4 py-2 border border-slate-300 rounded-xl text-sm hover:bg-slate-50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Teams Exceeding Limits</p>
          <p className="text-3xl font-medium text-red-600">{exceededCount}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Critical Alerts (90%+)</p>
          <p className="text-3xl font-medium text-orange-600">{criticalCount + warningCount}</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Alerts Sent This Session</p>
          <p className="text-3xl font-medium text-purple-600">{sentIds.size}</p>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={() => setError("")} className="ml-auto text-red-500"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
        </div>
      )}

      {/* EMPTY */}
      {!loading && alerts.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-10 text-center">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-green-800 font-medium text-lg">All teams within limits</p>
          <p className="text-green-700 text-sm mt-1">
            No warnings or critical alerts for FY {financialYear}
          </p>
        </div>
      )}

      {/* ALERT CARDS */}
      {!loading && (
        <div className="space-y-4">
          {alerts.map((a) => (
            <div
              key={a.team_id}
              className={`rounded-xl p-6 border ${alertBg(a.type)}`}
            >
              {/* TOP ROW */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-xl font-medium">{a.team_name}</h3>
                    <AlertBadge type={a.type} />
                    {sentIds.has(a.team_id) && (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Alert Sent
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">
                    {a.partner_name || "—"} · {a.partner_email || "no email on file"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setPreviewAlert(a); setPreviewTab("whatsapp"); }}
                    className="px-3 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-sm"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => openWhatsApp(a)}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center gap-2 text-sm"
                  >
                    <MessageSquare className="w-4 h-4" /> WhatsApp
                  </button>
                  <button
                    onClick={() => openEmail(a)}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 text-sm"
                  >
                    <Mail className="w-4 h-4" /> Email
                  </button>
                  <button
                    onClick={() => handleSendAlert(a)}
                    disabled={sendingId === a.team_id || sentIds.has(a.team_id)}
                    className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {sendingId === a.team_id
                      ? <RefreshCw className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />}
                    {sendingId === a.team_id ? "Sending..." : "Send Email"}
                  </button>
                  <button
                    onClick={() => navigate("/dashboard")}
                  className="px-3 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 text-sm"
                >
                  Review
                </button>
                </div>
              </div>

              {/* USAGE GRID */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "CV Access", used: a.cv_usage, limit: a.cv_limit, rem: a.cv_remaining },
                  { label: "NVites", used: a.nvites_usage, limit: a.nvites_limit, rem: a.nvites_remaining },
                  { label: "Job Postings", used: a.jobs_usage, limit: a.jobs_limit, rem: a.jobs_remaining },
                ].map(({ label, used, limit, rem }) => (
                  <div key={label} className="bg-white rounded-lg p-3 border border-slate-200">
                    <p className="text-xs text-slate-600 mb-1">{label}</p>
                    <p className="font-medium text-sm">
                    {(used ?? 0).toLocaleString()} / {(limit ?? 0).toLocaleString()}
                    </p>

                    <p className="text-xs text-slate-500 mt-0.5">
                    {pct(used ?? 0, limit ?? 0)}% used · {(rem ?? 0).toLocaleString()} remaining
                    </p>
                  </div>
                ))}
              </div>

              {/* OVERAGE */}
              {a.overage_amount > 0 && (
                <div className="mt-3 bg-red-100 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-900 font-medium">
                  Overage due: ₹{a.overage_amount.toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* PREVIEW MODAL */}
      {previewAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto shadow-2xl">

            <div className="p-5 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-medium">Alert Preview — {previewAlert.team_name}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Review before sending</p>
              </div>
              <button onClick={() => setPreviewAlert(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {/* TABS */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setPreviewTab("whatsapp")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    previewTab === "whatsapp"
                      ? "bg-green-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" /> WhatsApp
                </button>
                <button
                  onClick={() => setPreviewTab("email")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    previewTab === "email"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Mail className="w-4 h-4" /> Email
                </button>
              </div>

              {/* MESSAGE CONTENT */}
              <pre className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                {previewTab === "whatsapp"
                  ? buildWhatsAppMessage(previewAlert)
                  : buildEmailBody(previewAlert)}
              </pre>

              {/* SEND BUTTONS */}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => openWhatsApp(previewAlert)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                >
                  <MessageSquare className="w-4 h-4" /> Open WhatsApp
                </button>
                <button
                  onClick={() => openEmail(previewAlert)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Mail className="w-4 h-4" /> Open Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}