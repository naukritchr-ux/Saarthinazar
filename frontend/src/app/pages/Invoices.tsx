import { useEffect, useMemo, useState } from "react";
import {
  FileText, Download, CheckCircle, Clock, AlertTriangle,
  RefreshCw, DollarSign, X, Loader2, AlertCircle, Edit2, Save,
} from "lucide-react";
import { useFY } from "../context/FYContext";
import API from "../services/api";

const _API = API;

interface Invoice {
  id: number;
  invoice_number: string;
  partner_name: string;
  financial_year: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_status: "paid" | "partial" | "unpaid";
  invoice_type: string;
  invoice_date: string | null;
  due_date: string | null;
  payment_date: string | null;
  pdf_path: string | null;
  notes: string;
  partner_details: Record<string, string>;
}

interface PreflightWarning {
  team_id: number;
  team_name: string;
  missing_fields: string[];
}

// ── helpers ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full"><CheckCircle className="w-3 h-3" /> Paid</span>;
  if (status === "partial")
    return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full"><Clock className="w-3 h-3" /> Partial</span>;
  return <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full"><AlertTriangle className="w-3 h-3" /> Unpaid</span>;
}

function isOverdue(d: string | null) {
  if (!d) return false;
  const dt = new Date(d);
  return dt < new Date() && dt.toDateString() !== new Date().toDateString();
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtINR(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0 });
}

// =====================================================
// INVOICE DETAILS MODAL  (Kajal & Rashesh)
// All inputs are inlined — NO sub-components defined
// inside this function, which would cause React to
// unmount/remount on every keystroke (focus loss bug).
// =====================================================

interface DetailsModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (updated: Partial<Invoice>) => void;
}

