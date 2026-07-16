import { useEffect, useState } from 'react';
import { Plus, Clock, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
import { useFY } from '../context/FYContext';

import API from "../services/api";

interface Team {
  id: number;
  name: string;
  cv_limit: number;
  nvites_limit: number;
  jobs_limit: number;
  total_limits?: { cv: number; nvites: number; jobs: number };
}

interface TopUpHistory {
  id: number;
  team_name: string;
  cv_topup: number;
  nvites_topup: number;
  jobs_topup: number;
  amount: number;
  financial_year: string;
  purchase_date: string | null;
  added_by: string;
}

export default function TopUps() {
  const { financialYear, setFinancialYear, financialYears } = useFY();

  // -- Form state --
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [cvTopUp, setCvTopUp] = useState('');
  const [nvitesTopUp, setNvitesTopUp] = useState('');
  const [jobsTopUp, setJobsTopUp] = useState('');
  const [manualAmount, setManualAmount] = useState(false);
  const [manualAmountVal, setManualAmountVal] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // -- History state --
  const [history, setHistory] = useState<TopUpHistory[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // -- Team current limits (for preview) --
  const [teamLimits, setTeamLimits] = useState<{ cv: number; nvites: number; jobs: number } | null>(null);

  // ===================================================
  // Fetch teams from API
  // ===================================================
  useEffect(() => {
    if (!financialYear) return;
    
    setTeamsLoading(true);
    setTeamsError(null);
    
    const token = localStorage.getItem('access_token');
    fetch(`${API}/master-data/teams?financial_year=${encodeURIComponent(financialYear)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to load teams (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setTeams(data);
          setTeamsError(null);
        } else {
          setTeamsError('Invalid team data format');
        }
      })
      .catch((err) => {
        console.error('Error loading teams:', err);
        setTeamsError(err.message || 'Failed to load teams');
      })
      .finally(() => setTeamsLoading(false));
  }, [financialYear]);

  // ===================================================
  // Fetch top-up history filtered by FY
  // ===================================================
  const fetchHistory = () => {
    if (!financialYear) return;
    setHistLoading(true);
    fetch(`${API}/topups/?financial_year=${encodeURIComponent(financialYear)}`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to load history (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setHistory(data);
      })
      .catch((err) => console.error('Error loading history:', err))
      .finally(() => setHistLoading(false));
  };
// ===================================================
// Delete top-up
// ===================================================
const handleDeleteTopup = async (item: TopUpHistory) => {
  const confirmed = window.confirm(
    `Delete this top-up of Rs. ${(item.amount || 0).toLocaleString('en-IN')} for ${item.team_name}? This cannot be undone.`
  );
  if (!confirmed) return;

  setDeletingId(item.id);
  try {
    const res = await fetch(`${API}/topups/${item.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.status === 'success') {
      setHistory((prev) => prev.filter((h) => h.id !== item.id));
    } else {
      setSubmitMsg({ type: 'error', text: '❌ ' + (data.message || 'Failed to delete top-up.') });
    }
  } catch (err: any) {
    setSubmitMsg({ type: 'error', text: '❌ ' + (err.message || 'Server error while deleting.') });
  } finally {
    setDeletingId(null);
  }
};
  useEffect(() => { fetchHistory(); }, [financialYear]);

  // ===================================================
  // Set team limits when team is selected
  // ===================================================
  useEffect(() => {
    if (!selectedTeamId) { setTeamLimits(null); return; }
    const team = teams.find((t) => String(t.id) === selectedTeamId);
    if (!team) return;
    const limits = team.total_limits ?? { cv: team.cv_limit, nvites: team.nvites_limit, jobs: team.jobs_limit };
    setTeamLimits(limits);
  }, [selectedTeamId, teams]);

  // ===================================================
  // Calculated totals
  // ===================================================
  const cv = Number(cvTopUp || 0);
  const nvites = Number(nvitesTopUp || 0);
  const jobs = Number(jobsTopUp || 0);
  const subtotal = cv * 10 + nvites * 0.5 + jobs * 50;
  const gst = subtotal * 0.18;
  const autoTotal = Math.round(subtotal + gst);
  const displayTotal = manualAmount ? Number(manualAmountVal || 0) : autoTotal;

  // ===================================================
  // Submit
  // ===================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const team = teams.find((t) => String(t.id) === selectedTeamId);
      const res = await fetch(`${API}/topups/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: Number(selectedTeamId),
          team_name: team?.name ?? '',
          cv_topup: cv,
          nvites_topup: nvites,
          jobs_topup: jobs,
          amount: displayTotal,
          financial_year: financialYear,
          purchase_date: date,
          added_by: localStorage.getItem('username') || 'Kajal',
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSubmitMsg({ type: 'success', text: `✓ Top-up added! Invoice: ${data.latest_invoice ?? 'N/A'}` });
        setCvTopUp('');
        setNvitesTopUp('');
        setJobsTopUp('');
        setManualAmount(false);
        setManualAmountVal('');
        setDate(new Date().toISOString().split('T')[0]);
        setSelectedTeamId('');
        setTeamLimits(null);
        fetchHistory();
      } else {
        setSubmitMsg({ type: 'error', text: '❌ ' + (data.message || 'Failed to add top-up.') });
      }
    } catch (err: any) {
      setSubmitMsg({ type: 'error', text: '❌ ' + (err.message || 'Server error.') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Top-Ups</h1>
          <p className="text-slate-600">Add additional inventory for teams</p>
        </div>
        <select
          value={financialYear}
          onChange={(e) => setFinancialYear(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-xl bg-white text-sm"
        >
          {financialYears.length > 0
            ? financialYears.map((y) => <option key={y.id} value={y.label}>FY {y.label}</option>)
            : <option value={financialYear}>FY {financialYear}</option>}
        </select>
      </div>

      {submitMsg && (
        <div className={`mb-6 p-4 rounded-xl border text-sm ${
          submitMsg.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {submitMsg.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ADD TOP-UP FORM */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-xl font-medium mb-6 flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-600" />
            Add Top-Up
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Team</label>
              {teamsLoading ? (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Loading teams...
                </div>
              ) : teamsError ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-red-800">{teamsError}</span>
                </div>
              ) : (
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white"
                  required
                >
                  <option value="">Select team...</option>
                  {teams.length > 0 ? (
                    teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  ) : (
                    <option disabled>No teams available for this FY</option>
                  )}
                </select>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CV Top-Up</label>
                <input type="number" value={cvTopUp} onChange={(e) => setCvTopUp(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg" placeholder="0" min="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">NVites Top-Up</label>
                <input type="number" value={nvitesTopUp} onChange={(e) => setNvitesTopUp(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg" placeholder="0" min="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jobs Top-Up</label>
                <input type="number" value={jobsTopUp} onChange={(e) => setJobsTopUp(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg" placeholder="0" min="0" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Amount (Rs.) <span className="text-slate-400 font-normal text-xs">— auto-calculated, edit to override</span></label>
              <input
                type="number"
                value={manualAmount ? manualAmountVal : (autoTotal > 0 ? autoTotal : '')}
                onChange={(e) => { setManualAmount(true); setManualAmountVal(e.target.value); }}
                onFocus={(e) => { if (!manualAmount && autoTotal > 0) { setManualAmount(true); setManualAmountVal(String(autoTotal)); } }}
                className={`w-full px-4 py-2 border rounded-lg ${
                  manualAmount && Number(manualAmountVal) !== autoTotal
                    ? 'border-amber-400 bg-amber-50'
                    : 'border-slate-300'
                }`}
                placeholder="0" min="0" required
              />
              {manualAmount && Number(manualAmountVal) !== autoTotal && autoTotal > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-amber-700">Overriding auto total of Rs. {autoTotal.toLocaleString('en-IN')}</p>
                  <button type="button" onClick={() => { setManualAmount(false); setManualAmountVal(''); }} className="text-xs text-purple-600 hover:underline">Reset to auto</button>
                </div>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
              <div className="flex justify-between mb-2"><span>Subtotal</span><span>Rs. {subtotal.toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between mb-2"><span>GST (18%)</span><span>Rs. {Math.round(gst).toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between font-medium border-t border-slate-200 pt-2">
                <span>Total</span><span>Rs. {autoTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg" required />
            </div>

            {/* Updated Inventory Preview */}
            {selectedTeamId && teamLimits && (
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <h3 className="font-medium text-purple-900 mb-3">Updated Inventory Preview</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">CV Total</span>
                    <span className="font-medium">{(teamLimits.cv + cv).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">NVites Total</span>
                    <span className="font-medium">{(teamLimits.nvites + nvites).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Jobs Total</span>
                    <span className="font-medium">{(teamLimits.jobs + jobs).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedTeamId && !teamLimits && !teamsLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <RefreshCw className="w-4 h-4 animate-spin" /> Loading team limits...
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || teamsLoading || teamsError !== null}
              className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-60"
            >
              {submitting ? 'Adding...' : 'Add Top-Up'}
            </button>
          </form>
        </div>

        {/* HISTORY */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-xl font-medium mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-600" />
            Top-Up History - FY {financialYear}
          </h2>
          {histLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-600" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
              <AlertCircle className="w-5 h-5" /> No top-ups recorded for FY {financialYear}
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">{item.team_name}</p>
                      <p className="text-sm text-slate-600">
                        {item.purchase_date
                          ? new Date(item.purchase_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '-'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-medium text-purple-600">Rs. {(item.amount || 0).toLocaleString('en-IN')}</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteTopup(item)}
                        disabled={deletingId === item.id}
                        className="text-slate-400 hover:text-red-600 transition disabled:opacity-50"
                        title="Delete top-up"
                      >
                        {deletingId === item.id
                          ? <RefreshCw className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 text-sm flex-wrap">
                    {(item.cv_topup || 0) > 0 && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">+{item.cv_topup.toLocaleString()} CV</span>
                    )}
                    {(item.nvites_topup || 0) > 0 && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">+{item.nvites_topup.toLocaleString()} NVites</span>
                    )}
                    {(item.jobs_topup || 0) > 0 && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">+{item.jobs_topup} Jobs</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Added by {item.added_by}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
