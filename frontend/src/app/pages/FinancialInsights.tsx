import { DollarSign, TrendingUp, Users, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const revenueData = [
  { month: 'Apr', revenue: 400000, cost: 280000 },
  { month: 'May', revenue: 350000, cost: 260000 },
  { month: 'Jun', revenue: 420000, cost: 290000 },
  { month: 'Jul', revenue: 380000, cost: 275000 },
];

const partnerProfitData = [
  { name: 'Talent Corner', revenue: 80000, cost: 56000, profit: 24000 },
  { name: 'HR Solutions', revenue: 80000, cost: 58000, profit: 22000 },
  { name: 'Staffing Pro', revenue: 160000, cost: 115000, profit: 45000 },
  { name: 'Global Recruit', revenue: 80000, cost: 55000, profit: 25000 },
  { name: 'Smart Hire', revenue: 80000, cost: 54000, profit: 26000 },
];

export default function FinancialInsights() {
  const totalRevenue = partnerProfitData.reduce((sum, p) => sum + p.revenue, 0);
  const totalCost = partnerProfitData.reduce((sum, p) => sum + p.cost, 0);
  const grossProfit = totalRevenue - totalCost;
  const profitMargin = ((grossProfit / totalRevenue) * 100).toFixed(1);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Financial Insights</h1>
        <p className="text-slate-600">Executive financial dashboard and analytics</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="text-slate-600">Total Revenue</h3>
          </div>
          <p className="text-3xl mb-1">₹{totalRevenue.toLocaleString()}</p>
          <p className="text-sm text-green-600">+12% vs last month</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="text-slate-600">Gross Profit</h3>
          </div>
          <p className="text-3xl mb-1">₹{grossProfit.toLocaleString()}</p>
          <p className="text-sm text-slate-500">{profitMargin}% margin</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="text-slate-600">Outstanding</h3>
          </div>
          <p className="text-3xl mb-1">₹2,45,000</p>
          <p className="text-sm text-slate-500">From 5 partners</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="text-slate-600">Active Partners</h3>
          </div>
          <p className="text-3xl mb-1">5</p>
          <p className="text-sm text-slate-500">2 new this quarter</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg mb-4">Revenue vs Cost Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#7B2CBF" strokeWidth={2} />
              <Line type="monotone" dataKey="cost" stroke="#94a3b8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-6 mt-4 justify-center">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-purple-600 rounded"></div>
              <span className="text-sm text-slate-600">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-slate-400 rounded"></div>
              <span className="text-sm text-slate-600">Cost</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg mb-4">Profit by Partner</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={partnerProfitData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="profit" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-lg mb-4">Partner Financial Summary</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Partner Name</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Revenue</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Company Cost</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Gross Profit</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Profit Margin</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {partnerProfitData.map((partner, idx) => {
                const margin = ((partner.profit / partner.revenue) * 100).toFixed(1);
                return (
                  <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-medium">{partner.name}</td>
                    <td className="px-6 py-4 text-green-700 font-medium">₹{partner.revenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-red-700 font-medium">₹{partner.cost.toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium">₹{partner.profit.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                        {margin}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {idx === 0 ? '₹45,000' : idx === 3 ? '₹65,000' : idx === 4 ? '₹55,000' : '—'}
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
