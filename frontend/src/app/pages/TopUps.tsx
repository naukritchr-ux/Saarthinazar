import { useState } from 'react';
import { Plus, Clock } from 'lucide-react';

interface TopUpHistory {
  id: string;
  teamName: string;
  cvTopUp: number;
  nvitesTopUp: number;
  jobsTopUp: number;
  amount: number;
  date: string;
  addedBy: string;
}

const mockHistory: TopUpHistory[] = [
  { id: '1', teamName: 'Talent Corner', cvTopUp: 1000, nvitesTopUp: 5000, jobsTopUp: 20, amount: 25000, date: '2026-04-15', addedBy: 'Kajal' },
  { id: '2', teamName: 'Global Recruit', cvTopUp: 500, nvitesTopUp: 0, jobsTopUp: 0, amount: 12500, date: '2026-04-10', addedBy: 'Kajal' },
  { id: '3', teamName: 'HR Solutions', cvTopUp: 0, nvitesTopUp: 2500, jobsTopUp: 10, amount: 8000, date: '2026-03-28', addedBy: 'Rashesh' },
];

const teams = ['Talent Corner', 'HR Solutions', 'Staffing Pro', 'Global Recruit', 'Smart Hire'];

export default function TopUps() {
  const [selectedTeam, setSelectedTeam] = useState('');
  const [cvTopUp, setCvTopUp] = useState('');
  const [nvitesTopUp, setNvitesTopUp] = useState('');
  const [jobsTopUp, setJobsTopUp] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Top-up added successfully!');
    setSelectedTeam('');
    setCvTopUp('');
    setNvitesTopUp('');
    setJobsTopUp('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Top-Ups</h1>
        <p className="text-slate-600">Add additional inventory for teams</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-xl font-medium mb-6 flex items-center gap-2">
            <Plus className="w-5 h-5 text-purple-600" />
            Add Top-Up
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Team</label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white"
                required
              >
                <option value="">Select team...</option>
                {teams.map((team) => (
                  <option key={team} value={team}>{team}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">CV Top-Up</label>
                <input
                  type="number"
                  value={cvTopUp}
                  onChange={(e) => setCvTopUp(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="0"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">NVites Top-Up</label>
                <input
                  type="number"
                  value={nvitesTopUp}
                  onChange={(e) => setNvitesTopUp(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="0"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Jobs Top-Up</label>
                <input
                  type="number"
                  value={jobsTopUp}
                  onChange={(e) => setJobsTopUp(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                placeholder="0"
                min="0"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                required
              />
            </div>

            {selectedTeam && (
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <h3 className="font-medium text-purple-900 mb-3">Current Inventory</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-purple-700">Original CV Limit:</span>
                    <span className="font-medium">3,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-700">Previous Top-Ups:</span>
                    <span className="font-medium">1,000</span>
                  </div>
                  {cvTopUp && (
                    <div className="flex justify-between border-t border-purple-200 pt-2">
                      <span className="text-purple-900 font-medium">New Total:</span>
                      <span className="font-medium text-purple-900">{4000 + parseInt(cvTopUp)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
            >
              Add Top-Up
            </button>
          </form>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-xl font-medium mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-600" />
            Recent Top-Up Activity
          </h2>
          <div className="space-y-3">
            {mockHistory.map((item) => (
              <div key={item.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">{item.teamName}</p>
                    <p className="text-sm text-slate-600">{new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className="text-lg font-medium text-purple-600">₹{item.amount.toLocaleString()}</span>
                </div>
                <div className="flex gap-3 text-sm">
                  {item.cvTopUp > 0 && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                      +{item.cvTopUp.toLocaleString()} CV
                    </span>
                  )}
                  {item.nvitesTopUp > 0 && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                      +{item.nvitesTopUp.toLocaleString()} NVites
                    </span>
                  )}
                  {item.jobsTopUp > 0 && (
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                      +{item.jobsTopUp} Jobs
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">Added by {item.addedBy}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
