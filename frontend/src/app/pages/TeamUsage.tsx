import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, AlertCircle, UserPlus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFY } from "../context/FYContext";

import API from "../services/api";

const _API = API;

// ──────────────────────────────────────────────
// Decode JWT role (no library needed)
// ──────────────────────────────────────────────
function getUserRole(): string {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return (payload.role || "").toLowerCase();
  } catch {
    return "";
  }
}

function getUsername(): string {
  try {
    const token = localStorage.getItem("token");
    if (!token) return "Kajal";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.username || "Kajal";
  } catch {
    return "Kajal";
  }
}

interface SubUser {
  id: number;
  name: string;
  email: string;
  cv_usage: number;
  nvites_usage: number;
  jobs_usage: number;
}

interface Team {
  id: number;
  name: string;
  partner_name: string;
  partner_type: string;
  join_period: string;
  licence_count: number;
  original_limits: { cv: number; nvites: number; jobs: number };
  topups: { cv: number; nvites: number; jobs: number };
  total_limits: { cv: number; nvites: number; jobs: number };
  usage: { cv: number; nvites: number; jobs: number };
  usage_percent: { cv: number; nvites: number; jobs: number };
  status: string;
  outstanding_invoice: number;
  subusers: SubUser[];
}

function getUsageColor(pct: number): string {
  if (pct > 100) return "text-red-900 bg-red-50 border-red-200";
  if (pct >= 90) return "text-red-700 bg-red-50 border-red-200";
  if (pct >= 70) return "text-orange-700 bg-orange-50 border-orange-200";
  return "text-green-700 bg-green-50 border-green-200";
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "Over limit": "bg-red-700 text-white",
    Critical: "bg-red-500 text-white",
    Warning: "bg-orange-500 text-white",
    Safe: "bg-green-500 text-white",
  };
  return (
    <span className={`px-2 py-1 text-xs rounded-full ${map[status] ?? "bg-slate-200 text-slate-700"}`}>
      {status}
    </span>
  );
}

interface AddMemberModal {
  teamId: number;
  teamName: string;
}

