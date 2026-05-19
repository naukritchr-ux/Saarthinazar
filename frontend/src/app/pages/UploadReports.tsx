import {
  useState,
  useRef,
  useEffect,
} from "react";

import API from "../services/api";

import { useNavigate } from "react-router-dom";
import { useRole } from "../context/RoleContext";

import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  X,
  AlertTriangle,
  Calendar,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface UploadRecord {
  id: string;
  date?: string;
  created_at?: string;
  financial_year?: string;
  resdexFile?: string;
  resdex_file?: string;
  jobPostingFile?: string;
  job_posting_file?: string;
  uploadedBy?: string;
  uploaded_by?: string;
  status: "success" | "error";
  errorMessage?: string;
  message?: string;
  range_start?: string;
  range_end?: string;
}

export default function UploadReports() {

  const navigate = useNavigate();

  const [financialYear, setFinancialYear] =
    useState("2025-2026");

  const [resdexFile, setResdexFile] =
    useState<File | null>(null);

  const [jobPostingFile, setJobPostingFile] =
    useState<File | null>(null);

  const [validationError, setValidationError] =
    useState<string | null>(null);

  const [successMessage, setSuccessMessage] =
    useState<string | null>(null);

  const [dragActiveResdex, setDragActiveResdex] =
    useState(false);

  const [dragActiveJob, setDragActiveJob] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [uploadHistory, setUploadHistory] =
    useState<UploadRecord[]>([]);

  // Duplicate confirmation state
  const [duplicatePending, setDuplicatePending] =
    useState(false);

  // Non-Monday warning (shown inline, not blocking)
  const [notMondayWarning, setNotMondayWarning] =
    useState<string | null>(null);

  const resdexInputRef =
    useRef<HTMLInputElement | null>(null);

  const jobsInputRef =
    useRef<HTMLInputElement | null>(null);

  const { username: loggedInUser } = useRole();

  // =====================================================
  // CHECK IF TODAY IS MONDAY
  // =====================================================

  useEffect(() => {
    const today = new Date();
    const isMonday = today.getDay() === 1; // 0=Sun, 1=Mon
    if (!isMonday) {
      const dayName = today.toLocaleDateString("en-IN", { weekday: "long" });
      setNotMondayWarning(
        `Today is ${dayName}, not Monday. Reports are scheduled for upload every Monday. You can still upload if needed, but please confirm this is intentional.`
      );
    }
  }, []);

  // =====================================================
  // FETCH HISTORY
  // =====================================================

  const fetchHistory = () => {
    fetch(`${API}/reports/`)
      .then((res) => res.json())
      .then((data) => setUploadHistory(data))
      .catch(console.error);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  // =====================================================
  // DRAG EVENTS
  // =====================================================

  const handleDragResdex = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveResdex(
      e.type === "dragenter" || e.type === "dragover"
    );
  };

  const handleDragJob = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveJob(
      e.type === "dragenter" || e.type === "dragover"
    );
  };

  const handleDrop = (
    e: React.DragEvent,
    type: "resdex" | "jobPosting"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveResdex(false);
    setDragActiveJob(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (type === "resdex") {
        setResdexFile(e.dataTransfer.files[0]);
      } else {
        setJobPostingFile(e.dataTransfer.files[0]);
      }
    }
  };

  // =====================================================
  // CLEAR FILES
  // =====================================================

  const clearFiles = () => {
    setResdexFile(null);
    setJobPostingFile(null);
    if (resdexInputRef.current) resdexInputRef.current.value = "";
    if (jobsInputRef.current) jobsInputRef.current.value = "";
  };

  // =====================================================
  // UPLOAD (with or without overwrite flag)
  // =====================================================

  const doUpload = async (overwrite: boolean) => {

    if (uploading) return;

    // Hard error: both files required simultaneously
    if (!resdexFile || !jobPostingFile) {
      setValidationError(
        "Please upload both the Resdex Usage Report and the Job Posting Report together."
      );
      return;
    }

    setUploading(true);
    setValidationError(null);
    setSuccessMessage(null);
    setDuplicatePending(false);

    try {

      const formData = new FormData();
      formData.append("financial_year", financialYear);
      formData.append("uploaded_by", loggedInUser ?? "unknown");
      formData.append("overwrite_existing", overwrite ? "true" : "false");
      formData.append("resdex_report", resdexFile);
      formData.append("job_posting_report", jobPostingFile);

      const response = await fetch(
        `${API}/reports/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (response.ok && data.status === "success") {

        const teamsCreated  = data.new_teams_added || data.created_teams?.length || 0;
        const subusersNew   = data.subusers_added   || 0;
        const subusersUpd   = data.subusers_updated || 0;
        const subusersTotal = data.subusers_total   || (subusersNew + subusersUpd);

        // Build warning messages from raw warnings array
        const warnings: string[] = [];
        if (data.warnings) {
          for (const w of data.warnings) {
            const emails: string[] = w.emails ?? [];
            const preview = emails.slice(0, 3).join(", ");
            const extra   = emails.length > 3 ? ` +${emails.length - 3} more` : "";
            if (w.type === "unknown_teams") {
              warnings.push(`⚠ Teams not found in master list: ${w.teams?.join(", ")}`);
            } else if (w.type === "missing_resdex") {
              warnings.push(`⚠ Subusers in Job Posting but not in Resdex (partial data): ${preview}${extra}`);
            } else if (w.type === "missing_jobs") {
              warnings.push(`⚠ Subusers in Resdex but not in Job Posting (partial data): ${preview}${extra}`);
            }
          }
        }

        // Use backend-built message if available, else construct one
        let msg = data.message ||
          `Upload successful. ${subusersTotal} subuser(s) processed ` +
          `(${subusersNew} new, ${subusersUpd} updated). ` +
          `${teamsCreated} new team(s) created.`;
        if (overwrite) msg = "Overwrite: " + msg;
        if (warnings.length > 0) msg += "\n" + warnings.join("\n");

        setSuccessMessage(msg);
        fetchHistory();
        clearFiles();

        // Refresh dashboard data in background so banners disappear immediately
        // when user navigates back
        window.dispatchEvent(new CustomEvent("reportUploaded", { detail: { financialYear } }));

        // After 3 seconds auto-navigate to dashboard so data is visible
        setTimeout(() => navigate("/"), 3000);

      } else if (data.status === "duplicate") {

        setDuplicatePending(true);
        setValidationError(
          "This date range has already been uploaded. Uploading again will overwrite previous data. Confirm?"
        );

      } else {

        let detail: string = data.detail || data.message || "Upload failed.";

        if (detail.includes("must start from") && detail.includes("Resdex")) {
          detail = `Resdex report must start from 01 Apr. Please re-download from Naukri.`;
        } else if (detail.includes("must start from") && detail.includes("Job Posting")) {
          detail = `Job Posting report must start from 01 Apr. Please re-download from Naukri.`;
        } else if (detail.includes("date mismatch") || detail.includes("Date ranges") || detail.includes("date range")) {
          detail = `Report date mismatch. Both reports must cover the same period from 01 Apr.`;
        }

        setValidationError(detail);
        clearFiles();
      }

    } catch (error) {

      setValidationError(
        error instanceof Error ? error.message : "Upload failed. Is the server running?"
      );
      clearFiles();

    } finally {
      setUploading(false);
    }
  };

  const handleUpload          = () => doUpload(false);
  const handleConfirmOverwrite = () => doUpload(true);
  const handleCancelOverwrite  = () => {
    setDuplicatePending(false);
    setValidationError(null);
  };

  // =====================================================
  // RENDER
  // =====================================================

  const bothFilesReady = !!resdexFile && !!jobPostingFile;

  return (
    <div className="p-8">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Upload Reports</h1>
          <p className="text-slate-600">
            Upload weekly Resdex and Job Posting reports
          </p>
          <p className="text-sm text-slate-400 mt-1">
            Uploading as: <span className="font-medium text-slate-600">{loggedInUser}</span>
          </p>
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

      {/* NOT-MONDAY WARNING */}
      {notMondayWarning && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="text-yellow-600 w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-yellow-900 font-medium">Not a Monday</p>
            <p className="text-yellow-800 text-sm">{notMondayWarning}</p>
          </div>
          <button
            onClick={() => setNotMondayWarning(null)}
            className="text-yellow-600 hover:text-yellow-900 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* INFO */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 flex items-center gap-3">
        <Calendar className="text-purple-600 w-5 h-5 flex-shrink-0" />
        <div>
          <p className="text-purple-900 font-medium">Upload Requirements</p>
          <p className="text-purple-800 text-sm">
            Both reports must start from 1 April of the selected financial year and cover the same date range. Upload both files simultaneously.
          </p>
        </div>
      </div>

      {/* ERROR / DUPLICATE CONFIRMATION */}
      {validationError && (
        <div className={`border rounded-xl p-4 mb-6 ${
          duplicatePending
            ? "bg-amber-50 border-amber-300"
            : "bg-red-50 border-red-200"
        }`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${duplicatePending ? "text-amber-600" : "text-red-600"}`} />
            <div className="flex-1">
              <p className={duplicatePending ? "text-amber-900" : "text-red-900"}>
                {validationError}
              </p>
              {duplicatePending && (
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={handleConfirmOverwrite}
                    disabled={uploading}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 transition disabled:opacity-50"
                  >
                    {uploading ? "Processing..." : "Yes, Overwrite"}
                  </button>
                  <button
                    onClick={handleCancelOverwrite}
                    className="px-4 py-2 bg-white border border-amber-300 text-amber-800 rounded-lg text-sm hover:bg-amber-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <CheckCircle className="text-green-600 w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-green-900 whitespace-pre-line">{successMessage}</p>
            <p className="text-green-700 text-sm mt-2">
              Redirecting to dashboard in 3 seconds…
            </p>
          </div>
        </div>
      )}

      {/* FILE BOXES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

        {/* RESDEX */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" />
            Resdex Usage Report (.xls)
          </h3>

          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
              dragActiveResdex
                ? "border-purple-500 bg-purple-50"
                : resdexFile
                ? "border-green-400 bg-green-50"
                : "border-slate-300"
            }`}
            onDragEnter={handleDragResdex}
            onDragLeave={handleDragResdex}
            onDragOver={handleDragResdex}
            onDrop={(e) => handleDrop(e, "resdex")}
          >
            <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 mb-1">Drag & drop your file here</p>
            <p className="text-sm text-slate-500 mb-4">or</p>

            <input
              type="file"
              ref={resdexInputRef}
              id="resdex-upload"
              className="hidden"
              accept=".xls,.xlsx"
              onChange={(e) =>
                e.target.files && setResdexFile(e.target.files[0])
              }
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
                <span className="text-sm text-green-900 truncate max-w-xs">
                  {resdexFile.name}
                </span>
              </div>
              <button
                onClick={() => {
                  setResdexFile(null);
                  if (resdexInputRef.current) resdexInputRef.current.value = "";
                }}
                className="text-green-600 hover:text-red-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* JOB POSTING */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" />
            Job Posting Report (.xlsx)
          </h3>

          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
              dragActiveJob
                ? "border-purple-500 bg-purple-50"
                : jobPostingFile
                ? "border-green-400 bg-green-50"
                : "border-slate-300"
            }`}
            onDragEnter={handleDragJob}
            onDragLeave={handleDragJob}
            onDragOver={handleDragJob}
            onDrop={(e) => handleDrop(e, "jobPosting")}
          >
            <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 mb-1">Drag & drop your file here</p>
            <p className="text-sm text-slate-500 mb-4">or</p>

            <input
              type="file"
              ref={jobsInputRef}
              id="job-upload"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={(e) =>
                e.target.files && setJobPostingFile(e.target.files[0])
              }
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
                <span className="text-sm text-green-900 truncate max-w-xs">
                  {jobPostingFile.name}
                </span>
              </div>
              <button
                onClick={() => {
                  setJobPostingFile(null);
                  if (jobsInputRef.current) jobsInputRef.current.value = "";
                }}
                className="text-green-600 hover:text-red-500 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* UPLOAD BUTTON */}
      <div className="flex justify-center mb-8">
        <button
          onClick={handleUpload}
          disabled={uploading || !bothFilesReady || duplicatePending}
          className={`px-8 py-3 rounded-lg font-medium transition flex items-center gap-2 ${
            uploading
              ? "bg-slate-400 text-white cursor-not-allowed"
              : bothFilesReady && !duplicatePending
              ? "bg-purple-600 text-white hover:bg-purple-700 cursor-pointer"
              : "bg-slate-300 text-slate-500 cursor-not-allowed"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing Upload...
            </>
          ) : (
            "Upload & Validate Reports"
          )}
        </button>
      </div>

      {/* UPLOAD HISTORY */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h3 className="text-lg font-medium mb-6">Upload History</h3>

        {uploadHistory.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-8">
            No uploads yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm text-slate-600">Upload Date</th>
                  <th className="px-6 py-4 text-left text-sm text-slate-600">Financial Year</th>
                  <th className="px-6 py-4 text-left text-sm text-slate-600">Date Range</th>
                  <th className="px-6 py-4 text-left text-sm text-slate-600">Resdex File</th>
                  <th className="px-6 py-4 text-left text-sm text-slate-600">Job Posting File</th>
                  <th className="px-6 py-4 text-left text-sm text-slate-600">Uploaded By</th>
                  <th className="px-6 py-4 text-left text-sm text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {uploadHistory.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition"
                  >
                    <td className="px-6 py-4 text-sm">
                      {new Date(
                        record.created_at || record.date || ""
                      ).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {record.financial_year || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {record.range_start && record.range_end
                        ? `${new Date(record.range_start).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(record.range_end).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                        : "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {record.resdex_file || record.resdexFile || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {record.job_posting_file || record.jobPostingFile || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium">
                      {record.uploaded_by || record.uploadedBy || "—"}
                    </td>
                    <td className="px-6 py-4">
                      {record.status === "success" ? (
                        <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          Success
                        </span>
                      ) : (
                        <div>
                          <span className="px-3 py-1 bg-red-100 text-red-700 text-sm rounded-full inline-flex items-center gap-1 mb-1">
                            <AlertTriangle className="w-3 h-3" />
                            Failed
                          </span>
                          {record.message && (
                            <p className="text-xs text-red-600 mt-1 max-w-xs">
                              {record.message}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
