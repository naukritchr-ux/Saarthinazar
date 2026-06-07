import { useEffect, useState, useCallback, useRef } from "react";
import {
  Edit2, Save, X, Settings, Plus, RefreshCw,
  ChevronDown, ChevronUp, AlertCircle, Check, Lock, Unlock
} from "lucide-react";
import { useFY } from "../context/FYContext";
import API from "../services/api";

const token = () => localStorage.getItem("token");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

// =====================================================
// TYPES
// =====================================================
interface PricingPlan {
  id: number | string;
  financial_year?: string;
  period: string;
  partner_type: string;
  licence_fee: number;
  cv_limit: number;
  nvites_limit: number;
  jobs_limit: number;
  is_locked: boolean;
  updated_at: string | null;
  isNew?: boolean;
}

interface TeamMaster {
  id: number;
  name: string;
  partner_name: string;
  partner_email: string;
  licences: number;
  partner_type: string;
  join_period: string;
  licence_fee: number;
  cost_share: number;
  is_active: boolean;
  total_limits: { cv: number; nvites: number; jobs: number };
  per_licence_limits: { cv: number; nvites: number; jobs: number };
  updated_at: string | null;
}

interface PreviewLimits {
  found: boolean;
  cv_limit: number;
  nvites_limit: number;
  jobs_limit: number;
  licence_fee: number;
}

// =====================================================
// HELPERS
// =====================================================
function fmt(n: number) { return n.toLocaleString("en-IN"); }
function fmtCurrency(n: number) { return n === 0 ? "FREE" : `₹${n.toLocaleString("en-IN")}`; }

function StatusBadge({ active }: { active: boolean }) {
  return active
    ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Active</span>
    : <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium">Inactive</span>;
}

// =====================================================
// TEAM EDIT MODAL
// =====================================================
interface TeamEditModalProps {
  financialYear: string;
  team: TeamMaster | null;
  pricing: PricingPlan[];
  onClose: () => void;
  onSave: (updated: TeamMaster) => void;
}

