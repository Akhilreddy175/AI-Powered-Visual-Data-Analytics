import { useState, useEffect, useCallback } from 'react';
import { getAnalyses, getViolations, downloadReportFile } from '../services/api';
import EmptyState from '../components/EmptyState';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Filter,
  Film,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Calendar,
} from 'lucide-react';

export default function ReportsPage() {
  const [analyses, setAnalyses] = useState([]);
  const [violations, setViolations] = useState([]);
  const [mediaType, setMediaType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = { status: 'completed', limit: 100 };
      if (mediaType) params.media_type = mediaType;

      const [analysesRes, violationsRes] = await Promise.all([
        getAnalyses(params),
        getViolations(mediaType ? { media_type: mediaType } : {}),
      ]);

      setAnalyses(analysesRes?.analyses || []);
      setViolations(violationsRes?.violations || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
      setError('Could not load report archives. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  }, [mediaType]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleDownload = async (id, filename) => {
    try {
      setDownloadingId(id);
      await downloadReportFile(id, `${filename.replace(/\.[^/.]+$/, '')}_report.csv`);
    } catch (err) {
      console.error('Failed to download report:', err);
      alert('Failed to download report file.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Compliance Reports Archive</h2>
        <p className="text-sm text-slate-500">
          Generate, export, and download structured CSV reports for workplace safety audits
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Filter by:
          </span>
          <select
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg text-sm py-1.5 px-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">All Media Types</option>
            <option value="image">Images Only</option>
            <option value="video">Videos Only</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
          <span className="text-sm font-medium">Loading reports...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Table: Violations by Category */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-800 text-sm">
                  Executive Violation Summary
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Aggregated counts and average confidence scores across all completed media
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200/80">
                  <tr>
                    <th className="px-5 py-3.5">Violation Category</th>
                    <th className="px-5 py-3.5">Total Occurrences</th>
                    <th className="px-5 py-3.5">Average Confidence</th>
                    <th className="px-5 py-3.5">Risk Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {violations.length > 0 ? (
                    violations.map((v, i) => (
                      <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5 font-semibold text-slate-800">
                          {v.category}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-rose-600">
                          {v.count}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                          {(v.avg_confidence * 100).toFixed(1)}%
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              v.count > 10
                                ? 'bg-rose-100 text-rose-700'
                                : v.count > 3
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {v.count > 10 ? 'High' : v.count > 3 ? 'Medium' : 'Low'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-5 py-8 text-center text-slate-400 text-sm">
                        No safety violations recorded in current filter selection
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual Completed Media Reports Table */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">
                Individual Analysis CSV Reports ({analyses.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Download frame-by-frame bounding box annotations and confidence ratings
              </p>
            </div>

            {analyses.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No completed reports yet"
                description="Once analyses finish processing, you will find CSV report exports ready here."
                actionLabel="Analyze Media"
                actionLink="/analyze"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200/80">
                    <tr>
                      <th className="px-5 py-3.5">Analyzed File</th>
                      <th className="px-5 py-3.5">Media Type</th>
                      <th className="px-5 py-3.5">Processed Date</th>
                      <th className="px-5 py-3.5">Total Detections</th>
                      <th className="px-5 py-3.5">Violations</th>
                      <th className="px-5 py-3.5 text-right">Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analyses.map((analysis) => {
                      const isVideo = analysis.media_type === 'video';
                      const isDownloading = downloadingId === analysis.id;
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
                            {analysis.completed_at || analysis.created_at
                              ? new Date(
                                  analysis.completed_at || analysis.created_at
                                ).toLocaleString()
                              : '-'}
                          </td>
                          <td className="px-5 py-4 font-semibold text-slate-800">
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
                            <button
                              type="button"
                              disabled={isDownloading}
                              onClick={() =>
                                handleDownload(
                                  analysis.id,
                                  analysis.original_filename
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition disabled:opacity-60 cursor-pointer"
                            >
                              {isDownloading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              <span>CSV</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
