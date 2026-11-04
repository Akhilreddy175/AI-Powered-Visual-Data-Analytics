import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  UploadCloud, Search, FileText, Trash2, Eye,
  AlertCircle, ChevronLeft, ChevronRight, X, Loader2
} from "lucide-react";
import { getDocuments, uploadDocuments, deleteDocument } from "../services/api";
import DocStatusBadge from "../components/DocStatusBadge";

function FileTypePill({ type }) {
  const colours = {
    pdf: "bg-rose-50 text-rose-600 border-rose-200",
    docx: "bg-blue-50 text-blue-600 border-blue-200",
    txt: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const key = (type || "").toLowerCase().replace(".", "");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${colours[key] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
      {(type || "").toUpperCase()}
    </span>
  );
}

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

const STATUS_FILTERS = ["All", "completed", "processing", "failed"];
const TYPE_FILTERS = ["All", "pdf", "docx", "txt"];

export default function DocumentsPage() {
  const [docs, setDocs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Upload state
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // Delete confirm state: { [id]: boolean }
  const [pendingDelete, setPendingDelete] = useState({});
  const [deleting, setDeleting] = useState({});

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page };
      if (statusFilter !== "All") params.status = statusFilter;
      if (typeFilter !== "All") params.file_type = typeFilter;
      if (debouncedQ) params.q = debouncedQ;
      const data = await getDocuments(params);
      setDocs(data.documents ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter, debouncedQ]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [statusFilter, typeFilter, debouncedQ]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      /\.(pdf|docx|txt)$/i.test(f.name)
    );
    setSelectedFiles(prev => [...prev, ...files]);
  }, []);

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(prev => [...prev, ...files]);
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      selectedFiles.forEach(f => fd.append("files", f));
      await uploadDocuments(fd, (evt) => {
        if (evt.total) setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      });
      setSelectedFiles([]);
      setUploadProgress(100);
      await fetchDocs();
    } catch (err) {
      setUploadError(err?.response?.data?.message || err.message || "Upload failed.");
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1500);
    }
  };

  const handleDelete = async (id) => {
    if (!pendingDelete[id]) {
      setPendingDelete(prev => ({ ...prev, [id]: true }));
      return;
    }
    setDeleting(prev => ({ ...prev, [id]: true }));
    setPendingDelete(prev => ({ ...prev, [id]: false }));
    try {
      await deleteDocument(id);
      await fetchDocs();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Delete failed.");
    } finally {
      setDeleting(prev => ({ ...prev, [id]: false }));
    }
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-800">Document Library</h1>
        <p className="text-sm text-slate-500 mt-0.5">Upload and manage your safety documents</p>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Upload Documents</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition ${
            dragOver ? "border-amber-400 bg-amber-50" : "border-slate-200 hover:border-amber-300 hover:bg-amber-50/50"
          }`}
        >
          <UploadCloud className={`w-8 h-8 ${dragOver ? "text-amber-500" : "text-slate-400"}`} />
          <p className="text-sm font-medium text-slate-700">Drop files here or <span className="text-amber-600 font-semibold">browse</span></p>
          <p className="text-xs text-slate-400">Supports PDF, DOCX, TXT</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {selectedFiles.length > 0 && (
          <ul className="space-y-1">
            {selectedFiles.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                <span className="truncate flex-1">{f.name} <span className="text-slate-400">({fmtSize(f.size)})</span></span>
                <button
                  onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}
                  className="ml-2 text-slate-400 hover:text-rose-500 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {uploadProgress > 0 && (
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        {uploadError && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl text-rose-700 px-4 py-3 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />{uploadError}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || uploading}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-xs transition"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {uploading ? "Uploading…" : `Upload ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ""}`}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search filename…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 w-56"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                statusFilter === s
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {s === "All" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TYPE_FILTERS.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                typeFilter === t
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {t === "All" ? "All Types" : t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl text-rose-700 px-4 py-3 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
          <button onClick={fetchDocs} className="ml-auto text-xs font-semibold underline">Retry</button>
        </div>
      )}

      {/* Document Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-200 rounded-xl" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <FileText className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500 font-medium">No documents found</p>
            <p className="text-xs text-slate-400">Try adjusting filters or uploading a new document</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {["Filename", "Type", "Size", "Status", "Chunks", "Date", "Actions"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs uppercase font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {docs.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-slate-800 truncate">{doc.original_filename}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <FileTypePill type={doc.file_type} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{fmtSize(doc.file_size_bytes)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <DocStatusBadge status={doc.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{doc.chunk_count ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{fmtDate(doc.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/documents/${doc.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          disabled={deleting[doc.id]}
                          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                            pendingDelete[doc.id]
                              ? "bg-rose-600 text-white border-rose-600 hover:bg-rose-700"
                              : "border-slate-200 bg-white hover:bg-rose-50 text-rose-500"
                          }`}
                        >
                          {deleting[doc.id]
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                          {pendingDelete[doc.id] ? "Confirm?" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total} documents
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 text-sm text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
