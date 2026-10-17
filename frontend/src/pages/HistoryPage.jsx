import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAnalyses, deleteAnalysis } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import {
  History,
  Search,
  Filter,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Upload,
  AlertCircle,
  Loader2,
  Film,
  Image as ImageIcon,
} from 'lucide-react';

const PAGE_SIZE = 10;

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [mediaTypeFilter, setMediaTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const navigate = useNavigate();

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (mediaTypeFilter) params.media_type = mediaTypeFilter;
      if (statusFilter) params.status = statusFilter;

      const data = await getAnalyses(params);
      setAnalyses(data.analyses || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load history:', err);
      setError('Could not retrieve analysis records. Please check the backend connection.');
    } finally {
      setLoading(false);
    }
  }, [page, mediaTypeFilter, statusFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDelete = async (id) => {
    try {
      setDeletingId(id);
      await deleteAnalysis(id);
      setDeleteConfirmId(null);
      fetchHistory();
    } catch (err) {
      console.error('Failed to delete analysis:', err);
      alert('Failed to delete the analysis. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  // Client-side search filtering on current page results
  const filteredAnalyses = analyses.filter((item) =>
    item.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Analysis History</h2>
          <p className="text-sm text-slate-500">
            Browse and review past media analyses, compliance checks, and detection logs
          </p>
        </div>

        <Link
          to="/analyze"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-xs transition"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Media</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by filename..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={mediaTypeFilter}
              onChange={(e) => {
                setMediaTypeFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg text-sm py-2 px-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Media Types</option>
              <option value="image">Images Only</option>
              <option value="video">Videos Only</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg text-sm py-2 px-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* History Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <span className="text-sm font-medium">Loading analysis records...</span>
          </div>
        ) : filteredAnalyses.length === 0 ? (
          <EmptyState
            icon={History}
            title="No analyses found"
            description={
              searchQuery || mediaTypeFilter || statusFilter
                ? 'No records match your selected filters. Try resetting the search or filter criteria.'
                : 'You have not uploaded or analyzed any media yet.'
            }
            actionLabel={
              searchQuery || mediaTypeFilter || statusFilter ? 'Reset Filters' : 'Analyze Media'
            }
            onAction={
              searchQuery || mediaTypeFilter || statusFilter
                ? () => {
                    setSearchQuery('');
                    setMediaTypeFilter('');
                    setStatusFilter('');
                    setPage(1);
                  }
                : undefined
            }
            actionLink={
              !searchQuery && !mediaTypeFilter && !statusFilter ? '/analyze' : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200/80">
                  <tr>
                    <th className="px-5 py-3.5">Filename</th>
                    <th className="px-5 py-3.5">Type</th>
                    <th className="px-5 py-3.5">Date & Time</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Detections</th>
                    <th className="px-5 py-3.5">Violations</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAnalyses.map((analysis) => {
                    const isVideo = analysis.media_type === 'video';
                    return (
                      <tr
                        key={analysis.id}
                        className="hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isVideo
                                  ? 'bg-purple-50 text-purple-600'
                                  : 'bg-blue-50 text-blue-600'
                              }`}
                            >
                              {isVideo ? (
                                <Film className="w-4 h-4" />
                              ) : (
                                <ImageIcon className="w-4 h-4" />
                              )}
                            </div>
                            <span className="font-medium text-slate-900 max-w-xs truncate">
                              {analysis.original_filename}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {analysis.media_type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                          {analysis.created_at
                            ? new Date(analysis.created_at).toLocaleString()
                            : '-'}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge status={analysis.status} />
                        </td>
                        <td className="px-5 py-4 font-medium text-slate-700">
                          {analysis.total_detections}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`font-semibold ${
                              analysis.violation_count > 0
                                ? 'text-rose-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {analysis.violation_count}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/history/${analysis.id}`)}
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="View Analysis Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(analysis.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Record"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Showing{' '}
                <span className="font-semibold text-slate-700">
                  {analyses.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-700">
                  {Math.min(page * PAGE_SIZE, total)}
                </span>{' '}
                of <span className="font-semibold text-slate-700">{total}</span> analyses
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-medium">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Analysis?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will permanently delete this analysis record, annotated outputs, and detections. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId === deleteConfirmId}
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs flex items-center gap-2"
              >
                {deletingId === deleteConfirmId ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Confirm Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
