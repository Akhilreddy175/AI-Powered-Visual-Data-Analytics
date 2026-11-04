import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, FileText, Layers, Sparkles, UploadCloud,
  RefreshCw, AlertCircle, ChevronRight, Clock
} from "lucide-react";
import { getDocumentStats } from "../services/api";
import DocStatusBadge from "../components/DocStatusBadge";

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-24 mb-4" />
      <div className="h-8 bg-slate-200 rounded w-16" />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex items-start gap-4">
      <div className="shrink-0 w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
        <Icon className="w-5 h-5 text-amber-600" />
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-800">{value ?? "—"}</p>
        {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

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

export default function KnowledgeDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDocumentStats();
      setStats(data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const fmt = (n) => (n ?? 0).toLocaleString();
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 space-y-6">
        <div className="h-8 bg-slate-200 rounded w-56 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 animate-pulse space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-200 rounded" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="bg-rose-50 border border-rose-200 rounded-xl text-rose-700 p-6 max-w-md w-full flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8" />
          <p className="font-semibold text-center">{error}</p>
          <button
            onClick={fetchStats}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg shadow-xs transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasDocuments = (stats?.total_documents ?? 0) > 0;
  const recent = stats?.recent_documents ?? [];

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Knowledge Base</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage and search your safety documents</p>
        </div>
        <Link
          to="/documents"
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg shadow-xs transition"
        >
          <UploadCloud className="w-4 h-4" />
          Upload Documents
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard icon={BookOpen} label="Total Documents" value={fmt(stats?.total_documents)} sub={`${fmt(stats?.processing ?? 0)} processing`} />
        <KpiCard icon={Sparkles} label="Indexed" value={fmt(stats?.completed)} sub={`${fmt(stats?.failed ?? 0)} failed`} />
        <KpiCard icon={Layers} label="Text Chunks" value={fmt(stats?.total_chunks)} />
        <KpiCard icon={FileText} label="Extracted Facts" value={fmt(stats?.total_facts)} />
      </div>

      {/* Recent Documents */}
      {!hasDocuments ? (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-12 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-amber-600" />
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-slate-800">No documents yet</p>
            <p className="text-sm text-slate-500 mt-1">Upload your first safety document to get started</p>
          </div>
          <Link
            to="/documents"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg shadow-xs transition"
          >
            Upload First Document
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-bold text-slate-800">Recent Documents</h2>
            </div>
            <Link to="/documents" className="text-xs text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500 text-center">No recent documents.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.slice(0, 5).map((doc) => (
                <li key={doc.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50 transition">
                  <div className="shrink-0">
                    <FileText className="w-5 h-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.original_filename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <FileTypePill type={doc.file_type} />
                      <span className="text-xs text-slate-400">{fmtDate(doc.created_at)}</span>
                    </div>
                  </div>
                  <DocStatusBadge status={doc.status} />
                  <Link
                    to={`/documents/${doc.id}`}
                    className="ml-2 shrink-0 px-3 py-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition"
                  >
                    View
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
