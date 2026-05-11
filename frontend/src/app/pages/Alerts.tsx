import { useState } from 'react';
import { Send, MessageSquare, Mail, X } from 'lucide-react';

interface Alert {
  id: string;
  teamName: string;
  type: 'warning' | 'critical' | 'exceeded';
  cvUsage: number;
  cvLimit: number;
  nvitesUsage: number;
  nvitesLimit: number;
  jobsUsage: number;
  jobsLimit: number;
  overage: number;
  members: { name: string; email: string; cvUsage: number; nvitesUsage: number; jobsUsage: number }[];
}

const mockAlerts: Alert[] = [
  {
    id: '1',
    teamName: 'Talent Corner',
    type: 'exceeded',
    cvUsage: 3150,
    cvLimit: 4000,
    nvitesUsage: 18000,
    nvitesLimit: 27500,
    jobsUsage: 85,
    jobsLimit: 120,
    overage: 150,
    members: [
      { name: 'Gauri Naik', email: 'gauri.naik@talentcorner.in', cvUsage: 1200, nvitesUsage: 8500, jobsUsage: 35 },
      { name: 'Priya Sharma', email: 'priya.sharma@talentcorner.in', cvUsage: 950, nvitesUsage: 5200, jobsUsage: 28 },
      { name: 'Rahul Desai', email: 'rahul.desai@talentcorner.in', cvUsage: 1000, nvitesUsage: 4300, jobsUsage: 22 },
    ],
  },
  {
    id: '2',
    teamName: 'Global Recruit',
    type: 'critical',
    cvUsage: 2500,
    cvLimit: 3500,
    nvitesUsage: 22050,
    nvitesLimit: 22500,
    jobsUsage: 80,
    jobsLimit: 100,
    overage: 0,
    members: [
      { name: 'Deepak Reddy', email: 'deepak.reddy@globalrecruit.in', cvUsage: 1300, nvitesUsage: 11000, jobsUsage: 40 },
      { name: 'Kavita Joshi', email: 'kavita.joshi@globalrecruit.in', cvUsage: 1200, nvitesUsage: 11050, jobsUsage: 40 },
    ],
  },
  {
    id: '3',
    teamName: 'HR Solutions',
    type: 'warning',
    cvUsage: 2200,
    cvLimit: 3000,
    nvitesUsage: 15000,
    nvitesLimit: 22500,
    jobsUsage: 92,
    jobsLimit: 100,
    overage: 0,
    members: [
      { name: 'Amit Kumar', email: 'amit.kumar@hrsolutions.in', cvUsage: 1100, nvitesUsage: 7500, jobsUsage: 45 },
      { name: 'Sneha Patel', email: 'sneha.patel@hrsolutions.in', cvUsage: 1100, nvitesUsage: 7500, jobsUsage: 47 },
    ],
  },
];

