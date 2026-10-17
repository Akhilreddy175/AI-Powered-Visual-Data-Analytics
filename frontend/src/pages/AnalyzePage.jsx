import { useState } from 'react';
import { Link } from 'react-router-dom';
import FileDropZone from '../components/FileDropZone';
import MediaPreview from '../components/MediaPreview';
import StatusBadge from '../components/StatusBadge';
import { uploadFiles, getAnalysis, downloadReportFile, getOutputUrl } from '../services/api';
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

export default function AnalyzePage() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [errors, setErrors] = useState([]);
  const [activeResultIndex, setActiveResultIndex] = useState(0);

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setErrors([]);
    setResults([]);

    const formData = new FormData();
    selectedFiles.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await uploadFiles(formData, (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        }
      });

      if (response.errors && response.errors.length > 0) {
        setErrors(response.errors);
      }

      // Fetch detailed analysis results including detections for each uploaded file
      const detailedResults = await Promise.all(
        (response.analyses || []).map(async (item) => {
          try {
            return await getAnalysis(item.id);
          } catch {
            return item;
          }
        })
      );

      setResults(detailedResults);
      setActiveResultIndex(0);
      setSelectedFiles([]);
    } catch (err) {
      console.error('Upload failed:', err);
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to process media files. Please check network and file formats.';
      setErrors([msg]);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadReport = async (analysisId, filename) => {
    try {
      await downloadReportFile(analysisId, `${filename.replace(/\.[^/.]+$/, '')}_report.csv`);
    } catch (err) {
      console.error('Download report failed:', err);
    }
  };

  const currentAnalysis = results[activeResultIndex];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Analyze Job Site Media</h2>
        <p className="text-sm text-slate-500">
          Upload images or videos to detect personal protective equipment (PPE) compliance
        </p>
      </div>

      {/* Upload Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs">
        <FileDropZone
          files={selectedFiles}
          setFiles={setSelectedFiles}
          disabled={uploading}
        />

        {/* Upload Action Bar */}
        {selectedFiles.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{selectedFiles.length}</span>{' '}
              file(s) queued for AI inference
            </div>

            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/20 disabled:opacity-60 transition cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing ({uploadProgress}%)...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Start PPE Detection</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Progress Bar */}
        {uploading && (
          <div className="mt-4">
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 transition-all duration-300 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">
              Processing YOLO inference pipeline. This may take longer for high-res video files.
            </p>
          </div>
        )}
      </div>

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
          {errors.map((err, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Detection Results ({results.length})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Review annotated bounding boxes, violations, and generated reports
              </p>
            </div>

            <button
              onClick={() => {
                setResults([]);
                setSelectedFiles([]);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              New Batch
            </button>
          </div>

          {/* Multiple Results Tabs */}
          {results.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-slate-100">
              {results.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => setActiveResultIndex(idx)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition ${
                    activeResultIndex === idx
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {item.original_filename} ({item.violation_count} violations)
                </button>
              ))}
            </div>
          )}

          {/* Current Active Result Display */}
          {currentAnalysis && (
            <div className="space-y-6">
              {/* Analysis Meta Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/70">
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
                    File Name
                  </span>
                  <span className="text-sm font-semibold text-slate-800 truncate block">
                    {currentAnalysis.original_filename}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
                    Status
                  </span>
                  <div className="mt-0.5">
                    <StatusBadge status={currentAnalysis.status} />
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
                    Total Detections
                  </span>
                  <span className="text-sm font-bold text-slate-800">
                    {currentAnalysis.total_detections}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
                    Safety Violations
                  </span>
                  <span
                    className={`text-sm font-bold ${
                      currentAnalysis.violation_count > 0
                        ? 'text-rose-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {currentAnalysis.violation_count}
                  </span>
                </div>
              </div>

              {/* Media Preview & Details Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Visual Preview */}
                <div className="lg:col-span-7">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Annotated Output ({currentAnalysis.media_type})
                    </span>
                    <a
                      href={getOutputUrl(currentAnalysis.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      Open in new tab <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <MediaPreview
                    src={getOutputUrl(currentAnalysis.id)}
                    mediaType={currentAnalysis.media_type}
                    alt={currentAnalysis.original_filename}
                  />

                  {/* Action buttons */}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadReport(
                          currentAnalysis.id,
                          currentAnalysis.original_filename
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-2xs transition cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      Download CSV Report
                    </button>

                    <Link
                      to={`/history/${currentAnalysis.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Full Analysis Inspection
                    </Link>
                  </div>
                </div>

                {/* Detected Objects List */}
                <div className="lg:col-span-5 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Detections List ({currentAnalysis.detections?.length || 0})
                    </span>
                  </div>

                  <div className="flex-1 bg-slate-50/70 rounded-xl border border-slate-200/80 p-3 max-h-[460px] overflow-y-auto divide-y divide-slate-100">
                    {currentAnalysis.detections && currentAnalysis.detections.length > 0 ? (
                      currentAnalysis.detections.map((det) => (
                        <div
                          key={det.id}
                          className="py-2.5 px-2 flex items-center justify-between hover:bg-white rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {det.is_violation ? (
                              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                            ) : (
                              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">
                                {det.class_label}
                              </p>
                              {det.timestamp_seconds !== null && det.timestamp_seconds !== undefined && (
                                <p className="text-[10px] text-slate-400">
                                  Time: {det.timestamp_seconds.toFixed(1)}s (Frame {det.frame_number})
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono text-slate-500">
                              {(det.confidence * 100).toFixed(1)}%
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                det.is_violation
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {det.is_violation ? 'Violation' : 'Safe'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-12 text-center text-slate-400 text-xs">
                        No individual detection bounding boxes registered
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