export default function TeamUsage() {
  const navigate = useNavigate();
  const { financialYear, setFinancialYear, financialYears } = useFY();

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedTeams, setExpandedTeams] = useState<Set<number>>(new Set());

  // Add Member modal state
  const [addMemberModal, setAddMemberModal] = useState<AddMemberModal | null>(null);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState("");

  const userRole = getUserRole();
  const username = getUsername();
  const canAddMembers = ["operations", "admin", "owner"].includes(userRole);

  // ===================================================
  // FETCH TEAMS scoped to selected financial year
  // ===================================================

  const fetchTeams = async () => {
    if (!financialYear) return;
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API}/dashboard/teams?financial_year=${financialYear}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to fetch teams");
      setTeams(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTeams(); }, [financialYear]);

  const toggleTeam = (id: number) => {
    const next = new Set(expandedTeams);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedTeams(next);
  };

  // ===================================================
  // ADD MEMBER HANDLER
  // ===================================================

  const handleAddMember = async () => {
    if (!addMemberModal) return;
    if (!newMemberEmail.trim() || !newMemberEmail.includes("@")) {
      setAddMemberError("Please enter a valid email address.");
      return;
    }
    setAddMemberLoading(true);
    setAddMemberError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/reports/teams/${addMemberModal.teamId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newMemberName.trim(),
          email: newMemberEmail.trim().toLowerCase(),
          financial_year: financialYear,
          added_by: username,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to add member");
      // Refresh teams and close modal
      await fetchTeams();
      setAddMemberModal(null);
      setNewMemberName("");
      setNewMemberEmail("");
    } catch (err: any) {
      setAddMemberError(err.message || "Something went wrong");
    } finally {
      setAddMemberLoading(false);
    }
  };

  // ===================================================
  // LOADING
  // ===================================================

  if (loading && !teams.length) {
    return (
      <div className="p-8">
        <div className="bg-white rounded-xl p-10 text-center shadow-sm border border-slate-200">
          <p className="text-slate-600">Loading teams...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="p-8">

      {/* ======================================= */}
      {/* HEADER */}
      {/* ======================================= */}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Team Usage</h1>
          <p className="text-slate-600 text-sm">
            {teams.length} team{teams.length !== 1 ? "s" : ""} with data in{" "}
            <strong>FY {financialYear}</strong>
          </p>
        </div>
        <div className="flex gap-3">
          {/* FINANCIAL YEAR DROPDOWN — populated from DB */}
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-xl bg-white text-sm"
          >
            {financialYears.length > 0
              ? financialYears.map((y) => (
                  <option key={y.id} value={y.label}>
                    FY {y.label}
                  </option>
                ))
              : <option value={financialYear}>FY {financialYear}</option>}
          </select>

          <button
            onClick={() => navigate("/topups")}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Top-Up
          </button>
        </div>
      </div>

      {/* ======================================= */}
      {/* EMPTY STATE */}
      {/* ======================================= */}

      {teams.length === 0 && (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-200">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No data for FY {financialYear}</p>
          <p className="text-slate-400 text-sm mt-1">
            Upload ResDex and Job Posting reports for this financial year to see team usage.
          </p>
        </div>
      )}

      {/* ======================================= */}
      {/* TEAMS TABLE */}
      {/* ======================================= */}

      {teams.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 w-8" />
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Team</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Period / Type</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Licences</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">CV Usage</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">NVites Usage</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Jobs Usage</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Outstanding</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const expanded = expandedTeams.has(team.id);
                  return (
                    <React.Fragment key={team.id}>
                      {/* TEAM ROW */}
                      <tr key={`team-${team.id}`} className="border-b border-slate-100 hover:bg-slate-50 transition">
                        <td className="px-6 py-4">
                          <button onClick={() => toggleTeam(team.id)} className="text-slate-400 hover:text-slate-700">
                            {expanded
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-sm">{team.name}</p>
                          <p className="text-xs text-slate-400">{team.partner_name || "—"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs text-slate-600">{team.join_period}</p>
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                            {team.partner_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-center">{team.licence_count}</td>

                        {/* CV */}
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium">
                            {team.usage.cv.toLocaleString()} / {team.total_limits.cv.toLocaleString()}
                          </p>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-xs ${getUsageColor(team.usage_percent.cv)}`}>
                            {team.usage_percent.cv}%
                          </span>
                        </td>

                        {/* NVITES */}
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium">
                            {team.usage.nvites.toLocaleString()} / {team.total_limits.nvites.toLocaleString()}
                          </p>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-xs ${getUsageColor(team.usage_percent.nvites)}`}>
                            {team.usage_percent.nvites}%
                          </span>
                        </td>

                        {/* JOBS */}
                        <td className="px-6 py-4">
                          <p className="text-sm font-medium">
                            {team.usage.jobs} / {team.total_limits.jobs}
                          </p>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-xs ${getUsageColor(team.usage_percent.jobs)}`}>
                            {team.usage_percent.jobs}%
                          </span>
                        </td>

                        <td className="px-6 py-4"><StatusBadge status={team.status} /></td>

                        <td className="px-6 py-4">
                          {team.outstanding_invoice > 0 ? (
                            <span className="text-orange-600 font-medium text-sm">
                              ₹{team.outstanding_invoice.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-green-600 text-sm">—</span>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <button
                            onClick={() => navigate(`/topups?teamId=${team.id}`)}
                            className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition text-xs font-medium flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Top-Up
                          </button>
                        </td>
                      </tr>

                      {/* SUBUSERS EXPANDED */}
                      {expanded && (
                        <tr key={`${team.id}-sub`}>
                          <td colSpan={10} className="px-6 py-4 bg-slate-50">
                            <div className="ml-10">
                              <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                                <AlertCircle className="w-4 h-4 text-purple-600" />
                                Team Members ({team.subusers.length})
                              </h4>
                              {canAddMembers && (
                                <button
                                  onClick={() => {
                                    setAddMemberModal({ teamId: team.id, teamName: team.name });
                                    setNewMemberName("");
                                    setNewMemberEmail("");
                                    setAddMemberError("");
                                  }}
                                  className="mb-3 flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs font-medium transition"
                                >
                                  <UserPlus className="w-3.5 h-3.5" /> Add Member
                                </button>
                              )}
                              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full">
                                  <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                      {["Name", "Email", "CV Usage", "NVites Usage", "Jobs Usage"].map((h) => (
                                        <th key={h} className="px-4 py-3 text-left text-xs text-slate-500 font-medium uppercase tracking-wide">
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {team.subusers.map((user) => (
                                      <tr key={user.id} className="border-b border-slate-100 last:border-0">
                                        <td className="px-4 py-3 text-sm font-medium">{user.name || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-slate-500">{user.email}</td>
                                        <td className="px-4 py-3 text-sm">{user.cv_usage.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-sm">{user.nvites_usage.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-sm">{user.jobs_usage}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>

      {/* ADD MEMBER MODAL */}
      {addMemberModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-medium">Add Team Member</h2>
                <p className="text-xs text-slate-500 mt-0.5">{addMemberModal.teamName} · FY {financialYear}</p>
              </div>
              <button onClick={() => setAddMemberModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {addMemberError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {addMemberError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="e.g. priya.sharma@company.in"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddMember}
                  disabled={addMemberLoading}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {addMemberLoading ? "Adding..." : "Add Member"}
                </button>
                <button
                  onClick={() => setAddMemberModal(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
