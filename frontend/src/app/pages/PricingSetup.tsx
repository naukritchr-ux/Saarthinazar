import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { useFY } from "../context/FYContext";

const API = "http://127.0.0.1:8000";

interface PricingRow {
  id: string;
  period: string;
  partner_type: string;
  price: number;
  cv_access: number;
  nvites: number;
  job_postings: number;
}

const PERIODS = [
  "Apr - Jun (Q1)",
  "Jul - Sep (Q2)",
  "Oct - Nov",
  "December",
  "January",
  "February",
  "March",
];

const PARTNER_TYPES: { [key: string]: string[] } = {
  "Apr - Jun (Q1)": ["Early renewal (before 31 Mar)", "New partner", "Late existing partner"],
  "Jul - Sep (Q2)": ["New partner", "Returning partner"],
  "Oct - Nov": ["New partner", "Returning partner"],
  "December": ["All (free offer)"],
  "January": ["All"],
  "February": ["All (free offer)"],
  "March": ["All (free offer)"],
};

const SAMPLE_DATA: PricingRow[] = [
  { id: "1", period: "Apr - Jun (Q1)", partner_type: "Early renewal (before 31 Mar)", price: 80000, cv_access: 3000, nvites: 22500, job_postings: 100 },
  { id: "2", period: "Apr - Jun (Q1)", partner_type: "New partner", price: 80000, cv_access: 3000, nvites: 22500, job_postings: 100 },
  { id: "3", period: "Apr - Jun (Q1)", partner_type: "Late existing partner", price: 84000, cv_access: 3000, nvites: 22500, job_postings: 100 },
  { id: "4", period: "Jul - Sep (Q2)", partner_type: "New partner", price: 65000, cv_access: 3000, nvites: 22500, job_postings: 100 },
  { id: "5", period: "Jul - Sep (Q2)", partner_type: "Returning partner", price: 70000, cv_access: 3000, nvites: 22500, job_postings: 100 },
  { id: "6", period: "Oct - Nov", partner_type: "New partner", price: 48000, cv_access: 2000, nvites: 11250, job_postings: 70 },
  { id: "7", period: "Oct - Nov", partner_type: "Returning partner", price: 52000, cv_access: 2000, nvites: 11250, job_postings: 70 },
  { id: "8", period: "December", partner_type: "All (free offer)", price: 0, cv_access: 1000, nvites: 7500, job_postings: 50 },
  { id: "9", period: "January", partner_type: "All", price: 15000, cv_access: 750, nvites: 5000, job_postings: 30 },
  { id: "10", period: "February", partner_type: "All (free offer)", price: 0, cv_access: 500, nvites: 2500, job_postings: 20 },
  { id: "11", period: "March", partner_type: "All (free offer)", price: 0, cv_access: 250, nvites: 2500, job_postings: 20 },
];

