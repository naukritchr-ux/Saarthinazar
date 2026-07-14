import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  FileText, AlertCircle, Search, X, RefreshCw, Zap,
  Download, Pencil, ChevronDown, ChevronUp, CheckCircle,
  Building2, Users, IndianRupee, Clock, CircleCheck,
  TriangleAlert, Banknote, BadgeCheck,
} from "lucide-react";
import { useFY } from "../context/FYContext";
import API from "../services/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InvSummary {
  id: number;
  invoice_number: string;
  pdf_path: string | null;
  payment_status: "unpaid" | "partial" | "paid";
  paid_amount: number;
  total_amount: number;
}

interface InvoiceRow {
  type: string;
  label: string;
  subtotal: number;
  gst: number;
  total: number;
  generated: boolean;
  invoice: InvSummary | null;
}

interface TeamEntry {
  team_id: number;
  team_name: string;
  partner_name: string;
  partner_email: string;
  address: string;
  phone: string;
  gstin: string;
  state_code: string;
  missing_fields: string[];
  invoice_rows: InvoiceRow[];
  has_pending: boolean;
  total_amount: number;
  outstanding: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: string) {
  if (s === "paid") return "bg-emerald-100 text-emerald-700 border border-emerald-200";
  if (s === "partial") return "bg-amber-100 text-amber-700 border border-amber-200";
  return "bg-rose-100 text-rose-700 border border-rose-200";
}

function typeColor(t: string) {
  if (t === "licence_fee") return "bg-sky-100 text-sky-700 border border-sky-200";
  if (t === "overage") return "bg-orange-100 text-orange-700 border border-orange-200";
  if (t === "topup") return "bg-violet-100 text-violet-700 border border-violet-200";
  if (t === "combined") return "bg-indigo-100 text-indigo-700 border border-indigo-200";
  return "bg-slate-100 text-slate-600 border border-slate-200";
}