function TeamEditModal({ team, pricing, financialYear, onClose, onSave }: TeamEditModalProps) {
  const isNew = !team;
  const [form, setForm] = useState({
    name:            team?.name                  ?? "",
    partner_name:    team?.partner_name          ?? "",
    partner_email:   team?.partner_email         ?? "",
    licences:        team?.licences              ?? 1,
    partner_type:    team?.partner_type          ?? "New Partner",
    join_period:     team?.join_period           ?? "Q1 (Apr-Jun)",
    cost_share:      team?.cost_share            ?? 0,
    is_active:       team?.is_active             ?? true,
    manual_override: false,
    cv_limit:        team?.total_limits.cv       ?? 0,
    nvites_limit:    team?.total_limits.nvites   ?? 0,
    jobs_limit:      team?.total_limits.jobs     ?? 0,
    licence_fee:     team?.licence_fee           ?? 0,
  });
  const [preview, setPreview]               = useState<PreviewLimits | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState("");
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(async (join_period: string, partner_type: string, licences: number) => {
    setLoadingPreview(true);
    try {
      const res = await fetch(
        `${API}/master-data/teams/preview-limits?financial_year=${financialYear}` +
        `&join_period=${encodeURIComponent(join_period)}` +
        `&partner_type=${encodeURIComponent(partner_type)}` +
        `&licences=${licences}`
      );
      const data: PreviewLimits = await res.json();
      setPreview(data);
      if (data.found) {
        setForm(f => ({ ...f, cv_limit: data.cv_limit, nvites_limit: data.nvites_limit, jobs_limit: data.jobs_limit, licence_fee: data.licence_fee }));
      }
    } catch { setPreview(null); }
    finally { setLoadingPreview(false); }
  }, [financialYear]);

  useEffect(() => {
    if (form.manual_override) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => fetchPreview(form.join_period, form.partner_type, form.licences), 300);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [form.join_period, form.partner_type, form.licences, form.manual_override]);

  const periods      = [...new Set(pricing.map(p => p.period))];
  const partnerTypes = [...new Set(pricing.map(p => p.partner_type))];

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Team name is required."); return; }
    setSaving(true); setError("");
    try {
      const url    = isNew ? `${API}/master-data/teams?financial_year=${financialYear}` : `${API}/master-data/teams/${team!.id}`;
      const method = isNew ? "POST" : "PUT";
      const res    = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(form) });
      const data   = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save");
      onSave(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally { setSaving(false); }
  };

  const inp = "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500";
  const lbl = "block text-sm font-medium text-slate-700 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold">{isNew ? "Add New Team" : `Edit — ${team!.name}`}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Team Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                disabled={!isNew} className={inp + (!isNew ? " bg-slate-50 text-slate-500" : "")} />
            </div>
            <div>
              <label className={lbl}>Partner Name</label>
              <input type="text" value={form.partner_name} onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className={lbl}>Partner Email</label>
              <input type="email" value={form.partner_email} onChange={e => setForm(f => ({ ...f, partner_email: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className={lbl}>Licences</label>
              <input type="number" min={1} value={form.licences} onChange={e => setForm(f => ({ ...f, licences: parseInt(e.target.value) || 1 }))} className={inp} />
            </div>
            <div>
              <label className={lbl}>Join Period</label>
              <select value={form.join_period} onChange={e => setForm(f => ({ ...f, join_period: e.target.value }))} className={inp + " bg-white"}>
                {periods.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Partner Type</label>
              <select value={form.partner_type} onChange={e => setForm(f => ({ ...f, partner_type: e.target.value }))} className={inp + " bg-white"}>
                {partnerTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <p className="text-sm font-medium text-purple-900">
                Inventory Limits
                {loadingPreview && <span className="ml-2 text-purple-500 text-xs animate-pulse">Calculating...</span>}
                {!form.manual_override && preview?.found && (
                  <span className="ml-2 text-purple-500 text-xs">
                    Auto-calculated × {form.licences} licence{form.licences > 1 ? "s" : ""}
                  </span>
                )}
              </p>
              <label className="flex items-center gap-2 text-xs text-purple-700 cursor-pointer">
                <input type="checkbox" checked={form.manual_override} onChange={e => setForm(f => ({ ...f, manual_override: e.target.checked }))} className="rounded" />
                Manual override
              </label>
            </div>
            {!form.manual_override && preview && !preview.found && (
              <p className="text-xs text-orange-600 mb-3 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> No pricing plan found for this period + type. Enable manual override.
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              {([["CV Access", "cv_limit"], ["NVites", "nvites_limit"], ["Job Postings", "jobs_limit"]] as const).map(([label, field]) => (
                <div key={field}>
                  <label className="block text-xs text-purple-700 mb-1">{label}</label>
                  <input type="number" value={form[field]} disabled={!form.manual_override}
                    onChange={e => setForm(f => ({ ...f, [field]: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm bg-white disabled:bg-purple-50/50 disabled:text-purple-700 font-medium" />
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-purple-700 mb-1">Licence Fee (₹)</label>
                <input type="number" value={form.licence_fee} disabled={!form.manual_override}
                  onChange={e => setForm(f => ({ ...f, licence_fee: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm bg-white disabled:bg-purple-50/50 disabled:text-purple-700 font-medium" />
              </div>
              <div>
                <label className="block text-xs text-purple-700 mb-1">Cost Share (₹)</label>
                <input type="number" value={form.cost_share} onChange={e => setForm(f => ({ ...f, cost_share: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm bg-white font-medium" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              className={`w-10 h-6 rounded-full transition-colors relative outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${form.is_active ? "bg-green-500" : "bg-slate-300"}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? "translate-x-5" : "translate-x-1"}`} />
            </button>
            <span className="text-sm font-medium text-slate-700">{form.is_active ? "Active" : "Inactive"}</span>
          </div>

          {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 text-sm font-medium">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium flex items-center gap-2 disabled:opacity-60">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// PRICING INLINE EDIT ROW
// =====================================================
interface PricingRowProps {
  item: PricingPlan;
  financialYear: string;
  setPricing: React.Dispatch<React.SetStateAction<PricingPlan[]>>;
  onSave: (updated: PricingPlan) => void;
  onRefreshPricing: () => void;
}

function PricingRow({ item, financialYear, setPricing, onSave, onRefreshPricing }: PricingRowProps) {
  const [editing, setEditing] = useState(item.isNew || false);
  const [form, setForm]       = useState({ ...item });
  const [saving, setSaving]   = useState(false);

  useEffect(() => { setForm({ ...item }); }, [item]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = item.isNew ? "POST" : "PUT";
      const url    = item.isNew ? `${API}/master-data/pricing` : `${API}/master-data/pricing/${item.id}`;
      const res    = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({
          financial_year: financialYear,
          period:         form.period,
          partner_type:   form.partner_type,
          licence_fee:    form.licence_fee,
          cv_limit:       form.cv_limit,
          nvites_limit:   form.nvites_limit,
          jobs_limit:     form.jobs_limit,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to save pricing");
      onSave(data);
      setEditing(false);
      fetch(`${API}/master-data/pricing?financial_year=${financialYear}`, { headers: authHeaders() })
        .then(r => r.json()).then(setPricing);
    } catch (err: any) {
      alert(err.message);
    } finally { setSaving(false); }
  };

  const toggleLock = async () => {
    try {
      const res = await fetch(
        `${API}/master-data/pricing/${item.id}/lock?locked=${!item.is_locked}`,
        { method: "PATCH", headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Failed to change lock state");
      onRefreshPricing();
    } catch (err: any) { alert(err.message || "Failed to toggle lock state."); }
  };

  const numInp = "px-2 py-1 border border-slate-300 rounded text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400";

  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50 transition ${item.is_locked ? "bg-slate-50/50" : ""}`}>
      <td className="px-5 py-3 text-sm font-medium text-slate-700">
        <select value={form.period} disabled={item.is_locked || !editing}
          onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
          className="border rounded px-2 py-1 bg-white disabled:bg-slate-50 disabled:text-slate-500">
          {["Q1 (Apr-Jun)", "Q2 (Jul-Sep)", "Oct-Nov", "December", "January", "February", "March"].map(p => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </td>
      <td className="px-5 py-3 text-sm">
        <select value={form.partner_type} disabled={item.is_locked || !editing}
          onChange={e => setForm(f => ({ ...f, partner_type: e.target.value }))}
          className="border rounded px-2 py-1 bg-white disabled:bg-slate-50 disabled:text-slate-500">
          {["New Partner", "Returning Partner", "Early Renewal", "Late Existing Partner", "All"].map(t => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </td>
      <td className="px-5 py-3 text-sm">
        {editing
          ? <input type="number" value={form.licence_fee} disabled={item.is_locked} className={numInp + " w-28"}
              onChange={e => setForm(f => ({ ...f, licence_fee: parseFloat(e.target.value) || 0 }))} />
          : <span className={`font-medium ${item.is_locked ? "text-slate-500" : ""}`}>{fmtCurrency(item.licence_fee)}</span>}
      </td>
      {(["cv_limit", "nvites_limit", "jobs_limit"] as const).map(key => (
        <td key={key} className={`px-5 py-3 text-sm ${item.is_locked ? "text-slate-500" : ""}`}>
          {editing
            ? <input type="number" value={form[key]} disabled={item.is_locked} className={numInp + " w-24"}
                onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))} />
            : fmt(item[key])}
        </td>
      ))}
      <td className="px-5 py-3 text-sm font-medium text-slate-700">{item.is_locked ? "🔒 Locked" : "🔓 Unlocked"}</td>
      <td className="px-5 py-3 text-xs text-slate-400">
        {item.updated_at ? new Date(item.updated_at).toLocaleDateString("en-IN") : "—"}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-3 justify-end">
          {editing ? (
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving || item.is_locked} className="text-green-600 hover:text-green-700 disabled:opacity-50">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => { setForm({ ...item }); setEditing(false); }} className="text-red-500 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} disabled={item.is_locked} className="text-purple-500 hover:text-purple-700 disabled:opacity-30">
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={toggleLock}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border font-medium transition ${
              item.is_locked
                ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}>
            {item.is_locked ? <><Unlock className="w-3 h-3" /> Unlock</> : <><Lock className="w-3 h-3" /> Lock</>}
          </button>
        </div>
      </td>
    </tr>
  );
}

// =====================================================
// MAIN MASTER DATA PAGE
// =====================================================
export default function MasterData() {
  const { financialYear: contextFY, setFinancialYear: setContextFY, financialYears } = useFY();
  const [financialYear, setFinancialYear] = useState(contextFY || "2025-2026");

  useEffect(() => {
    if (contextFY && contextFY !== financialYear) setFinancialYear(contextFY);
  }, [contextFY]);

  const handleFYChange = (fy: string) => { setFinancialYear(fy); setContextFY(fy); };

  const [pricing, setPricing]       = useState<PricingPlan[]>([]);
  const [teams, setTeams]           = useState<TeamMaster[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [editingTeam, setEditingTeam] = useState<TeamMaster | null | "new">(null);
  const [searchTeam, setSearchTeam] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [sortField, setSortField]   = useState<"name" | "licences" | "join_period">("name");
  const [sortAsc, setSortAsc]       = useState(true);
  const [resyncing, setResyncing]   = useState(false);
  const [resyncMsg, setResyncMsg]   = useState("");

  const fetchPricing = useCallback(async () => {
    try {
      const pRes = await fetch(`${API}/master-data/pricing?financial_year=${financialYear}`, { headers: authHeaders() });
      if (!pRes.ok) throw new Error();
      setPricing(await pRes.json());
    } catch { setError("Failed to reload pricing."); }
  }, [financialYear]);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [pRes, tRes] = await Promise.all([
        fetch(`${API}/master-data/pricing?financial_year=${financialYear}`, { headers: authHeaders() }),
        fetch(`${API}/master-data/teams?financial_year=${financialYear}`, { headers: authHeaders() }),
      ]);
      if (!pRes.ok || !tRes.ok) throw new Error();
      setPricing(await pRes.json());
      setTeams(await tRes.json());
    } catch { setError("Failed to load master data. Is the server running?"); }
    finally { setLoading(false); }
  }, [financialYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleResync = async () => {
    if (resyncing) return;
    if (!confirm(`Re-sync all team limits from pricing plans for FY ${financialYear}?\n\nThis will update CV, NVites, and Job Posting limits for every team based on their current period, type, and licence count.`)) return;
    setResyncing(true); setResyncMsg("");
    try {
      const res  = await fetch(`${API}/master-data/teams/resync?financial_year=${encodeURIComponent(financialYear)}`, { method: "POST", headers: authHeaders() });
      const data = await res.json();
      if (data.status === "success") {
        setResyncMsg(`✅ Synced ${data.updated} team(s).${data.skipped > 0 ? ` ${data.skipped} skipped (no matching plan).` : ""}`);
        await fetchAll();
      } else {
        setResyncMsg("❌ " + (data.detail || "Failed"));
      }
    } catch (e: any) { setResyncMsg("❌ " + (e.message || "Error")); }
    finally { setResyncing(false); setTimeout(() => setResyncMsg(""), 5000); }
  };

  const addEmptyPricingRow = () => {
    setPricing(prev => [...prev, {
      id: `temp-${Date.now()}`, financial_year: financialYear,
      period: "Q1 (Apr-Jun)", partner_type: "New Partner",
      licence_fee: 0, cv_limit: 3000, nvites_limit: 22500, jobs_limit: 100,
      is_locked: false, updated_at: null, isNew: true,
    }]);
  };

  const filtered = teams
    .filter(t => {
      if (!showInactive && !t.is_active) return false;
      const q = searchTeam.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.partner_name.toLowerCase().includes(q) || t.partner_email.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av: any = a[sortField], bv: any = b[sortField];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      return sortAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field
      ? sortAsc ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />
      : null;

  if (loading) return (
    <div className="p-8">
      <div className="bg-white rounded-xl p-10 text-center shadow-sm border border-slate-200">
        <RefreshCw className="w-6 h-6 animate-spin text-purple-600 mx-auto mb-3" />
        <p className="text-slate-600">Loading master data...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <p className="text-red-700">{error}</p>
        <button onClick={fetchAll} className="ml-auto px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">Retry</button>
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-8">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Master Data</h1>
          <p className="text-slate-500 text-sm">Pricing structure and team allocations — Rashesh access only</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Financial Year:</label>
          <select value={financialYear} onChange={e => handleFYChange(e.target.value)}
            className="px-3 py-2 border border-slate-300 bg-white rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500">
            {financialYears.length > 0
              ? financialYears.map(y => <option key={y.id} value={y.label}>FY {y.label}</option>)
              : <option value={financialYear}>FY {financialYear}</option>}
          </select>
          <button onClick={fetchAll} className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 bg-white shadow-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Owner notice */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
        <Settings className="text-purple-600 w-5 h-5 mt-0.5 shrink-0" />
        <p className="text-purple-900 text-sm">
          <strong>Owner Access Only.</strong> Changes to pricing or team limits affect billing across the system.
          All edits are timestamped and audit-logged automatically.
          When you lock a pricing plan, its values cascade to all teams for that period and partner type.
        </p>
      </div>

      {/* No pricing warning */}
      {pricing.length === 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-amber-600 w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-900 font-medium text-sm">No pricing matrix set for FY {financialYear}</p>
            <p className="text-amber-800 text-sm mt-0.5">Click <strong>+ Add Pricing Plan</strong> to define the pricing structure.</p>
          </div>
        </div>
      )}

      {/* ── PRICING MATRIX ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Pricing & Inventory Matrix ({financialYear})</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {pricing.length} plans · Edit unlocked rows · Lock to cascade values to all matching teams
            </p>
          </div>
          <button onClick={addEmptyPricingRow} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
            + Add Pricing Plan
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["Period", "Partner Type", "Price + GST", "CV Access", "NVites", "Job Postings", "Lock Status", "Last Updated", ""].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide last:text-right last:pr-10">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pricing.map(plan => (
                <PricingRow
                  key={plan.id}
                  item={plan}
                  financialYear={financialYear}
                  setPricing={setPricing}
                  onRefreshPricing={fetchPricing}
                  onSave={updated => setPricing(prev => prev.map(p => p.id === updated.id ? updated : p))}
                />
              ))}
              {pricing.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-400 text-sm">No pricing matrices defined for this year.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── TEAM MASTER LIST ── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap gap-3 justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold">Team Master List</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {teams.filter(t => t.is_active).length} active teams · {teams.reduce((s, t) => s + t.licences, 0)} total licences
            </p>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <input type="text" placeholder="Search teams..." value={searchTeam} onChange={e => setSearchTeam(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded text-purple-600 h-4 w-4" />
              Show inactive
            </label>
            <button onClick={handleResync} disabled={resyncing}
              className="flex items-center gap-2 px-4 py-2 border border-amber-400 text-amber-700 bg-amber-50 rounded-lg text-sm font-medium hover:bg-amber-100 disabled:opacity-60 transition"
              title="Re-calculate CV/NVites/Jobs limits for all teams from their pricing plan">
              {resyncing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Syncing...</> : <><RefreshCw className="w-4 h-4" /> Re-sync Limits</>}
            </button>
            <button onClick={() => setEditingTeam("new")}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 shadow-sm">
              <Plus className="w-4 h-4" /> Add Team
            </button>
          </div>
        </div>

        {/* Re-sync result banner */}
        {resyncMsg && (
          <div className={`px-6 py-2.5 text-sm border-b ${resyncMsg.includes("✅") ? "bg-green-50 text-green-800 border-green-100" : "bg-red-50 text-red-800 border-red-100"}`}>
            {resyncMsg}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700" onClick={() => toggleSort("name")}>
                  Team <SortIcon field="name" />
                </th>
                <th className="px-5 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700" onClick={() => toggleSort("licences")}>
                  Licences <SortIcon field="licences" />
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Partner Type</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700" onClick={() => toggleSort("join_period")}>
                  Period <SortIcon field="join_period" />
                </th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">CV / NVites / Jobs</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Licence Fee</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Last Updated</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(team => (
                <tr key={team.id} className={`border-b border-slate-100 hover:bg-slate-50 transition ${!team.is_active ? "opacity-60" : ""}`}>
                  <td className="px-5 py-3">
                    <p className="text-sm font-medium text-slate-900">{team.name}</p>
                    <p className="text-xs text-slate-400">{team.partner_email || "—"}</p>
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-center text-slate-700">{team.licences}</td>
                  <td className="px-5 py-3 text-sm">
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">{team.partner_type}</span>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">{team.join_period}</td>
                  <td className="px-5 py-3 text-sm">
                    <span className="font-medium text-slate-800">{fmt(team.total_limits.cv)}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="font-medium text-slate-800">{fmt(team.total_limits.nvites)}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="font-medium text-slate-800">{team.total_limits.jobs}</span>
                    {team.licences > 1 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fmt(team.per_licence_limits.cv)} / {fmt(team.per_licence_limits.nvites)} / {team.per_licence_limits.jobs} per licence
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm font-medium text-slate-900">{fmtCurrency(team.licence_fee)}</td>
                  <td className="px-5 py-3"><StatusBadge active={team.is_active} /></td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {team.updated_at ? new Date(team.updated_at).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="px-5 py-3 text-right pr-6">
                    <button onClick={() => setEditingTeam(team)} className="text-purple-500 hover:text-purple-700 transition">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-400 text-sm">No teams found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Team Modal */}
      {editingTeam !== null && (
        <TeamEditModal
          team={editingTeam === "new" ? null : editingTeam}
          pricing={pricing}
          financialYear={financialYear}
          onClose={() => setEditingTeam(null)}
          onSave={updated => {
            setTeams(prev => {
              const exists = prev.find(t => t.id === updated.id);
              return exists
                ? prev.map(t => t.id === updated.id ? updated : t)
                : [...prev, updated].sort((a, b) => a.name.localeCompare(b.name));
            });
            setEditingTeam(null);
          }}
        />
      )}
    </div>
  );
}
