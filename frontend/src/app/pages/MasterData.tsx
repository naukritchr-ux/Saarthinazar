import { useState } from 'react';
import { Edit2, Save, X, Settings } from 'lucide-react';

interface PricingStructure {
  quarter: string;
  partnerType: string;
  price: number;
  cvLimit: number;
  nvitesLimit: number;
  jobsLimit: number;
}

interface TeamMaster {
  id: string;
  name: string;
  licenceCount: number;
  partnerType: string;
  originalLimits: {
    cv: number;
    nvites: number;
    jobs: number;
  };
}

const mockPricing: PricingStructure[] = [
  { quarter: 'Q1 (Apr-Jun)', partnerType: 'Early Renewal', price: 80000, cvLimit: 3000, nvitesLimit: 22500, jobsLimit: 100 },
  { quarter: 'Q1 (Apr-Jun)', partnerType: 'New Partner', price: 80000, cvLimit: 3000, nvitesLimit: 22500, jobsLimit: 100 },
  { quarter: 'Q1 (Apr-Jun)', partnerType: 'Late Existing Partner', price: 84000, cvLimit: 3000, nvitesLimit: 22500, jobsLimit: 100 },
  { quarter: 'Q2 (Jul-Sep)', partnerType: 'New Partner', price: 65000, cvLimit: 3000, nvitesLimit: 22500, jobsLimit: 100 },
  { quarter: 'Q2 (Jul-Sep)', partnerType: 'Returning Partner', price: 70000, cvLimit: 3000, nvitesLimit: 22500, jobsLimit: 100 },
  { quarter: 'Oct-Nov', partnerType: 'New Partner', price: 48000, cvLimit: 2000, nvitesLimit: 11250, jobsLimit: 70 },
  { quarter: 'Oct-Nov', partnerType: 'Returning Partner', price: 52000, cvLimit: 2000, nvitesLimit: 11250, jobsLimit: 70 },
  { quarter: 'December', partnerType: 'All Partners', price: 0, cvLimit: 1000, nvitesLimit: 7500, jobsLimit: 50 },
  { quarter: 'January', partnerType: 'All Partners', price: 15000, cvLimit: 750, nvitesLimit: 5000, jobsLimit: 30 },
  { quarter: 'February', partnerType: 'All Partners', price: 0, cvLimit: 500, nvitesLimit: 2500, jobsLimit: 20 },
  { quarter: 'March', partnerType: 'All Partners', price: 0, cvLimit: 250, nvitesLimit: 2500, jobsLimit: 20 },
];

const mockTeams: TeamMaster[] = [
  { id: '1', name: 'Talent Corner', licenceCount: 1, partnerType: 'Early Renewal', originalLimits: { cv: 3000, nvites: 22500, jobs: 100 } },
  { id: '2', name: 'HR Solutions', licenceCount: 1, partnerType: 'New Partner', originalLimits: { cv: 3000, nvites: 22500, jobs: 100 } },
  { id: '3', name: 'Staffing Pro', licenceCount: 2, partnerType: 'New Partner', originalLimits: { cv: 6000, nvites: 45000, jobs: 200 } },
  { id: '4', name: 'Global Recruit', licenceCount: 1, partnerType: 'Returning Partner', originalLimits: { cv: 3000, nvites: 22500, jobs: 100 } },
  { id: '5', name: 'Smart Hire', licenceCount: 1, partnerType: 'New Partner', originalLimits: { cv: 3000, nvites: 22500, jobs: 100 } },
];

export default function MasterData() {
  const [editingPricing, setEditingPricing] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<string | null>(null);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Master Data</h1>
        <p className="text-slate-600">Manage pricing structures and team allocations</p>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-8 flex items-center gap-3">
        <Settings className="text-purple-600 w-5 h-5" />
        <p className="text-purple-900">
          <strong>Owner Access Only:</strong> Changes to master data will affect billing and limits across the system. All edits are audit logged.
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-medium">Pricing Structure & Inventory</h2>
          <p className="text-sm text-slate-500">Last updated: 01 Apr 2026</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Quarter</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Partner Type</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Price</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">CV Limit</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">NVites Limit</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Jobs Limit</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockPricing.map((item, idx) => {
                const isEditing = editingPricing === `${idx}`;
                return (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-medium">{item.quarter}</td>
                    <td className="px-6 py-4">{item.partnerType}</td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={item.price}
                          className="px-2 py-1 border border-slate-300 rounded w-28"
                        />
                      ) : (
                        <span className="font-medium">₹{item.price.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={item.cvLimit}
                          className="px-2 py-1 border border-slate-300 rounded w-24"
                        />
                      ) : (
                        item.cvLimit.toLocaleString()
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={item.nvitesLimit}
                          className="px-2 py-1 border border-slate-300 rounded w-24"
                        />
                      ) : (
                        item.nvitesLimit.toLocaleString()
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={item.jobsLimit}
                          className="px-2 py-1 border border-slate-300 rounded w-20"
                        />
                      ) : (
                        item.jobsLimit
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingPricing(null)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingPricing(null)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingPricing(`${idx}`)}
                          className="text-purple-600 hover:text-purple-700"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-xl font-medium mb-6">Team Master List</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Team Name</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Licence Count</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Partner Type</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">CV Allocation</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">NVites Allocation</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Jobs Allocation</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mockTeams.map((team) => {
                const isEditing = editingTeam === team.id;
                return (
                  <tr key={team.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-medium">{team.name}</td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={team.licenceCount}
                          className="px-2 py-1 border border-slate-300 rounded w-20"
                        />
                      ) : (
                        team.licenceCount
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <select className="px-2 py-1 border border-slate-300 rounded" defaultValue={team.partnerType}>
                          <option>Early Renewal</option>
                          <option>New Partner</option>
                          <option>Returning Partner</option>
                        </select>
                      ) : (
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                          {team.partnerType}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={team.originalLimits.cv}
                          className="px-2 py-1 border border-slate-300 rounded w-24"
                        />
                      ) : (
                        team.originalLimits.cv.toLocaleString()
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={team.originalLimits.nvites}
                          className="px-2 py-1 border border-slate-300 rounded w-24"
                        />
                      ) : (
                        team.originalLimits.nvites.toLocaleString()
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={team.originalLimits.jobs}
                          className="px-2 py-1 border border-slate-300 rounded w-20"
                        />
                      ) : (
                        team.originalLimits.jobs
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingTeam(null)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingTeam(null)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingTeam(team.id)}
                          className="text-purple-600 hover:text-purple-700"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
