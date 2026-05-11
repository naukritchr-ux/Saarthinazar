import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, AlertCircle } from 'lucide-react';

interface SubUser {
  id: string;
  name: string;
  email: string;
  cvUsage: number;
  nvitesUsage: number;
  jobsUsage: number;
}

interface Team {
  id: string;
  name: string;
  licenceCount: number;
  originalLimits: {
    cv: number;
    nvites: number;
    jobs: number;
  };
  topUps: {
    cv: number;
    nvites: number;
    jobs: number;
  };
  usage: {
    cv: number;
    nvites: number;
    jobs: number;
  };
  outstandingInvoice: number;
  subUsers: SubUser[];
}

const mockTeams: Team[] = [
  {
    id: '1',
    name: 'Talent Corner',
    licenceCount: 1,
    originalLimits: { cv: 3000, nvites: 22500, jobs: 100 },
    topUps: { cv: 1000, nvites: 5000, jobs: 20 },
    usage: { cv: 3150, nvites: 18000, jobs: 85 },
    outstandingInvoice: 45000,
    subUsers: [
      { id: '1-1', name: 'Gauri Naik', email: 'gauri.naik@talentcorner.in', cvUsage: 1200, nvitesUsage: 8500, jobsUsage: 35 },
      { id: '1-2', name: 'Priya Sharma', email: 'priya.sharma@talentcorner.in', cvUsage: 950, nvitesUsage: 5200, jobsUsage: 28 },
      { id: '1-3', name: 'Rahul Desai', email: 'rahul.desai@talentcorner.in', cvUsage: 1000, nvitesUsage: 4300, jobsUsage: 22 },
    ],
  },
  {
    id: '2',
    name: 'HR Solutions',
    licenceCount: 1,
    originalLimits: { cv: 3000, nvites: 22500, jobs: 100 },
    topUps: { cv: 0, nvites: 0, jobs: 0 },
    usage: { cv: 2200, nvites: 15000, jobs: 92 },
    outstandingInvoice: 0,
    subUsers: [
      { id: '2-1', name: 'Amit Kumar', email: 'amit.kumar@hrsolutions.in', cvUsage: 1100, nvitesUsage: 7500, jobsUsage: 45 },
      { id: '2-2', name: 'Sneha Patel', email: 'sneha.patel@hrsolutions.in', cvUsage: 1100, nvitesUsage: 7500, jobsUsage: 47 },
    ],
  },
  {
    id: '3',
    name: 'Staffing Pro',
    licenceCount: 2,
    originalLimits: { cv: 6000, nvites: 45000, jobs: 200 },
    topUps: { cv: 0, nvites: 0, jobs: 0 },
    usage: { cv: 1800, nvites: 12000, jobs: 60 },
    outstandingInvoice: 80000,
    subUsers: [
      { id: '3-1', name: 'Vikram Singh', email: 'vikram.singh@staffingpro.in', cvUsage: 900, nvitesUsage: 6000, jobsUsage: 30 },
      { id: '3-2', name: 'Anjali Mehta', email: 'anjali.mehta@staffingpro.in', cvUsage: 900, nvitesUsage: 6000, jobsUsage: 30 },
    ],
  },
  {
    id: '4',
    name: 'Global Recruit',
    licenceCount: 1,
    originalLimits: { cv: 3000, nvites: 22500, jobs: 100 },
    topUps: { cv: 500, nvites: 0, jobs: 0 },
    usage: { cv: 2500, nvites: 22050, jobs: 80 },
    outstandingInvoice: 65000,
    subUsers: [
      { id: '4-1', name: 'Deepak Reddy', email: 'deepak.reddy@globalrecruit.in', cvUsage: 1300, nvitesUsage: 11000, jobsUsage: 40 },
      { id: '4-2', name: 'Kavita Joshi', email: 'kavita.joshi@globalrecruit.in', cvUsage: 1200, nvitesUsage: 11050, jobsUsage: 40 },
    ],
  },
  {
    id: '5',
    name: 'Smart Hire',
    licenceCount: 1,
    originalLimits: { cv: 3000, nvites: 22500, jobs: 100 },
    topUps: { cv: 0, nvites: 0, jobs: 0 },
    usage: { cv: 1500, nvites: 10000, jobs: 55 },
    outstandingInvoice: 55000,
    subUsers: [
      { id: '5-1', name: 'Neha Gupta', email: 'neha.gupta@smarthire.in', cvUsage: 750, nvitesUsage: 5000, jobsUsage: 28 },
      { id: '5-2', name: 'Rohit Verma', email: 'rohit.verma@smarthire.in', cvUsage: 750, nvitesUsage: 5000, jobsUsage: 27 },
    ],
  },
];

