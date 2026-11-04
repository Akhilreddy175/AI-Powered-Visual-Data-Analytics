import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, Clock, XCircle, Loader2,
  FileText, Camera, Eye, Trash2, ChevronDown, ChevronUp,
  Filter, RefreshCw, ArrowLeft, Shield, Bot, Zap,
} from 'lucide-react';
import { getIncidents, getIncident, deleteIncident } from '../services/api';

// ─── Status badge ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  new:         { label: 'New',        bg: 'bg-blue-100',    text: 'text-blue-700',    icon: Clock },
  investigating:{ label: 'Investigating', bg: 'bg-amber-100', text: 'text-amber-700', icon: Loader2 },
  logged:      { label: 'Logged',     bg: 'bg-emerald-100', text: 'text-emerald-700', icon: CheckCircle2 },
  failed:      { label: 'Failed',     bg: 'bg-rose-100',    text: 'text-rose-700',    icon: XCircle },
};

const ALERT_CONFIG = {
  pending:  { label: 'Alert Pending', bg: 'bg-amber-50',   text: 'text-amber-600' },
  sent:     { label: 'Alert Sent',    bg: 'bg-emerald-50', text: 'text-emerald-600' },
  dev_mode: { label: 'Dev Mode',      bg: 'bg-slate-100',  text: 'text-slate-600' },
  skipped:  { label: 'No Alert',      bg: 'bg-slate-100',  text: 'text-slate-500' },
  failed:   { label: 'Alert Failed',  bg: 'bg-rose-50',    text: 'text-rose-600' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function AlertBadge({ status }) {
  const cfg = ALERT_CONFIG[status] || ALERT_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ─── Incident detail drawer / expanded view ──────────────────────────────────
function IncidentDetail({ incident, onClose, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState({ visual: true, docs: true, workflow: false });

  const toggle = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteIncident(incident.id);
      onDelete(incident.id);
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-2xl bg-white border-l border-slate-200 overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Incident #{incident.id}</h2>
              <p className="text-xs text-slate-500">{new Date(incident.created_at).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={incident.status} />
            <AlertBadge status={incident.alert_status} />
          </div>
        </div>

        <div className="flex-1 p-6 space-y-5">
          {/* Violation summary */}
          {incident.violation_type && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-rose-700">Violation Detected</p>
                  <p className="text-lg font-bold text-rose-800">{incident.violation_type}</p>
                  {incident.confidence && (
                    <p className="text-xs text-rose-500">
                      Confidence: {(incident.confidence * 100).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Investigation summary */}
          {incident.investigation_summary && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <Bot className="w-4 h-4 text-blue-500" />
                Investigation Summary
              </h3>
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <div
                  className="text-sm text-slate-700 leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: (incident.investigation_summary || '')
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\n\n/g, '</p><p class="mt-2">')
                      .replace(/\n/g, '<br/>')
                  }}
                />
              </div>
            </div>
          )}

          {/* Visual evidence */}
          {incident.visual_evidence?.length > 0 && (
            <div>
              <button
                onClick={() => toggle('visual')}
                className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 mb-2"
              >
                <span className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-rose-500" />
                  Visual Evidence ({incident.visual_evidence.length})
                </span>
                {expanded.visual ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expanded.visual && (
                <div className="space-y-2">
                  {incident.visual_evidence.map((ve, i) => (
                    <div key={i} className="bg-rose-50 border border-rose-100 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-xs font-bold">
                            {ve.class_label}
                          </span>
                          <p className="text-xs text-slate-600 mt-1">{ve.analysis_filename}</p>
                          {ve.confidence && (
                            <p className="text-xs text-slate-400">
                              Confidence: {(ve.confidence * 100).toFixed(1)}%
                            </p>
                          )}
                        </div>
                        <Link
                          to={`/history/${ve.analysis_id}`}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Document evidence */}
          {incident.document_evidence?.length > 0 && (
            <div>
              <button
                onClick={() => toggle('docs')}
                className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 mb-2"
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Document Evidence ({incident.document_evidence.length} passage{incident.document_evidence.length !== 1 ? 's' : ''})
                </span>
                {expanded.docs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expanded.docs && (
                <div className="space-y-2">
                  {incident.document_evidence.map((p, i) => (
                    <div key={i} className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700">{p.document_name}</p>
                          {p.page_number && (
                            <span className="text-xs text-slate-500">Page {p.page_number}</span>
                          )}
                          {p.section_heading && (
                            <p className="text-xs text-amber-700 font-medium">{p.section_heading}</p>
                          )}
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">{p.text}</p>
                        </div>
                        <Link
                          to={`/documents/${p.document_id}`}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1 ml-2 shrink-0"
                        >
                          <Eye className="w-3 h-3" /> View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Workflow steps */}
          {incident.workflow_steps?.length > 0 && (
            <div>
              <button
                onClick={() => toggle('workflow')}
                className="w-full flex items-center justify-between text-sm font-semibold text-slate-700 mb-2"
              >
                <span className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-violet-500" />
                  Workflow Steps ({incident.workflow_steps.length})
                </span>
                {expanded.workflow ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expanded.workflow && (
                <div className="space-y-1.5 bg-slate-50 rounded-xl border border-slate-200 p-4">
                  {incident.workflow_steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {step.status === 'completed' || step.status === 'sent' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : step.status === 'failed' ? (
                          <XCircle className="w-4 h-4 text-rose-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">{step.name}</p>
                        {step.detail && <p className="text-xs text-slate-500">{step.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alert info */}
          {incident.alert_message && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-1">Alert Message</h3>
              <p className="text-xs text-slate-600">{incident.alert_message}</p>
            </div>
          )}

          {/* Original question */}
          {incident.question && (
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Original Question</h3>
              <p className="text-sm text-slate-700 italic">"{incident.question}"</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
          <Link
            to="/ai"
            className="flex items-center gap-2 text-sm text-blue-600 hover:underline font-medium"
          >
            <Bot className="w-4 h-4" />
            Continue Investigation
          </Link>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-sm text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Are you sure?</span>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Incident row ────────────────────────────────────────────────────────────
function IncidentRow({ incident, onClick }) {
  return (
    <button
      onClick={() => onClick(incident)}
      className="w-full text-left flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
    >
      <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-5 h-5 text-rose-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-800">
            {incident.violation_type || 'Safety Investigation'}
          </p>
          <span className="text-xs text-slate-400">#{incident.id}</span>
          <StatusBadge status={incident.status} />
          <AlertBadge status={incident.alert_status} />
        </div>
        {incident.question && (
          <p className="text-xs text-slate-500 mt-0.5 truncate italic">"{incident.question}"</p>
        )}
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {incident.analysis_id && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Camera className="w-3 h-3" /> Detection #{incident.analysis_id}
            </span>
          )}
          {incident.document_id && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Document #{incident.document_id}
            </span>
          )}
          <span className="text-xs text-slate-400">
            {new Date(incident.created_at).toLocaleString()}
          </span>
        </div>
      </div>
      <Eye className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
    </button>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function IncidentPage() {
  const [incidents, setIncidents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const load = async (resetPage = false) => {
    setLoading(true);
    setError('');
    const currentOffset = resetPage ? 0 : page * LIMIT;
    try {
      const data = await getIncidents({
        limit: LIMIT,
        offset: currentOffset,
        ...(statusFilter && { status: statusFilter }),
      });
      setIncidents(data.incidents || []);
      setTotal(data.total || 0);
      if (resetPage) setPage(0);
    } catch {
      setError('Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(true); }, [statusFilter]);
  useEffect(() => { load(); }, [page]);

  const handleDelete = (id) => {
    setIncidents(prev => prev.filter(i => i.id !== id));
    setTotal(prev => prev - 1);
  };

  const openDetail = async (incident) => {
    // Fetch fresh detail in case workflow_steps etc. were updated
    try {
      const fresh = await getIncident(incident.id);
      setSelectedIncident(fresh);
    } catch {
      setSelectedIncident(incident);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Incident Management</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Safety incidents logged by the AI investigation workflow
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/ai"
            className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Bot className="w-4 h-4" />
            New Investigation
          </Link>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-2 border border-slate-300 text-slate-700 text-sm font-medium px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Incidents', value: total, icon: AlertTriangle, color: 'rose' },
          { label: 'Logged', value: incidents.filter(i => i.status === 'logged').length, icon: CheckCircle2, color: 'emerald' },
          { label: 'Alerts Sent', value: incidents.filter(i => i.alert_status === 'sent').length, icon: Zap, color: 'amber' },
          { label: 'With Evidence', value: incidents.filter(i => i.analysis_id || i.document_id).length, icon: Shield, color: 'blue' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg bg-${stat.color}-50 flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 text-${stat.color}-500`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400" />
        <span className="text-sm text-slate-500 font-medium">Status:</span>
        {['', 'new', 'logged', 'investigating', 'failed'].map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Loading incidents…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 gap-3 text-rose-500">
            <XCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
            <Shield className="w-12 h-12 opacity-30" />
            <div className="text-center">
              <p className="font-semibold text-slate-600">No incidents found</p>
              <p className="text-sm mt-1">
                {statusFilter
                  ? `No incidents with status "${statusFilter}"`
                  : 'Run an investigation in the AI Assistant to log incidents.'}
              </p>
            </div>
            <Link
              to="/ai"
              className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline"
            >
              <Bot className="w-4 h-4" />
              Start Investigation
            </Link>
          </div>
        ) : (
          incidents.map(incident => (
            <IncidentRow
              key={incident.id}
              incident={incident}
              onClick={openDetail}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page + 1} of {Math.ceil(total / LIMIT)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * LIMIT >= total}
            className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {/* Detail panel */}
      {selectedIncident && (
        <IncidentDetail
          incident={selectedIncident}
          onClose={() => setSelectedIncident(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