function fmt(n: number) {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ── Partial amount modal ──────────────────────────────────────────────────────

function PartialModal({ inv, onConfirm, onCancel }: {
  inv: InvSummary;
  onConfirm: (n: number) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(String(inv.paid_amount || ""));
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-slate-800">Partial Payment</h3>
            <p className="text-xs text-slate-500 mt-0.5">Enter amount received</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-xs text-slate-500 mb-1">Invoice</p>
            <p className="text-sm font-mono font-medium text-slate-800">{inv.invoice_number}</p>
            <p className="text-xs text-slate-500 mt-1.5">Total: <span className="font-semibold text-slate-700">{fmt(inv.total_amount)}</span></p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Amount Received (₹)</label>
            <input
              type="number" min={0} max={inv.total_amount} autoFocus value={val}
              onChange={e => setVal(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-400"
            />
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition text-slate-600">Cancel</button>
          <button
            onClick={() => onConfirm(Number(val) || 0)}
            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition"
          >
            Save Partial
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status badge + fixed-position dropdown ────────────────────────────────────
// Renders the dropdown in a FIXED position overlay — never clipped by
// table overflow:hidden, scrollable containers, or card boundaries.

function StatusBadge({ inv, onUpdated }: {
  inv: InvSummary;
  onUpdated: (id: number, status: string, paid: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPartial, setShowPartial] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuH = 120; // approx height of 3 items
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > menuH ? rect.bottom + 6 : rect.top - menuH - 6;
    setPos({ top, left: rect.left });
    setOpen(true);
  };

  const doUpdate = async (status: string, paid: number) => {
    setSaving(true); setOpen(false);
    try {
      const res = await fetch(
        `${API}/invoices/${inv.id}/payment?status=${status}&paid_amount=${paid}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" } }
      );
      const data = await res.json();
      if (data.status === "success") onUpdated(inv.id, data.payment_status, data.paid_amount);
    } catch { /* silent */ } finally { setSaving(false); }
  };

  const pick = (s: string) => {
    setOpen(false);
    if (s === "partial") { setShowPartial(true); return; }
    doUpdate(s, s === "paid" ? inv.total_amount : 0);
  };

  return (
    <>
      <button
        ref={btnRef}
        disabled={saving}
        onClick={openMenu}
        className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize flex items-center gap-1 transition
          ${statusColor(inv.payment_status)} ${saving ? "opacity-50 cursor-wait" : "cursor-pointer hover:brightness-95"}`}
      >
        {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
        {inv.payment_status}
        {!saving && <span className="opacity-40 text-[10px]">▾</span>}
      </button>

      {/* Fixed-position dropdown — always visible over the screen */}
      {open && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[999] w-36 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
            style={{ top: pos.top, left: pos.left }}
          >
            {(["unpaid", "partial", "paid"] as const).map(s => (
              <button
                key={s} onClick={() => pick(s)}
                className={`w-full text-left px-3 py-2.5 text-xs font-medium hover:bg-slate-50 transition flex items-center gap-2
                  ${inv.payment_status === s ? "opacity-40 pointer-events-none" : ""}`}
              >
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor(s)}`}>{s}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {showPartial && (
        <PartialModal
          inv={inv}
          onConfirm={amt => { setShowPartial(false); doUpdate("partial", amt); }}
          onCancel={() => setShowPartial(false)}
        />
      )}
    </>
  );
}

// ── Edit contact modal ────────────────────────────────────────────────────────

function EditContactModal({ team, onSaved, onClose }: {
  team: TeamEntry;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    partner_name: team.partner_name,
    partner_email: team.partner_email,
    phone: team.phone,
    address: team.address,
    gstin: team.gstin,
    state_code: team.state_code,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const res = await fetch(`${API}/invoices/teams/${team.team_id}/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.status === "success") { onSaved(); onClose(); }
      else setErr(data.detail || "Failed to save");
    } catch (e: any) { setErr(e.message || "Error"); }
    finally { setSaving(false); }
  };

  const field = (label: string, key: keyof typeof form, placeholder = "") => (
    <div>
      <label className="text-xs font-semibold text-slate-600 block mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-400 bg-slate-50 focus:bg-white transition"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-slate-800">Edit Contact — <span className="text-violet-600">{team.team_name}</span></h3>
            <p className="text-xs text-slate-500 mt-0.5">Details printed on invoice PDF</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {field("Contact Name", "partner_name", "e.g. Rahul Sharma")}
          {field("Email", "partner_email", "e.g. rahul@company.in")}
          {field("Phone", "phone", "e.g. 9876543210")}
          {field("GSTIN / UIN", "gstin", "e.g. 27AABCT1332L1ZT")}
          {field("State Code", "state_code", "e.g. 27")}
          {field("Address", "address", "Full billing address")}
          {err && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200">{err}</p>}
        </div>
        <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-xl text-sm hover:bg-slate-50 transition text-slate-600">Cancel</button>
          <button
            onClick={save} disabled={saving}
            className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:bg-slate-300 flex items-center gap-2 transition"
          >
            {saving && <RefreshCw className="w-3 h-3 animate-spin" />} Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({
  team,
  isOpen,
  isGenerating,
  generatingAll,
  financialYear,
  onToggle,
  onGenerate,
  onEdit,
  onInvUpdated,
}: {
  team: TeamEntry;
  isOpen: boolean;
  isGenerating: boolean;
  generatingAll: boolean;
  financialYear: string;
  onToggle: () => void;
  onGenerate: () => void;
  onEdit: () => void;
  onInvUpdated: (teamId: number, invId: number, status: string, paid: number) => void;
}) {
  const pendingRows = team.invoice_rows.filter(r => !r.generated);
  const generatedRows = team.invoice_rows.filter(r => r.generated && r.invoice);
  const hasMissing = team.missing_fields.length > 0;
  const allPaid = generatedRows.length > 0 && generatedRows.every(r => r.invoice?.payment_status === "paid");

  const accentClass = team.has_pending
    ? "border-l-4 border-l-amber-400"
    : team.outstanding > 0
      ? "border-l-4 border-l-rose-400"
      : allPaid
        ? "border-l-4 border-l-emerald-400"
        : "border-l-4 border-l-slate-200";

  const cardBg = team.has_pending
    ? "bg-amber-50/40"
    : team.outstanding > 0
      ? "bg-rose-50/20"
      : "bg-white";

  return (
    <div className={`rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${accentClass} ${cardBg} transition-all`}>

      {/* ── Header row ── */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-white/70 transition"
        onClick={onToggle}
      >
        <div className="text-slate-400 flex-shrink-0">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>

        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
          ${team.has_pending ? "bg-amber-100" : team.outstanding > 0 ? "bg-rose-100" : "bg-slate-100"}`}>
          <Building2 className={`w-4 h-4 ${team.has_pending ? "text-amber-600" : team.outstanding > 0 ? "text-rose-500" : "text-slate-400"}`} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-slate-800 truncate">{team.team_name}</p>
          {team.partner_name && (
            <p className="text-xs text-slate-500 truncate">{team.partner_name}</p>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
          <span className="px-2 py-0.5 bg-slate-100 rounded-full">
            {team.invoice_rows.filter(r => r.generated).length} invoice{team.invoice_rows.filter(r => r.generated).length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {team.has_pending && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {pendingRows.length} pending
            </span>
          )}
          {team.outstanding > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
              {fmt(team.outstanding)} due
            </span>
          )}
          {!team.has_pending && team.outstanding === 0 && generatedRows.length > 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <CircleCheck className="w-3 h-3" /> Clear
            </span>
          )}
          {team.invoice_rows.length === 0 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
              No billables
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-white hover:border-slate-300 transition text-slate-600"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          {team.has_pending && (
            <button
              onClick={onGenerate}
              disabled={isGenerating || generatingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition
                bg-violet-600 hover:bg-violet-700 text-white
                disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed shadow-sm"
            >
              {isGenerating
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Generating…</>
                : <><Zap className="w-3 h-3" /> Generate</>
              }
            </button>
          )}
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {isOpen && (
        <div className="border-t border-slate-100">

          {/* Missing fields banner */}
          {hasMissing && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-800">
              <TriangleAlert className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
              <span>Missing contact info for PDF: <strong>{team.missing_fields.join(", ")}</strong></span>
              <button
                onClick={onEdit}
                className="ml-auto px-2.5 py-1 bg-amber-500 text-white rounded-lg text-xs font-semibold hover:bg-amber-600 transition"
              >
                Fill Details
              </button>
            </div>
          )}

          <div className="bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Type", "Invoice #", "Amount", "Paid", "Outstanding", "Status", ""].map(h => (
                    <th key={h} className={`px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide ${h === "" || h === "Invoice #" || h === "Type" || h === "Status" ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Generated invoice rows */}
                {generatedRows.map((row, idx) => {
                  const inv = row.invoice!;
                  const total = inv.total_amount || row.total;
                  const outs = Math.max(0, total - (inv.paid_amount || 0));
                  return (
                    <tr key={idx} className="border-t border-slate-50 hover:bg-slate-50/60 transition">
                      <td className="px-5 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${typeColor(row.type)}`}>
                          {row.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500 font-mono">{inv.invoice_number}</td>
                      <td className="px-5 py-3 text-right text-sm font-semibold text-slate-700">{fmt(total)}</td>
                      <td className="px-5 py-3 text-right text-sm text-emerald-600 font-medium">{fmt(inv.paid_amount || 0)}</td>
                      <td className="px-5 py-3 text-right text-sm">
                        <span className={outs > 0 ? "text-rose-600 font-semibold" : "text-slate-300"}>{fmt(outs)}</span>
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge
                          inv={inv}
                          onUpdated={(id, st, pd) => onInvUpdated(team.team_id, id, st, pd)}
                        />
                      </td>
                      <td className="px-5 py-3">
                        {inv.pdf_path && (
                          <a
                            href={`${API}/invoices/${inv.id}/download`}
                            target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition font-medium"
                          >
                            <Download className="w-3 h-3" /> PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Pending (not yet generated) rows */}
                {pendingRows.map((row, idx) => (
                  <tr key={`p-${idx}`} className="border-t border-amber-100 bg-amber-50/50">
                    <td className="px-5 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${typeColor(row.type)}`}>
                        {row.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-amber-500 italic flex items-center gap-1 pt-3.5">
                      <Clock className="w-3 h-3" /> Not generated yet
                    </td>
                    <td className="px-5 py-3 text-right text-sm text-amber-700 font-semibold">{fmt(row.total)}</td>
                    <td className="px-5 py-3 text-right text-sm text-slate-300">—</td>
                    <td className="px-5 py-3 text-right text-sm text-slate-300">—</td>
                    <td className="px-5 py-3">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                        Pending
                      </span>
                    </td>
                    <td className="px-5 py-3" />
                  </tr>
                ))}

                {team.invoice_rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-6 text-center text-xs text-slate-400">
                      No billable items for this team in FY {financialYear}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Invoices() {
  const { financialYear, setFinancialYear, financialYears } = useFY();

  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "unpaid" | "partial" | "paid">("all");

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [generatingTeam, setGeneratingTeam] = useState<number | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [genMsg, setGenMsg] = useState("");

  const [editingTeam, setEditingTeam] = useState<TeamEntry | null>(null);

  // Missing-fields confirmation before generating
  const [pendingGenTeam, setPendingGenTeam] = useState<TeamEntry | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchTeams = useCallback(() => {
    if (!financialYear) return;
    setLoading(true); setError("");
    fetch(`${API}/invoices/preflight?financial_year=${encodeURIComponent(financialYear)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const list: TeamEntry[] = Array.isArray(data.teams_preview) ? data.teams_preview : [];
        setTeams(list);
        // Auto-expand teams with pending invoices
        setExpanded(new Set(list.filter(t => t.has_pending).map(t => t.team_id)));
      })
      .catch(e => setError(e.message || "Failed to load teams"))
      .finally(() => setLoading(false));
  }, [financialYear]);

  useEffect(() => { fetchTeams(); }, [fetchTeams]);

  // ── Optimistic invoice update ────────────────────────────────────────────
  const handleInvUpdated = (teamId: number, invId: number, newStatus: string, newPaid: number) => {
    setTeams(prev => prev.map(t => {
      if (t.team_id !== teamId) return t;
      const rows = t.invoice_rows.map(r => {
        if (!r.invoice || r.invoice.id !== invId) return r;
        return { ...r, invoice: { ...r.invoice, payment_status: newStatus as any, paid_amount: newPaid } };
      });
      const outstanding = rows
        .filter(r => r.generated && r.invoice && r.invoice.payment_status !== "paid")
        .reduce((s, r) => s + Math.max(0, (r.invoice!.total_amount || r.total) - (r.invoice!.paid_amount || 0)), 0);
      return { ...t, invoice_rows: rows, outstanding };
    }));
  };

  // ── Generate single team ─────────────────────────────────────────────────
  // Called after user confirms (or there are no missing fields)
  const doGenerateTeam = async (team: TeamEntry) => {
    if (generatingTeam !== null || generatingAll) return;
    setGeneratingTeam(team.team_id);
    try {
      const res = await fetch(
        `${API}/invoices/generate/${team.team_id}?financial_year=${encodeURIComponent(financialYear)}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.status === "success") fetchTeams();
    } catch { /* silent */ }
    finally { setGeneratingTeam(null); }
  };

  // Called when user clicks Generate — shows warning prompt if details are missing
  const generateTeam = (team: TeamEntry) => {
    if (team.missing_fields.length > 0) {
      setPendingGenTeam(team);
    } else {
      doGenerateTeam(team);
    }
  };

  // ── Generate all ─────────────────────────────────────────────────────────
  const generateAll = async () => {
    if (generatingAll || generatingTeam !== null) return;
    setGeneratingAll(true);
    setGenMsg("Generating all invoices…");
    try {
      const res = await fetch(
        `${API}/invoices/generate?financial_year=${encodeURIComponent(financialYear)}`,
        { method: "POST" }
      );
      const data = await res.json();
      const count = data.count ?? 0;
      setGenMsg(count > 0 ? `✅ Generated ${count} invoice(s).` : "✅ All invoices already up to date.");
      fetchTeams();
      setTimeout(() => setGenMsg(""), 3500);
    } catch (e: any) {
      setGenMsg("❌ " + (e.message || "Error"));
    } finally { setGeneratingAll(false); }
  };

  const toggle = (id: number) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // ── Derived stats ────────────────────────────────────────────────────────
  // pendingCount is based on all teams (not just filtered)
  const pendingCount = teams.filter(t => t.has_pending).length;

  const stats = teams.reduce((acc, t) => {
    t.invoice_rows.forEach(r => {
      if (!r.generated || !r.invoice) return;
      const total = r.invoice.total_amount || r.total;
      const paid = r.invoice.paid_amount || 0;
      acc.total += total;
      acc.paid += paid;
      acc.outstanding += Math.max(0, total - paid);
      if (r.invoice.payment_status === "unpaid") acc.unpaid++;
      if (r.invoice.payment_status === "partial") acc.partial++;
      if (r.invoice.payment_status === "paid") acc.paidCount++;
    });
    return acc;
  }, { total: 0, paid: 0, outstanding: 0, unpaid: 0, partial: 0, paidCount: 0 });

  const baseList = teams.filter(t => t.invoice_rows.length > 0);

  const filtered = baseList.filter(t => {
    const q = search.toLowerCase();
    if (q && !t.team_name.toLowerCase().includes(q) && !t.partner_name.toLowerCase().includes(q)) return false;
    if (filter === "pending") return t.has_pending;
    if (filter === "unpaid") return t.invoice_rows.some(r => r.invoice?.payment_status === "unpaid");
    if (filter === "partial") return t.invoice_rows.some(r => r.invoice?.payment_status === "partial");
    if (filter === "paid") return t.invoice_rows.length > 0 && t.invoice_rows.every(r => !r.generated || r.invoice?.payment_status === "paid");
    return true;
  });

  return (
    <div className="p-6 lg:p-8 min-h-screen bg-slate-50/50">

      {/* ── HEADER ── */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Invoices & Payments</h1>
          <p className="text-slate-500 text-sm mt-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {teams.length} team{teams.length !== 1 ? "s" : ""}</span>
            <span className="text-slate-300">·</span>
            <span>FY {financialYear}</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold border border-amber-200">
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={financialYear} onChange={e => setFinancialYear(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-xl bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {financialYears.length > 0
              ? financialYears.map(y => <option key={y.id} value={y.label}>FY {y.label}</option>)
              : <option value={financialYear}>FY {financialYear}</option>}
          </select>
          <button
            onClick={generateAll}
            disabled={generatingAll || pendingCount === 0}
            className="px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold transition shadow-sm
              bg-violet-600 hover:bg-violet-700 text-white
              disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {generatingAll
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
              : pendingCount === 0
                ? <><CheckCircle className="w-4 h-4" /> All Generated</>
                : <><Zap className="w-4 h-4" /> Generate All ({pendingCount})</>
            }
          </button>
        </div>
      </div>

      {/* ── ALERTS ── */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-5 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
          <p className="text-rose-800 text-sm flex-1">{error}</p>
          <button onClick={() => setError("")} className="p-1 rounded hover:bg-rose-100 transition"><X className="w-4 h-4 text-rose-400" /></button>
        </div>
      )}
      {genMsg && (
        <div className={`p-3.5 rounded-xl text-sm border mb-5 ${genMsg.includes("✅") ? "bg-emerald-50 text-emerald-800 border-emerald-200"
          : genMsg.includes("Generating") ? "bg-violet-50 text-violet-800 border-violet-200"
            : "bg-rose-50 text-rose-800 border-rose-200"}`}>
          {genMsg}
        </div>
      )}

      {/* ── KPI CARDS ── */}
      {!loading && teams.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Invoiced", value: fmt(stats.total), icon: IndianRupee, color: "text-slate-700", bg: "bg-slate-100" },
            { label: "Amount Paid", value: fmt(stats.paid), icon: BadgeCheck, color: "text-emerald-700", bg: "bg-emerald-100" },
            { label: "Outstanding", value: fmt(stats.outstanding), icon: Banknote, color: "text-rose-700", bg: "bg-rose-100" },
            { label: "Unpaid Invoices", value: String(stats.unpaid), icon: AlertCircle, color: "text-amber-700", bg: "bg-amber-100" },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}`}>
                <c.icon className={`w-5 h-5 ${c.color}`} />
              </div>
              <div>
                <p className="text-slate-500 text-xs font-medium">{c.label}</p>
                <p className={`text-xl font-bold mt-0.5 ${c.color}`}>{c.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TOOLBAR ── */}
      {!loading && teams.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search team or partner…"
              className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-sm w-56 focus:outline-none focus:ring-2 focus:ring-violet-500 shadow-sm"
            />
          </div>
          <div className="flex gap-1.5">
            {(["all", "pending", "unpaid", "partial", "paid"] as const).map(s => (
              <button
                key={s} onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition capitalize ${filter === s
                  ? s === "pending" ? "bg-amber-500 text-white border-amber-500"
                    : s === "unpaid" ? "bg-rose-600 text-white border-rose-600"
                      : s === "partial" ? "bg-orange-500 text-white border-orange-500"
                        : s === "paid" ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setExpanded(new Set(filtered.map(t => t.team_id)))}
              className="text-xs text-violet-600 hover:underline"
            >
              Expand all
            </button>
            <span className="text-slate-300">|</span>
            <button onClick={() => setExpanded(new Set())} className="text-xs text-slate-500 hover:underline">
              Collapse all
            </button>
          </div>
        </div>
      )}

      {/* ── LOADING ── */}
      {loading && (
        <div className="bg-white rounded-2xl p-16 text-center border border-slate-200 shadow-sm">
          <RefreshCw className="w-6 h-6 animate-spin text-violet-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading invoices…</p>
        </div>
      )}

      {/* ── EMPTY — nothing needs attention ── */}
      {!loading && teams.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-16 text-center shadow-sm">
          <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
          <p className="text-emerald-800 font-semibold">Invoice queue is clear!</p>
          <p className="text-emerald-700 text-sm mt-1">
            All teams for FY {financialYear} are up to date — no pending invoices or outstanding payments.
          </p>
        </div>
      )}

      {/* ── NO FILTER RESULTS ── */}
      {!loading && teams.length > 0 && filtered.length === 0 && (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm">
          <Search className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No teams match your search or filter.</p>
          <button onClick={() => { setSearch(""); setFilter("all"); }} className="mt-3 text-xs text-violet-600 hover:underline">
            Clear filters
          </button>
        </div>
      )}

      {/* ── TEAM CARDS ── */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span>{" "}
              team{filtered.length !== 1 ? "s" : ""}
            </p>
          </div>

          {filtered.map(team => (
            <TeamCard
              key={team.team_id}
              team={team}
              isOpen={expanded.has(team.team_id)}
              isGenerating={generatingTeam === team.team_id}
              generatingAll={generatingAll}
              financialYear={financialYear}
              onToggle={() => toggle(team.team_id)}
              onGenerate={() => generateTeam(team)}
              onEdit={() => setEditingTeam(team)}
              onInvUpdated={handleInvUpdated}
            />
          ))}
        </div>
      )}

      {/* ── EDIT CONTACT MODAL ── */}
      {editingTeam && (
        <EditContactModal
          team={editingTeam}
          onSaved={() => { fetchTeams(); setEditingTeam(null); }}
          onClose={() => setEditingTeam(null)}
        />
      )}

      {/* ── MISSING FIELDS CONFIRMATION MODAL ── */}
      {pendingGenTeam && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-slate-800">Missing Invoice Details</h3>
                <p className="text-xs text-slate-500 mt-0.5">{pendingGenTeam.team_name}</p>
              </div>
              <button onClick={() => setPendingGenTeam(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <TriangleAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-900">The following details are missing:</p>
                  <ul className="mt-1.5 space-y-1">
                    {pendingGenTeam.missing_fields.map(f => (
                      <li key={f} className="text-sm text-amber-800 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-700 mt-2">These fields appear on the invoice PDF. Missing info may result in an incomplete document.</p>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={() => { setPendingGenTeam(null); setEditingTeam(pendingGenTeam); }}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition flex items-center gap-2"
              >
                <Pencil className="w-3.5 h-3.5" /> Fill Details First
              </button>
              <button
                onClick={() => { const t = pendingGenTeam; setPendingGenTeam(null); doGenerateTeam(t); }}
                className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition flex items-center gap-2"
              >
                <Zap className="w-3.5 h-3.5" /> Generate Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