export default function PricingSetup() {
  const { financialYear, financialYears } = useFY();
  const [selectedFY, setSelectedFY] = useState(financialYear || "");
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const addEmptyRow = () => {
    const newRow: PricingRow = {
      id: Date.now().toString(),
      period: "",
      partner_type: "",
      price: 0,
      cv_access: 0,
      nvites: 0,
      job_postings: 0,
    };
    setRows([...rows, newRow]);
  };

  const loadSampleData = () => {
    setRows(SAMPLE_DATA.map((row, idx) => ({ ...row, id: (idx + 1).toString() })));
    setMessage("✓ Sample pricing data loaded. Fill in and save for " + selectedFY);
  };

  const deleteRow = (id: string) => {
    setRows(rows.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: string, value: any) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const savePricing = async () => {
    if (!selectedFY) {
      setMessage("❌ Please select a financial year");
      return;
    }
    if (rows.length === 0) {
      setMessage("❌ Add at least one pricing row");
      return;
    }

    setLoading(true);
    setMessage("Saving pricing data...");

    try {
      const response = await fetch(`${API}/pricing/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          financial_year: selectedFY,
          pricing_data: rows.map((r) => ({
            period: r.period,
            partner_type: r.partner_type,
            price_with_gst: r.price,
            cv_access: r.cv_access,
            nvites: r.nvites,
            job_postings: r.job_postings,
          })),
        }),
      });

      const result = await response.json();
      if (response.ok) {
        setMessage("✅ Pricing saved successfully for FY " + selectedFY);
        setRows([]);
      } else {
        setMessage("❌ " + (result.detail || "Error saving pricing"));
      }
    } catch (error) {
      setMessage("❌ Error: " + (error as any).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Pricing Setup</h1>
        <p className="text-slate-600">Configure pricing for a financial year</p>
      </div>

      {/* HEADER CONTROLS */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Financial Year
            </label>
            <select
              value={selectedFY}
              onChange={(e) => setSelectedFY(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl"
            >
              <option value="">-- Choose FY --</option>
              {financialYears.map((fy) => (
                <option key={fy.id} value={fy.label}>
                  FY {fy.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={loadSampleData}
              disabled={!selectedFY || rows.length > 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-slate-300 transition"
            >
              Load Sample Data (2026-27)
            </button>
          </div>
        </div>

        {message && (
          <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
            message.includes("✅") ? "bg-green-50 text-green-900 border border-green-200" :
            message.includes("❌") ? "bg-red-50 text-red-900 border border-red-200" :
            "bg-blue-50 text-blue-900 border border-blue-200"
          }`}>
            {message}
          </div>
        )}
      </div>

      {/* PRICING TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-medium text-slate-700">Period</th>
                <th className="px-4 py-3 text-left font-medium text-slate-700">Partner Type</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Price + GST (₹)</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">CV Access</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">NVites</th>
                <th className="px-4 py-3 text-right font-medium text-slate-700">Job Postings</th>
                <th className="px-4 py-3 text-center font-medium text-slate-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <select
                      value={row.period}
                      onChange={(e) => updateRow(row.id, "period", e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                    >
                      <option value="">Select</option>
                      {PERIODS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.partner_type}
                      onChange={(e) => updateRow(row.id, "partner_type", e.target.value)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                      disabled={!row.period}
                    >
                      <option value="">Select</option>
                      {row.period && (
                        PARTNER_TYPES[row.period]?.map((pt) => (
                          <option key={pt} value={pt}>{pt}</option>
                        ))
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={row.price}
                      onChange={(e) => updateRow(row.id, "price", parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={row.cv_access}
                      onChange={(e) => updateRow(row.id, "cv_access", parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={row.nvites}
                      onChange={(e) => updateRow(row.id, "nvites", parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={row.job_postings}
                      onChange={(e) => updateRow(row.id, "job_postings", parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm text-right"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => deleteRow(row.id)}
                      className="text-red-600 hover:text-red-800 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-slate-500">
            <p className="text-sm mb-4">No pricing rows added yet</p>
            <button
              onClick={loadSampleData}
              disabled={!selectedFY}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50"
            >
              Load Sample Data
            </button>
          </div>
        )}
      </div>

      {/* FOOTER ACTIONS */}
      <div className="mt-6 flex gap-3 justify-between">
        <button
          onClick={addEmptyRow}
          disabled={!selectedFY}
          className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50 disabled:opacity-50 transition"
        >
          <Plus className="w-4 h-4" /> Add Row
        </button>
        <button
          onClick={savePricing}
          disabled={!selectedFY || rows.length === 0 || loading}
          className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:bg-slate-300 transition"
        >
          <Save className="w-4 h-4" /> {loading ? "Saving..." : "Save Pricing"}
        </button>
      </div>

      {/* INFO BOX */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-medium text-blue-900 mb-2">💡 Quick Start</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>✓ Select a financial year (e.g., 2026-2027)</li>
          <li>✓ Click "Load Sample Data" to auto-fill with 2026-27 pricing structure</li>
          <li>✓ Edit any values if needed (prices, CV limits, etc.)</li>
          <li>✓ Click "Save Pricing" to store in database</li>
          <li>✓ All partners will auto-calculate entitlements based on signup date</li>
        </ul>
      </div>
    </div>
  );
}