export default function Alerts() {
  const [previewAlert, setPreviewAlert] = useState<Alert | null>(null);

  const getAlertColor = (type: string) => {
    if (type === 'exceeded') return 'border-red-200 bg-red-50';
    if (type === 'critical') return 'border-red-200 bg-red-50';
    return 'border-orange-200 bg-orange-50';
  };

  const getAlertBadge = (type: string) => {
    if (type === 'exceeded') return <span className="px-2 py-1 bg-red-600 text-white text-xs rounded-full">Exceeded</span>;
    if (type === 'critical') return <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">Critical</span>;
    return <span className="px-2 py-1 bg-orange-500 text-white text-xs rounded-full">Warning</span>;
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Alerts</h1>
          <p className="text-slate-600">Manage and send usage notifications</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Teams Exceeding Limits</p>
          <p className="text-3xl font-medium text-red-600">1</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Critical Alerts (90%+)</p>
          <p className="text-3xl font-medium text-orange-600">2</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Alerts Sent This Week</p>
          <p className="text-3xl font-medium text-purple-600">5</p>
        </div>
      </div>

      <div className="space-y-4">
        {mockAlerts.map((alert) => (
          <div key={alert.id} className={`rounded-xl p-6 border ${getAlertColor(alert.type)}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-medium">{alert.teamName}</h3>
                  {getAlertBadge(alert.type)}
                </div>
                <p className="text-sm text-slate-600">
                  {alert.type === 'exceeded' && `Exceeded CV limit by ${alert.overage} downloads`}
                  {alert.type === 'critical' && 'Approaching usage limits'}
                  {alert.type === 'warning' && 'High usage detected'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewAlert(alert)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition text-sm"
                >
                  Preview
                </button>
                <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2 text-sm">
                  <Send className="w-4 h-4" />
                  Send Alert
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-600 mb-1">CV Usage</p>
                <p className="font-medium">{alert.cvUsage.toLocaleString()} / {alert.cvLimit.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">{Math.round((alert.cvUsage / alert.cvLimit) * 100)}%</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-600 mb-1">NVites Usage</p>
                <p className="font-medium">{alert.nvitesUsage.toLocaleString()} / {alert.nvitesLimit.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">{Math.round((alert.nvitesUsage / alert.nvitesLimit) * 100)}%</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-600 mb-1">Jobs Usage</p>
                <p className="font-medium">{alert.jobsUsage} / {alert.jobsLimit}</p>
                <p className="text-xs text-slate-500 mt-1">{Math.round((alert.jobsUsage / alert.jobsLimit) * 100)}%</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {previewAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-xl font-medium">Alert Preview</h2>
              <button onClick={() => setPreviewAlert(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex gap-4 mb-6">
                <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                  <MessageSquare className="w-4 h-4" />
                  WhatsApp
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                  <Mail className="w-4 h-4" />
                  Email
                </button>
              </div>

              <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                <h3 className="font-medium text-lg mb-4">Usage Alert: {previewAlert.teamName}</h3>
                <p className="text-sm text-slate-700 mb-4">
                  Dear Team,
                </p>
                <p className="text-sm text-slate-700 mb-4">
                  This is to inform you about your current usage status for the Naukri platform:
                </p>

                <div className="bg-white rounded-lg p-4 mb-4 border border-slate-200">
                  <h4 className="font-medium mb-3">Usage Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">CV Downloads:</span>
                      <span className="font-medium">{previewAlert.cvUsage.toLocaleString()} / {previewAlert.cvLimit.toLocaleString()} ({Math.round((previewAlert.cvUsage / previewAlert.cvLimit) * 100)}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">NVites:</span>
                      <span className="font-medium">{previewAlert.nvitesUsage.toLocaleString()} / {previewAlert.nvitesLimit.toLocaleString()} ({Math.round((previewAlert.nvitesUsage / previewAlert.nvitesLimit) * 100)}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Job Postings:</span>
                      <span className="font-medium">{previewAlert.jobsUsage} / {previewAlert.jobsLimit} ({Math.round((previewAlert.jobsUsage / previewAlert.jobsLimit) * 100)}%)</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 mb-4 border border-slate-200">
                  <h4 className="font-medium mb-3">Member-wise Breakdown</h4>
                  <div className="space-y-3">
                    {previewAlert.members.map((member, idx) => (
                      <div key={idx} className="text-sm">
                        <p className="font-medium">{member.name} ({member.email})</p>
                        <p className="text-slate-600">CV: {member.cvUsage.toLocaleString()} | NVites: {member.nvitesUsage.toLocaleString()} | Jobs: {member.jobsUsage}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {previewAlert.overage > 0 && (
                  <div className="bg-red-50 rounded-lg p-4 mb-4 border border-red-200">
                    <p className="text-sm text-red-900 font-medium mb-2">Overage Charges</p>
                    <p className="text-sm text-red-700">Amount due: ₹{(previewAlert.overage * 50).toLocaleString()}</p>
                    <button className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition">
                      Pay Invoice
                    </button>
                  </div>
                )}

                <p className="text-sm text-slate-700 mb-2">
                  Please review your usage and plan accordingly.
                </p>
                <p className="text-sm text-slate-700">
                  Best regards,<br />
                  Operations Team
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