function InvoiceDetailsModal({ invoice, onClose, onSaved }: DetailsModalProps) {
  const d = invoice.partner_details || {};

  const [form, setForm] = useState({
    partner_name:        invoice.partner_name  || "",
    address:             d.address             || "",
    city:                d.city                || "",
    pincode:             d.pincode             || "",
    gstin:               d.gstin               || "",
    phone:               d.phone               || "",
    email:               d.email               || "",
    state_code:          d.state_code          || "",
    candidate_name:      d.candidate_name      || "",
    position:            d.position            || "",
    annual_remuneration: d.annual_remuneration || "",
    date_of_joining:     d.date_of_joining     || "",
    due_date_detail:     d.due_date_detail     || "",
  });

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const [saved,  setSaved]  = useState(false);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const r = await fetch(`${API}/invoices/${invoice.id}/details`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Save failed");
      setSaved(true);
      onSaved({
        partner_name:    data.partner_name,
        partner_details: data.partner_details,
        pdf_path:        data.pdf_path,
      });
      setTimeout(onClose, 900);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:outline-none";
  const lbl = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center">
            <Edit2 className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">Edit Invoice Details</h3>
            <p className="text-slate-400 text-xs truncate">{invoice.invoice_number} · {invoice.partner_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Bill To */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Bill To</p>
            <div className="space-y-3">

              <div>
                <label className={lbl}>Partner / Company Name</label>
                <input className={inp} type="text" placeholder="Team Aastha Kakkar"
                  value={form.partner_name} onChange={set("partner_name")} />
              </div>

              <div>
                <label className={lbl}>Address</label>
                <input className={inp} type="text" placeholder="H.No: 103/8, Colonelganj"
                  value={form.address} onChange={set("address")} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>City</label>
                  <input className={inp} type="text" placeholder="Kanpur"
                    value={form.city} onChange={set("city")} />
                </div>
                <div>
                  <label className={lbl}>PIN Code</label>
                  <input className={inp} type="text" placeholder="208001"
                    value={form.pincode} onChange={set("pincode")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>GSTIN / UIN</label>
                  <input className={inp} type="text" placeholder="09XXXXX"
                    value={form.gstin} onChange={set("gstin")} />
                </div>
                <div>
                  <label className={lbl}>State Code</label>
                  <input className={inp} type="text" placeholder="09"
                    value={form.state_code} onChange={set("state_code")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Phone</label>
                  <input className={inp} type="text" placeholder="98XXXXXXXX"
                    value={form.phone} onChange={set("phone")} />
                </div>
                <div>
                  <label className={lbl}>Email</label>
                  <input className={inp} type="email" placeholder="partner@example.com"
                    value={form.email} onChange={set("email")} />
                </div>
              </div>

            </div>
          </div>

          {/* Placement Details */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Placement Details (optional)</p>
            <div className="space-y-3">

              <div>
                <label className={lbl}>Candidate Name</label>
                <input className={inp} type="text" placeholder="Full name"
                  value={form.candidate_name} onChange={set("candidate_name")} />
              </div>

              <div>
                <label className={lbl}>Position</label>
                <input className={inp} type="text" placeholder="Job title"
                  value={form.position} onChange={set("position")} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Annual Remuneration (₹)</label>
                  <input className={inp} type="number" placeholder="0"
                    value={form.annual_remuneration} onChange={set("annual_remuneration")} />
                </div>
                <div>
                  <label className={lbl}>Date of Joining</label>
                  <input className={inp} type="date"
                    value={form.date_of_joining} onChange={set("date_of_joining")} />
                </div>
              </div>

              <div>
                <label className={lbl}>Due Date (for invoice)</label>
                <input className={inp} type="date"
                  value={form.due_date_detail} onChange={set("due_date_detail")} />
              </div>

            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
            Saving will immediately regenerate the PDF with these details. Amounts and GST are not affected.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0">
          {error && (
            <p className="text-sm text-red-600 flex items-center gap-1 mb-3">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2 font-medium"
            >
              {saved
                ? <><CheckCircle className="w-4 h-4" /> Saved!</>
                : saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving & Regenerating PDF...</>
                  : <><Save className="w-4 h-4" /> Save & Regenerate PDF</>}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// =====================================================
// PREFLIGHT WARNING MODAL
// =====================================================

interface PreflightModalProps {
  warnings: PreflightWarning[];
  onProceed: () => void;
  onCancel: () => void;
}

function PreflightModal({ warnings, onProceed, onCancel }: PreflightModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
        <div className="flex items-start gap-3 p-5 border-b border-slate-200">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Missing Details Before Invoice Generation</h3>
            <p className="text-slate-500 text-sm mt-0.5">
              The following partners are missing contact info that will appear on their invoice.
            </p>
          </div>
          <button onClick={onCancel} className="ml-auto text-slate-400 hover:text-slate-700 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-72 overflow-y-auto">
          {warnings.map((w) => (
            <div key={w.team_id} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="font-medium text-sm text-slate-800">{w.team_name}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Missing: <span className="text-amber-700 font-medium">{w.missing_fields.join(", ")}</span>
              </p>
            </div>
          ))}
        </div>
        <div className="mx-5 mb-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
          Use the <strong>Edit</strong> button on any invoice row to fill missing details after generation.
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onCancel} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
            Cancel — Fill Details First
          </button>
          <button onClick={onProceed} className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 font-medium">
            Proceed Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// PARTIAL PAYMENT MODAL
// =====================================================

interface PartialModalProps {
  invoice: Invoice;
  onClose: () => void;
  onSave: (invoiceId: number, paidAmount: number) => Promise<void>;
}

function PartialPaymentModal({ invoice, onClose, onSave }: PartialModalProps) {
  const [amount, setAmount] = useState(String(invoice.paid_amount || ""));
  const [saving, setSaving] = useState(false);
  const remaining = invoice.total_amount - Number(amount || 0);

  const handleSave = async () => {
    setSaving(true);
    await onSave(invoice.id, Number(amount));
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-semibold text-lg">Partial Payment</h3>
            <p className="text-slate-500 text-sm">{invoice.partner_name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 mb-5">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Total Invoice</span>
            <span className="font-medium">{fmtINR(invoice.total_amount)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount Received (₹)</label>
            <input
              type="number" value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:outline-none"
              min="0" max={invoice.total_amount} step="100"
            />
          </div>
          {Number(amount) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Balance remaining</span>
              <span className={remaining > 0 ? "text-orange-600 font-medium" : "text-green-600 font-medium"}>
                {fmtINR(remaining)}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !amount || Number(amount) <= 0}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</> : "Save Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MAIN PAGE
// =====================================================

export default function Invoices() {
  const [filter, setFilter] = useState<"all" | "paid" | "unpaid" | "partial">("all");
  const { financialYear, setFinancialYear, financialYears } = useFY();
  const [invoices, setInvoices]               = useState<Invoice[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [generating, setGenerating]           = useState(false);
  const [generateMsg, setGenerateMsg]         = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [updatingId, setUpdatingId]           = useState<number | null>(null);
  const [downloadingId, setDownloadingId]     = useState<number | null>(null);
  const [partialModal, setPartialModal]       = useState<Invoice | null>(null);
  const [preflightWarnings, setPreflightWarnings] = useState<PreflightWarning[] | null>(null);
  const [detailsModal, setDetailsModal]       = useState<Invoice | null>(null);

  const fetchInvoices = async (fy = financialYear) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/invoices?financial_year=${encodeURIComponent(fy)}`);
      const data = await r.json();
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(financialYear); }, [financialYear]);

  const filteredInvoices = useMemo(
    () => filter === "all" ? invoices : invoices.filter((i) => i.payment_status === filter),
    [invoices, filter]
  );

  const stats = useMemo(() => {
    const outstanding = invoices.filter(i => i.payment_status !== "paid").reduce((s, i) => s + i.total_amount, 0);
    const paid        = invoices.filter(i => i.payment_status === "paid").reduce((s, i) => s + i.total_amount, 0);
    const partial     = invoices.filter(i => i.payment_status === "partial").reduce((s, i) => s + i.total_amount, 0);
    const overdue     = invoices.filter(i => i.payment_status === "unpaid" && isOverdue(i.due_date)).reduce((s, i) => s + i.total_amount, 0);
    return { outstanding, paid, partial, overdue };
  }, [invoices]);

  const runGenerate = async () => {
    setPreflightWarnings(null);
    setGenerating(true);
    setGenerateMsg(null);
    try {
      const r = await fetch(`${API}/invoices/generate?financial_year=${encodeURIComponent(financialYear)}`, { method: "POST" });
      const data = await r.json();
      if (data.status === "success") {
        const n = data.count ?? data.generated?.length ?? 0;
        setGenerateMsg({ type: "success", text: n > 0 ? `${n} invoice${n !== 1 ? "s" : ""} generated successfully.` : "No new invoices to generate." });
        fetchInvoices(financialYear);
      } else {
        setGenerateMsg({ type: "error", text: "Failed to generate invoices." });
      }
    } catch (e: any) {
      setGenerateMsg({ type: "error", text: e.message || "Server error." });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async () => {
    setGenerateMsg(null);
    try {
      const r = await fetch(`${API}/invoices/preflight?financial_year=${encodeURIComponent(financialYear)}`);
      const data = await r.json();
      if ((data.warnings || []).length > 0) { setPreflightWarnings(data.warnings); return; }
    } catch { /* proceed anyway */ }
    runGenerate();
  };

  const updateStatus = async (invoiceId: number, status: "paid" | "partial" | "unpaid", paidAmount = 0) => {
    setInvoices(prev => prev.map(inv =>
      inv.id === invoiceId
        ? { ...inv, payment_status: status, paid_amount: status === "paid" ? inv.total_amount : status === "unpaid" ? 0 : paidAmount, payment_date: status === "unpaid" ? null : new Date().toISOString() }
        : inv
    ));
    setUpdatingId(invoiceId);
    try {
      const params = new URLSearchParams({ status, paid_amount: String(paidAmount) });
      const r = await fetch(`${API}/invoices/${invoiceId}/payment?${params}`, { method: "PATCH" });
      const data = await r.json();
      if (data.status !== "success") fetchInvoices(financialYear);
    } catch { fetchInvoices(financialYear); }
    finally { setUpdatingId(null); }
  };

  const handleStatusChange = (invoice: Invoice, newStatus: string) => {
    const s = newStatus as "paid" | "partial" | "unpaid";
    if (s === "partial") setPartialModal(invoice);
    else updateStatus(invoice.id, s);
  };

  const handleDownload = async (invoice: Invoice) => {
    setDownloadingId(invoice.id);
    try {
      const r = await fetch(`${API}/invoices/${invoice.id}/download`);
      if (!r.ok) { const err = await r.json().catch(() => ({})); alert(err.detail || "PDF not available."); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { alert("Download failed. Please try again."); }
    finally { setDownloadingId(null); }
  };

  const handleDetailsSaved = (updated: Partial<Invoice>) => {
    setInvoices(prev => prev.map(inv =>
      inv.id === detailsModal?.id ? { ...inv, ...updated } : inv
    ));
  };

  return (
    <div className="p-8">

      {partialModal && (
        <PartialPaymentModal
          invoice={partialModal}
          onClose={() => setPartialModal(null)}
          onSave={async (id, amt) => { await updateStatus(id, "partial", amt); }}
        />
      )}
      {preflightWarnings && (
        <PreflightModal
          warnings={preflightWarnings}
          onCancel={() => setPreflightWarnings(null)}
          onProceed={runGenerate}
        />
      )}
      {detailsModal && (
        <InvoiceDetailsModal
          invoice={detailsModal}
          onClose={() => setDetailsModal(null)}
          onSaved={handleDetailsSaved}
        />
      )}

      {/* HEADER */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-8">
        <div>
          <h1 className="text-3xl mb-2">Invoices & Payments</h1>
          <p className="text-slate-600">Track billing and payment status for all franchise partners</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm"
          >
            {financialYears.length > 0
              ? financialYears.map((y) => <option key={y.id} value={y.label}>FY {y.label}</option>)
              : <option value={financialYear}>FY {financialYear}</option>}
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2 text-sm disabled:opacity-60"
          >
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><FileText className="w-4 h-4" /> Generate Invoices</>}
          </button>
          <button onClick={() => fetchInvoices(financialYear)} className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-500" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {generateMsg && (
        <div className={`mb-6 flex items-start gap-3 p-4 rounded-xl border ${generateMsg.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {generateMsg.type === "success" ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
          <p className="text-sm">{generateMsg.text}</p>
          <button onClick={() => setGenerateMsg(null)} className="ml-auto opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Outstanding",      value: stats.outstanding, color: "text-red-600",    sub: `${invoices.filter(i => i.payment_status !== "paid").length} invoices` },
          { label: "Collected",        value: stats.paid,        color: "text-green-600",  sub: `${invoices.filter(i => i.payment_status === "paid").length} paid` },
          { label: "Partial Payments", value: stats.partial,     color: "text-orange-600", sub: `${invoices.filter(i => i.payment_status === "partial").length} invoices` },
          { label: "Overdue",          value: stats.overdue,     color: "text-red-700",    sub: `${invoices.filter(i => i.payment_status === "unpaid" && isOverdue(i.due_date)).length} overdue` },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <p className="text-slate-600 text-sm">{label}</p>
            </div>
            <p className={`text-2xl font-semibold ${color}`}>{fmtINR(value)}</p>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex gap-2 flex-wrap">
          {(["all", "unpaid", "partial", "paid"] as const).map((f) => {
            const counts = { all: invoices.length, unpaid: invoices.filter(i => i.payment_status === "unpaid").length, partial: invoices.filter(i => i.payment_status === "partial").length, paid: invoices.filter(i => i.payment_status === "paid").length };
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${filter === f ? "bg-purple-100 text-purple-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)} <span className="ml-1.5 text-xs opacity-70">({counts[f]})</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-purple-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Invoice #", "Partner", "Amount (incl. GST)", "Due Date", "Status", "Payment Date", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      {invoices.length === 0 ? `No invoices for FY ${financialYear}. Click "Generate Invoices" to create them.` : `No ${filter} invoices.`}
                    </td>
                  </tr>
                )}
                {filteredInvoices.map((inv) => {
                  const overdue    = inv.payment_status === "unpaid" && isOverdue(inv.due_date);
                  const isUpdating = updatingId === inv.id;
                  const pd         = inv.partner_details || {};
                  const missingDetails = !pd.address || !pd.phone || !pd.gstin;

                  return (
                    <tr
                      key={inv.id}
                      className={`border-b border-slate-100 transition ${overdue ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50"} ${isUpdating ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs font-medium text-slate-700">{inv.invoice_number}</p>
                        <p className="text-xs text-slate-400 mt-0.5 capitalize">{inv.invoice_type}</p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-sm">{inv.partner_name}</p>
                        {inv.notes && (
                          <p className="text-xs text-slate-400 mt-0.5 max-w-[200px] truncate" title={inv.notes}>{inv.notes}</p>
                        )}
                        {missingDetails && (
                          <button
                            onClick={() => setDetailsModal(inv)}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium"
                          >
                            <AlertCircle className="w-3 h-3" /> Fill missing details
                          </button>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-semibold text-sm">{fmtINR(inv.total_amount)}</p>
                        <p className="text-xs text-slate-400">{fmtINR(inv.amount)} + GST {fmtINR(inv.gst_amount)}</p>
                        {inv.payment_status === "partial" && inv.paid_amount > 0 && (
                          <p className="text-xs text-orange-600 font-medium mt-0.5">
                            Received: {fmtINR(inv.paid_amount)} · Balance: {fmtINR(inv.total_amount - inv.paid_amount)}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm">{fmtDate(inv.due_date)}</p>
                        {overdue && <p className="text-xs text-red-600 font-medium">Overdue</p>}
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <StatusBadge status={inv.payment_status} />
                          <select
                            value={inv.payment_status}
                            disabled={isUpdating}
                            onChange={(e) => handleStatusChange(inv, e.target.value)}
                            className="block border border-slate-300 rounded-lg px-2 py-1 text-xs bg-white focus:ring-2 focus:ring-purple-300 focus:outline-none cursor-pointer"
                          >
                            <option value="unpaid">Unpaid</option>
                            <option value="partial">Partial</option>
                            <option value="paid">Paid</option>
                          </select>
                        </div>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-500">{fmtDate(inv.payment_date)}</td>

                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1.5">
                          <button
                            onClick={() => handleDownload(inv)}
                            disabled={downloadingId === inv.id}
                            className="flex items-center gap-1.5 text-purple-600 hover:text-purple-800 text-xs font-medium transition disabled:opacity-50"
                          >
                            {downloadingId === inv.id
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading...</>
                              : <><Download className="w-3.5 h-3.5" /> Download PDF</>}
                          </button>
                          {!inv.pdf_path && <p className="text-xs text-slate-400">Generated on first download</p>}
                          <button
                            onClick={() => setDetailsModal(inv)}
                            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-xs font-medium transition"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
