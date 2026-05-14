import {
  useState,
  useRef,
  useEffect,
} from "react";
import { Upload, FileSpreadsheet, CheckCircle, X, AlertTriangle, Calendar } from 'lucide-react';


interface UploadRecord {
  id: string;
  date: string;
  resdexFile: string;
  jobPostingFile: string;
  uploadedBy: string;
  status: 'success' | 'error';
  errorMessage?: string;
}

const mockHistory: UploadRecord[] = [
  {
    id: '1',
    date: '2026-04-30',
    resdexFile: 'Resdex_Usage_01Apr-30Apr.xls',
    jobPostingFile: 'Job_Posting_01Apr-30Apr.xlsx',
    uploadedBy: 'Kajal',
    status: 'success',
  },
  {
    id: '2',
    date: '2026-04-22',
    resdexFile: 'Resdex_Usage_01Apr-22Apr.xls',
    jobPostingFile: 'Job_Posting_01Apr-22Apr.xlsx',
    uploadedBy: 'Kajal',
    status: 'success',
  },
  {
    id: '3',
    date: '2026-04-15',
    resdexFile: 'Resdex_Usage_01Apr-15Apr.xls',
    jobPostingFile: 'Job_Posting_01Apr-10Apr.xlsx',
    uploadedBy: 'Kajal',
    status: 'error',
    errorMessage: 'Report date mismatch. Resdex covers 01 Apr - 15 Apr but Job Posting covers 01 Apr - 10 Apr.',
  },
];

export default function UploadReports() {
  const [financialYear, setFinancialYear] = useState('2025-2026');
  const [resdexFile, setResdexFile] = useState<File | null>(null);
  const [jobPostingFile, setJobPostingFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const resdexInputRef = useRef<HTMLInputElement | null>(null);

  const jobsInputRef = useRef<HTMLInputElement | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent, type: 'resdex' | 'jobPosting') => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (type === 'resdex') {
        setResdexFile(e.dataTransfer.files[0]);
      } else {
        setJobPostingFile(e.dataTransfer.files[0]);
      }
    }
  };

  const handleUpload = async () => {

  if (!resdexFile || !jobPostingFile) {

    setValidationError(
      'Both reports must be uploaded simultaneously.'
    );

    return;
  }

  try {

    setValidationError(null);

    const formData = new FormData();

    formData.append(
      'financial_year',
      financialYear
    );

    formData.append(
      'uploaded_by',
      localStorage.getItem('username') || 'Kajal'
    );

    formData.append(
      'resdex_report',
      resdexFile
    );

    formData.append(
      'job_posting_report',
      jobPostingFile
    );

    const response = await fetch(

      'http://127.0.0.1:8000/reports/upload',

      {
        method: 'POST',

        body: formData
      }
    );

    const data = await response.json();

if (response.ok && data.status === 'success') {

  window.alert(

    `Reports uploaded successfully.\n\nTeams created: ${
      data.created_teams?.length || 0
    }`
  );

  setResdexFile(null);

  setJobPostingFile(null);

} else {

  console.error(data);

  setValidationError(

    data.detail ||

    data.message ||

    'Upload failed'
  );
}

  } catch (error) {

    console.error(error);

    setValidationError(
  error instanceof Error
    ? error.message
    : 'Upload failed'
);
  }
};

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Upload Reports</h1>
          <p className="text-slate-600">Upload weekly Resdex and Job Posting reports</p>
        </div>
        <select
          value={financialYear}
          onChange={(e) => setFinancialYear(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-xl bg-white"
        >
          <option value="2024-2025">FY 2024-2025</option>
          <option value="2025-2026">FY 2025-2026</option>
          <option value="2026-2027">FY 2026-2027</option>
        </select>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-8 flex items-center gap-3">
        <Calendar className="text-purple-600 w-5 h-5" />
        <div>
          <p className="text-purple-900 font-medium">Upload Requirements</p>
          <p className="text-purple-800 text-sm">Both reports must start from 1 April of the selected financial year and cover the same date range.</p>
        </div>
      </div>

      {validationError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 flex items-center gap-3">
          <AlertTriangle className="text-red-600 w-5 h-5" />
          <p className="text-red-900">{validationError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" />
            Resdex Usage Report (.xls)
          </h3>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
              dragActive ? 'border-purple-500 bg-purple-50' : 'border-slate-300'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={(e) => handleDrop(e, 'resdex')}
          >
            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">Drag & drop your file here</p>
            <p className="text-sm text-slate-500 mb-4">or</p>
            <input
              type="file"
              ref={resdexInputRef}
              id="resdex-upload"
              className="hidden"
              accept=".xls,.xlsx"
              onChange={(e) => e.target.files && setResdexFile(e.target.files[0])}
            />
            <label
              htmlFor="resdex-upload"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition cursor-pointer inline-block"
            >
              Browse Files
            </label>
          </div>
          {resdexFile && (
            <div className="mt-4 flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-900">{resdexFile.name}</span>
              </div>
              <button onClick={() => {

  setResdexFile(null);

  if (resdexInputRef.current) {
    resdexInputRef.current.value = "";
  }
}} className="text-green-600 hover:text-green-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" />
            Job Posting Report (.xlsx / CSV)
          </h3>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
              dragActive ? 'border-purple-500 bg-purple-50' : 'border-slate-300'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={(e) => handleDrop(e, 'jobPosting')}
          >
            <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 mb-2">Drag & drop your file here</p>
            <p className="text-sm text-slate-500 mb-4">or</p>
            <input
              type="file"
              ref={jobsInputRef}
              id="job-upload"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => e.target.files && setJobPostingFile(e.target.files[0])}
            />
            <label
              htmlFor="job-upload"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition cursor-pointer inline-block"
            >
              Browse Files
            </label>
          </div>
          {jobPostingFile && (
            <div className="mt-4 flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-900">{jobPostingFile.name}</span>
              </div>
              <button onClick={() => {

  setJobPostingFile(null);

  if (jobsInputRef.current) {
    jobsInputRef.current.value = "";
  }
}} className="text-green-600 hover:text-green-700">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-center mb-8">
        <button
          onClick={handleUpload}
          disabled={!resdexFile || !jobPostingFile}
          className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
        >
          Upload & Validate Reports
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-lg font-medium mb-6">Upload History</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Upload Date</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Resdex File</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Job Posting File</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Uploaded By</th>
                <th className="px-6 py-4 text-left text-sm text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {mockHistory.map((record) => (
                <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-6 py-4">
                    {new Date(record.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 text-sm">{record.resdexFile}</td>
                  <td className="px-6 py-4 text-sm">{record.jobPostingFile}</td>
                  <td className="px-6 py-4">{record.uploadedBy}</td>
                  <td className="px-6 py-4">
                    {record.status === 'success' ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full flex items-center gap-1 w-fit">
                        <CheckCircle className="w-3 h-3" /> Success
                      </span>
                    ) : (
                      <div>
                        <span className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full flex items-center gap-1 w-fit mb-2">
                          <AlertTriangle className="w-3 h-3" /> Failed
                        </span>
                        {record.errorMessage && (
                          <p className="text-xs text-red-600">{record.errorMessage}</p>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
