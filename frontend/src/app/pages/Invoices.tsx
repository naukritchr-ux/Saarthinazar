import { useEffect, useMemo, useState } from "react";
import {
  FileText, Download, CheckCircle, Clock, AlertTriangle,
  RefreshCw, DollarSign, X, Loader2,
} from "lucide-react";
import { useFY } from "../context/FYContext";

const API = "http://127.0.0.1:8000";

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
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
        <CheckCircle className="w-3 h-3" /> Paid
      </span>
    );
  if (status === "partial")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
        <Clock className="w-3 h-3" /> Partial
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
      <AlertTriangle className="w-3 h-3" /> Unpaid
    </span>
  );
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  const now = new Date();
  return d < now && d.toDateString() !== now.toDateString();
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtINR(n: number) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0 });
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
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 mb-5">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Total Invoice</span>
            <span className="font-medium">{fmtINR(invoice.total_amount)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Amount Received (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-300 focus:outline-none"
              min="0"
              max={invoice.total_amount}
              step="100"
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
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
            Cancel
          </button>
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [partialModal, setPartialModal] = useState<Invoice | null>(null);

  const fetchInvoices = async (fy = financialYear) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/invoices/?financial_year=${encodeURIComponent(fy)}`);
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
    const outstanding = invoices.filter((i) => i.payment_status !== "paid").reduce((s, i) => s + i.total_amount, 0);
    const paid        = invoices.filter((i) => i.payment_status === "paid").reduce((s, i) => s + i.total_amount, 0);
    const partial     = invoices.filter((i) => i.payment_status === "partial").reduce((s, i) => s + i.total_amount, 0);
    const overdue     = invoices.filter((i) => i.payment_status === "unpaid" && isOverdue(i.due_date)).reduce((s, i) => s + i.total_amount, 0);
    return { outstanding, paid, partial, overdue };
  }, [invoices]);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateMsg(null);
    try {
      const r = await fetch(
        `${API}/invoices/generate?financial_year=${encodeURIComponent(financialYear)}`,
        { method: "POST" }
      );
      const data = await r.json();
      if (data.status === "success") {
        const n = data.count ?? data.generated?.length ?? 0;
        setGenerateMsg({
          type: "success",
          text: n > 0
            ? `${n} invoice${n !== 1 ? "s" : ""} generated successfully.`
            : "No new invoices to generate — all teams are within limits or already invoiced.",
        });
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

  // Optimistic update — shows change instantly, reverts on failure
  const updateStatus = async (
    invoiceId: number,
    status: "paid" | "partial" | "unpaid",
    paidAmount = 0
  ) => {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoiceId
          ? {
              ...inv,
              payment_status: status,
              paid_amount: status === "paid" ? inv.total_amount : status === "unpaid" ? 0 : paidAmount,
              payment_date: status === "unpaid" ? null : new Date().toISOString(),
            }
          : inv
      )
    );

    setUpdatingId(invoiceId);
    try {
      const params = new URLSearchParams({ status, paid_amount: String(paidAmount) });
      const r = await fetch(`${API}/invoices/${invoiceId}/payment?${params}`, { method: "PATCH" });
      const data = await r.json();
      if (data.status !== "success") fetchInvoices(financialYear); // revert
    } catch {
      fetchInvoices(financialYear); // revert on error
    } finally {
      setUpdatingId(null);
    }
  };

  const handleStatusChange = (invoice: Invoice, newStatus: string) => {
    const s = newStatus as "paid" | "partial" | "unpaid";
    if (s === "partial") {
      setPartialModal(invoice); // open amount modal
    } else {
      updateStatus(invoice.id, s);
    }
  };

  const handleDownload = async (invoice: Invoice) => {
    setDownloadingId(invoice.id);
    try {
      const r = await fetch(`${API}/invoices/${invoice.id}/download`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.detail || "PDF not available.");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed. Please try again.");
    } finally {
      setDownloadingId(null);
    }
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
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
              : <><FileText className="w-4 h-4" /> Generate Invoices</>}
          </button>
          <button
            onClick={() => fetchInvoices(financialYear)}
            className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-500"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {generateMsg && (
        <div className={`mb-6 flex items-start gap-3 p-4 rounded-xl border ${
          generateMsg.type === "success"
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {generateMsg.type === "success"
            ? <CheckCircle className="w-5 h-5 flex-shrink-0" />
            : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
          <p className="text-sm">{generateMsg.text}</p>
          <button onClick={() => setGenerateMsg(null)} className="ml-auto opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
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
            const counts = {
              all: invoices.length,
              unpaid: invoices.filter(i => i.payment_status === "unpaid").length,
              partial: invoices.filter(i => i.payment_status === "partial").length,
              paid: invoices.filter(i => i.payment_status === "paid").length,
            };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  filter === f ? "bg-purple-100 text-purple-700" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span className="ml-1.5 text-xs opacity-70">({counts[f]})</span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Invoice #", "Partner", "Amount (incl. GST)", "Due Date", "Status", "Payment Date", "Actions"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                      {invoices.length === 0
                        ? `No invoices for FY ${financialYear}. Click "Generate Invoices" to create them.`
                        : `No ${filter} invoices.`}
                    </td>
                  </tr>
                )}

                {filteredInvoices.map((inv) => {
                  const overdue = inv.payment_status === "unpaid" && isOverdue(inv.due_date);
                  const isUpdating = updatingId === inv.id;

                  return (
                    <tr
                      key={inv.id}
                      className={`border-b border-slate-100 transition ${
                        overdue ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50"
                      } ${isUpdating ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs font-medium text-slate-700">{inv.invoice_number}</p>
                        <p className="text-xs text-slate-400 mt-0.5 capitalize">{inv.invoice_type}</p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-sm">{inv.partner_name}</p>
                        {inv.notes && (
                          <p className="text-xs text-slate-400 mt-0.5 max-w-[200px] truncate" title={inv.notes}>
                            {inv.notes}
                          </p>
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
                        <button
                          onClick={() => handleDownload(inv)}
                          disabled={downloadingId === inv.id}
                          className="flex items-center gap-1.5 text-purple-600 hover:text-purple-800 text-xs font-medium transition disabled:opacity-50"
                        >
                          {downloadingId === inv.id
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading...</>
                            : <><Download className="w-3.5 h-3.5" /> Download PDF</>}
                        </button>
                        {!inv.pdf_path && (
                          <p className="text-xs text-slate-400 mt-1">Generated on first download</p>
                        )}
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