function getUsagePercentage(usage: number, limit: number): number {
  return Math.round((usage / limit) * 100);
}

function getUsageColor(percentage: number): string {
  if (percentage > 100) return 'text-red-900 bg-red-50 border-red-200';
  if (percentage > 90) return 'text-red-700 bg-red-50 border-red-200';
  if (percentage > 70) return 'text-orange-700 bg-orange-50 border-orange-200';
  return 'text-green-700 bg-green-50 border-green-200';
}

function getStatusBadge(percentage: number): JSX.Element {
  if (percentage > 100) return <span className="px-2 py-1 bg-red-600 text-white text-xs rounded-full">Exceeded</span>;
  if (percentage > 90) return <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">Critical</span>;
  if (percentage > 70) return <span className="px-2 py-1 bg-orange-500 text-white text-xs rounded-full">Warning</span>;
  return <span className="px-2 py-1 bg-green-500 text-white text-xs rounded-full">Healthy</span>;
}

export default function TeamUsage() {
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const toggleTeam = (teamId: string) => {
    const newExpanded = new Set(expandedTeams);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedTeams(newExpanded);
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Team Usage</h1>
          <p className="text-slate-600">Monitor team-wise consumption and limits</p>
        </div>
        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Top-Up
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm text-slate-600 w-8"></th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Team Name</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Licences</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">CV Limits</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">NVites Limits</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Jobs Limits</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Usage %</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Status</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {mockTeams.map((team) => {
                const totalCvLimit = team.originalLimits.cv + team.topUps.cv;
                const totalNvitesLimit = team.originalLimits.nvites + team.topUps.nvites;
                const totalJobsLimit = team.originalLimits.jobs + team.topUps.jobs;
                const cvPercentage = getUsagePercentage(team.usage.cv, totalCvLimit);
                const isExpanded = expandedTeams.has(team.id);

                return (
                  <>
                    <tr key={team.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleTeam(team.id)}
                          className="text-slate-400 hover:text-slate-700 transition"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-6 py-4 font-medium">{team.name}</td>
                      <td className="px-6 py-4 text-slate-600">{team.licenceCount}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="font-medium">{team.usage.cv.toLocaleString()} / {totalCvLimit.toLocaleString()}</p>
                          {team.topUps.cv > 0 && (
                            <p className="text-xs text-slate-500">
                              {team.originalLimits.cv.toLocaleString()} + {team.topUps.cv.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="font-medium">{team.usage.nvites.toLocaleString()} / {totalNvitesLimit.toLocaleString()}</p>
                          {team.topUps.nvites > 0 && (
                            <p className="text-xs text-slate-500">
                              {team.originalLimits.nvites.toLocaleString()} + {team.topUps.nvites.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p className="font-medium">{team.usage.jobs} / {totalJobsLimit}</p>
                          {team.topUps.jobs > 0 && (
                            <p className="text-xs text-slate-500">
                              {team.originalLimits.jobs} + {team.topUps.jobs}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-block px-3 py-1 rounded-lg border text-sm font-medium ${getUsageColor(cvPercentage)}`}>
                          {cvPercentage}%
                        </div>
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(cvPercentage)}</td>
                      <td className="px-6 py-4">
                        {team.outstandingInvoice > 0 ? (
                          <span className="text-orange-600 font-medium">₹{team.outstandingInvoice.toLocaleString()}</span>
                        ) : (
                          <span className="text-green-600">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${team.id}-details`}>
                        <td colSpan={9} className="px-6 py-4 bg-slate-50">
                          <div className="ml-12">
                            <h4 className="font-medium mb-3 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-purple-600" />
                              Team Members
                            </h4>
                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                              <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs text-slate-600">Name</th>
                                    <th className="px-4 py-3 text-left text-xs text-slate-600">Email</th>
                                    <th className="px-4 py-3 text-left text-xs text-slate-600">CV Usage</th>
                                    <th className="px-4 py-3 text-left text-xs text-slate-600">NVites Usage</th>
                                    <th className="px-4 py-3 text-left text-xs text-slate-600">Jobs Usage</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {team.subUsers.map((user) => (
                                    <tr key={user.id} className="border-b border-slate-100 last:border-0">
                                      <td className="px-4 py-3 text-sm">{user.name}</td>
                                      <td className="px-4 py-3 text-sm text-slate-600">{user.email}</td>
                                      <td className="px-4 py-3 text-sm font-medium">{user.cvUsage.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-sm font-medium">{user.nvitesUsage.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-sm font-medium">{user.jobsUsage}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
