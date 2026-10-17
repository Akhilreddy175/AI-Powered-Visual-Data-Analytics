import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  getAnalysis,
  getOutputUrl,
  getOriginalUrl,
  downloadReportFile,
} from '../services/api';
import MediaPreview from '../components/MediaPreview';
import StatusBadge from '../components/StatusBadge';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Layers,
  FileSpreadsheet,
  Download,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';

export default function HistoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterViolationOnly, setFilterViolationOnly] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAnalysis(id);
        if (isMounted) {
          setAnalysis(data);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load analysis detail:', err);
          setError('Analysis not found or could not be retrieved.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchDetail();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <span className="text-sm font-medium">Loading analysis details...</span>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/history')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back to History
        </button>
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-3">
          <AlertCircle className="w-6 h-6 shrink-0 text-rose-600" />
          <div>
            <h3 className="font-semibold text-sm">Error Loading Analysis</h3>
            <p className="text-xs mt-0.5">{error || 'Record does not exist'}</p>
          </div>
        </div>
      </div>
    );
  }

  const isVideo = analysis.media_type === 'video';
  const detections = (analysis.detections || []).filter((d) =>
    filterViolationOnly ? d.is_violation : true
  );

  return (
    <div className="space-y-6">
      {/* Top Navigation & Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history')}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition"
            title="Back to History"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-800 truncate max-w-md sm:max-w-lg">
              {analysis.original_filename}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <span className="capitalize">{analysis.media_type}</span>
              <span>•</span>
              <span>ID: #{analysis.id}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadReportFile(
                analysis.id,
                `${analysis.original_filename.replace(/\.[^/.]+$/, '')}_report.csv`
              )
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            Download CSV Report
          </button>
          <a
            href={getOutputUrl(analysis.id)}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition"
          >
            <Download className="w-4 h-4" />
            Download Annotated Output
          </a>
        </div>
      </div>

      {/* Overview Metadata Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs uppercase tracking-wider font-semibold">
            <Layers className="w-4 h-4" />
            Status
          </div>
          <div className="mt-1">
            <StatusBadge status={analysis.status} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs uppercase tracking-wider font-semibold">
            <Calendar className="w-4 h-4" />
            Analyzed On
          </div>
          <span className="text-sm font-semibold text-slate-800">
            {analysis.created_at
              ? new Date(analysis.created_at).toLocaleString()
              : '-'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs uppercase tracking-wider font-semibold">
            <ShieldCheck className="w-4 h-4" />
            Total Detections
          </div>
          <span className="text-xl font-bold text-slate-800">
            {analysis.total_detections}
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-2 text-slate-400 mb-1 text-xs uppercase tracking-wider font-semibold">
            <ShieldAlert className="w-4 h-4" />
            Violations
          </div>
          <span
            className={`text-xl font-bold ${
              analysis.violation_count > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {analysis.violation_count}
          </span>
        </div>
      </div>

      {/* Visual Inspection Section */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-4">
        <h3 className="font-semibold text-sm text-slate-800 uppercase tracking-wider">
          Visual Inspection {isVideo ? '(Video Stream)' : '(Side-by-Side Comparison)'}
        </h3>

        {isVideo ? (
          <div className="max-w-4xl mx-auto">
            <MediaPreview
              src={getOutputUrl(analysis.id)}
              mediaType="video"
              alt={analysis.original_filename}
              aspectRatio="aspect-video"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Original Source Image
                </span>
                <a
                  href={getOriginalUrl(analysis.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  Raw source <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <MediaPreview
                src={getOriginalUrl(analysis.id)}
                mediaType="image"
                alt={`Original - ${analysis.original_filename}`}
                aspectRatio="aspect-4/3"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  YOLO Annotated Output
                </span>
                <a
                  href={getOutputUrl(analysis.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  Annotated <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <MediaPreview
                src={getOutputUrl(analysis.id)}
                mediaType="image"
                alt={`Annotated - ${analysis.original_filename}`}
                aspectRatio="aspect-4/3"
              />
            </div>
          </div>
        )}
      </div>

      {/* Detections List & Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">
              Detected Elements Log ({detections.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Individual PPE bounding box predictions with confidence calibrations
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filterViolationOnly}
              onChange={(e) => setFilterViolationOnly(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500/20 cursor-pointer"
            />
            Show Violations Only
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200/80">
              <tr>
                <th className="px-5 py-3.5">#</th>
                <th className="px-5 py-3.5">PPE Class</th>
                <th className="px-5 py-3.5">Classification</th>
                <th className="px-5 py-3.5">Confidence Score</th>
                {isVideo && <th className="px-5 py-3.5">Timestamp (s)</th>}
                {isVideo && <th className="px-5 py-3.5">Frame Number</th>}
                <th className="px-5 py-3.5">Bounding Box (x1, y1, x2, y2)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detections.length > 0 ? (
                detections.map((det, idx) => (
                  <tr
                    key={det.id || idx}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">
                      {det.class_label}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                          det.is_violation
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {det.is_violation ? (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            Violation
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Compliant
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-700 font-medium">
                      {(det.confidence * 100).toFixed(2)}%
                    </td>
                    {isVideo && (
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        {det.timestamp_seconds !== null && det.timestamp_seconds !== undefined
                          ? `${det.timestamp_seconds.toFixed(2)}s`
                          : '-'}
                      </td>
                    )}
                    {isVideo && (
                      <td className="px-5 py-3.5 text-xs text-slate-500">
                        {det.frame_number !== null && det.frame_number !== undefined
                          ? det.frame_number
                          : '-'}
                      </td>
                    )}
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-400">
                      {det.bbox_x1 !== undefined
                        ? `[${Math.round(det.bbox_x1)}, ${Math.round(det.bbox_y1)}, ${Math.round(det.bbox_x2)}, ${Math.round(det.bbox_y2)}]`
                        : '-'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={isVideo ? 7 : 5}
                    className="px-5 py-8 text-center text-slate-400 text-sm"
                  >
                    No detections match the current filter criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
