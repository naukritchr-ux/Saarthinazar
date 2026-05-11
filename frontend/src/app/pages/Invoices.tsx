import { useState } from 'react';
import { FileText, Download, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: string;
  partnerName: string;
  amount: number;
  dueDate: string;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  paymentDate?: string;
  paidAmount?: number;
}

const mockInvoices: Invoice[] = [
  { id: '1', invoiceNumber: 'INV-2026-001', partnerName: 'Talent Corner', amount: 80000, dueDate: '2026-04-30', paymentStatus: 'unpaid' },
  { id: '2', invoiceNumber: 'INV-2026-002', partnerName: 'HR Solutions', amount: 80000, dueDate: '2026-04-25', paymentStatus: 'paid', paymentDate: '2026-04-20', paidAmount: 80000 },
  { id: '3', invoiceNumber: 'INV-2026-003', partnerName: 'Staffing Pro', amount: 160000, dueDate: '2026-05-10', paymentStatus: 'partial', paymentDate: '2026-04-28', paidAmount: 100000 },
  { id: '4', invoiceNumber: 'INV-2026-004', partnerName: 'Global Recruit', amount: 80000, dueDate: '2026-04-15', paymentStatus: 'unpaid' },
  { id: '5', invoiceNumber: 'INV-2026-005', partnerName: 'Smart Hire', amount: 80000, dueDate: '2026-05-05', paymentStatus: 'paid', paymentDate: '2026-05-01', paidAmount: 80000 },
];

function getStatusBadge(status: string) {
  if (status === 'paid') return <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Paid</span>;
  if (status === 'partial') return <span className="px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full flex items-center gap-1"><Clock className="w-3 h-3" /> Partial</span>;
  return <span className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Unpaid</span>;
}

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
}

export default function Invoices() {
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');

  const filteredInvoices = filter === 'all'
    ? mockInvoices
    : mockInvoices.filter(inv => inv.paymentStatus === filter);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Invoices & Payments</h1>
          <p className="text-slate-600">Track billing and payment status</p>
        </div>
        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Generate Invoice
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Total Outstanding</p>
          <p className="text-3xl font-medium text-red-600">₹2,45,000</p>
          <p className="text-sm text-slate-500 mt-1">5 pending invoices</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Paid This Month</p>
          <p className="text-3xl font-medium text-green-600">₹2,60,000</p>
          <p className="text-sm text-slate-500 mt-1">3 invoices</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Partial Payments</p>
          <p className="text-3xl font-medium text-orange-600">₹1,00,000</p>
          <p className="text-sm text-slate-500 mt-1">₹60,000 pending</p>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <p className="text-slate-600 mb-2">Overdue</p>
          <p className="text-3xl font-medium text-red-600">₹1,60,000</p>
          <p className="text-sm text-slate-500 mt-1">2 invoices</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm transition ${filter === 'all' ? 'bg-purple-100 text-purple-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('paid')}
            className={`px-4 py-2 rounded-lg text-sm transition ${filter === 'paid' ? 'bg-green-100 text-green-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            Paid
          </button>
          <button
            onClick={() => setFilter('unpaid')}
            className={`px-4 py-2 rounded-lg text-sm transition ${filter === 'unpaid' ? 'bg-red-100 text-red-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            Unpaid
          </button>
          <button
            onClick={() => setFilter('partial')}
            className={`px-4 py-2 rounded-lg text-sm transition ${filter === 'partial' ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
          >
            Partial
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Invoice ID</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Partner Name</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Amount</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Due Date</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Payment Status</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Payment Date</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => {
                const overdue = invoice.paymentStatus === 'unpaid' && isOverdue(invoice.dueDate);
                return (
                  <tr
                    key={invoice.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition ${overdue ? 'bg-red-50' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium">{invoice.invoiceNumber}</td>
                    <td className="px-6 py-4">{invoice.partnerName}</td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium">₹{invoice.amount.toLocaleString()}</p>
                        {invoice.paymentStatus === 'partial' && invoice.paidAmount && (
                          <p className="text-xs text-slate-500">Paid: ₹{invoice.paidAmount.toLocaleString()}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p>{new Date(invoice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        {overdue && <p className="text-xs text-red-600 font-medium">Overdue</p>}
                      </div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(invoice.paymentStatus)}</td>
                    <td className="px-6 py-4 text-slate-600">
                      {invoice.paymentDate
                        ? new Date(invoice.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-purple-600 hover:text-purple-700 transition flex items-center gap-1 text-sm">
                        <Download className="w-4 h-4" />
                        Download
                      </button>
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
