import {
  DollarSign,
  TrendingUp,
  Users,
  AlertCircle
} from "lucide-react";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";

import {
  useEffect,
  useState
} from "react";

import {
  authHeaders
} from "../services/authService";

import { useFY } from "../context/FYContext";

import API, { apiFetch } from "../services/api";

export default function FinancialInsights() {

  const { financialYear, setFinancialYear, financialYears } = useFY();

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    setError(null);
    try {
      const response = await apiFetch(
        `/financial/insights?financial_year=${financialYear}`
      );

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        setError(`Error ${response.status}: ${errJson.detail || response.statusText}`);
        return;
      }

      const json = await response.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Failed to fetch financial insights");
      console.error("Failed to fetch financial insights", err);
    }
  };

  useEffect(() => {
    if (!financialYear) return;
    fetchInsights();
  }, [financialYear]);

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
          <strong>Failed to load financial insights:</strong> {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-slate-600">
        Loading financial insights...
      </div>
    );
  }

  const summary = data.summary || {};

  const totalRevenue =
    summary.total_revenue || 0;

  const outstanding =
    summary.outstanding || 0;

  const grossProfit =
    totalRevenue * 0.3;

  const profitMargin =
    totalRevenue > 0
      ? (
          (grossProfit / totalRevenue) * 100
        ).toFixed(1)
      : "0";

  return (

    <div className="p-8">

      {/* HEADER */}

      <div className="flex justify-between items-center mb-8">

        <div>

          <h1 className="text-3xl mb-2">

            Financial Insights

          </h1>

          <p className="text-slate-600">

            Realtime executive financial dashboard

          </p>

        </div>

        <select

          value={financialYear}

          onChange={(e) =>
            setFinancialYear(e.target.value)
          }

          className="border rounded-lg px-4 py-2"

        >

          {financialYears.length > 0
            ? financialYears.map((y) => (
                <option key={y.id} value={y.label}>{y.label}</option>
              ))
            : <option value={financialYear}>{financialYear}</option>}

        </select>

      </div>

      {/* SUMMARY CARDS */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">

        <SummaryCard
          title="Total Revenue"
          value={`₹${totalRevenue.toLocaleString("en-IN")}`}
          icon={
            <DollarSign className="w-5 h-5 text-purple-600" />
          }
        />

        <SummaryCard
          title="Gross Profit"
          value={`₹${grossProfit.toLocaleString("en-IN")}`}
          subtitle={`${profitMargin}% margin`}
          icon={
            <TrendingUp className="w-5 h-5 text-green-600" />
          }
        />

        <SummaryCard
          title="Outstanding"
          value={`₹${outstanding.toLocaleString("en-IN")}`}
          icon={
            <AlertCircle className="w-5 h-5 text-orange-600" />
          }
        />

        <SummaryCard
          title="Active Partners"
          value={summary.active_partners || 0}
          icon={
            <Users className="w-5 h-5 text-blue-600" />
          }
        />

      </div>

      {/* CHARTS */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* REVENUE TREND */}

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">

          <h3 className="text-lg mb-4">

            Revenue Trend

          </h3>

          <ResponsiveContainer width="100%" height={300}>

            <LineChart data={data.revenue_trend || []}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="month" />

              <YAxis />

              <Tooltip />

              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#7B2CBF"
                strokeWidth={2}
              />

            </LineChart>

          </ResponsiveContainer>

        </div>

        {/* PARTNER PROFITS */}

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">

          <h3 className="text-lg mb-4">

            Profit by Partner

          </h3>

          <ResponsiveContainer width="100%" height={300}>

            <BarChart data={data.partner_summary || []}>

              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="team_name" />

              <YAxis />

              <Tooltip />

              <Bar
                dataKey="profit"
                fill="#10b981"
              />

            </BarChart>

          </ResponsiveContainer>

        </div>

      </div>

      {/* TABLE */}

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">

        <h3 className="text-lg mb-4">

          Partner Financial Summary

        </h3>

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead className="bg-slate-50 border-b border-slate-200">

              <tr>

                <th className="px-6 py-4 text-left">

                  Partner

                </th>

                <th className="px-6 py-4 text-left">

                  Revenue

                </th>

                <th className="px-6 py-4 text-left">

                  Cost

                </th>

                <th className="px-6 py-4 text-left">

                  Profit

                </th>

                <th className="px-6 py-4 text-left">

                  Margin

                </th>

                <th className="px-6 py-4 text-left">

                  Outstanding

                </th>

              </tr>

            </thead>

            <tbody>

              {(data.partner_summary || []).map(

                (partner: any, idx: number) => (

                  <tr
                    key={idx}
                    className="border-b hover:bg-slate-50"
                  >

                    <td className="px-6 py-4">

                      {partner.team_name}

                    </td>

                    <td className="px-6 py-4 text-green-700">

                      ₹{partner.revenue.toLocaleString("en-IN")}

                    </td>

                    <td className="px-6 py-4 text-red-700">

                      ₹{partner.cost.toLocaleString("en-IN")}

                    </td>

                    <td className="px-6 py-4">

                      ₹{partner.profit.toLocaleString("en-IN")}

                    </td>

                    <td className="px-6 py-4">

                      {partner.margin}%

                    </td>

                    <td className="px-6 py-4">

                      ₹{partner.outstanding.toLocaleString("en-IN")}

                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

/* ===================================================== */
/* SUMMARY CARD */
/* ===================================================== */

function SummaryCard({

  title,
  value,
  subtitle,
  icon

}: any) {

  return (

    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">

      <div className="flex items-center gap-3 mb-2">

        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">

          {icon}

        </div>

        <h3 className="text-slate-600">

          {title}

        </h3>

      </div>

      <p className="text-3xl mb-1">

        {value}

      </p>

      {subtitle && (

        <p className="text-sm text-slate-500">

          {subtitle}

        </p>
      )}

    </div>
  );
}