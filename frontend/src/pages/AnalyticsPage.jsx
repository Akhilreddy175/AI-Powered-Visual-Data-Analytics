import { useState, useEffect, useCallback } from 'react';
import {
  getViolations,
  getMediaComparison,
  getConfidenceDistribution,
  getTimeline,
} from '../services/api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Scale,
  Gauge,
  Info,
  Filter,
  RotateCcw,
  Loader2,
  AlertCircle,
} from 'lucide-react';

const PALETTE = [
  '#ef4444',
  '#f59e0b',
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#6366f1',
];

export default function AnalyticsPage() {
  const [violations, setViolations] = useState([]);
  const [mediaComparison, setMediaComparison] = useState([]);
  const [confidenceData, setConfidenceData] = useState([]);
  const [timelineData, setTimelineData] = useState([]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [confidenceViolationsOnly, setConfidenceViolationsOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const filterParams = {};
      if (dateFrom) filterParams.date_from = dateFrom;
      if (dateTo) filterParams.date_to = dateTo;
      if (mediaType) filterParams.media_type = mediaType;

      const [violRes, compRes, confRes, timeRes] = await Promise.all([
        getViolations(filterParams),
        getMediaComparison(),
        getConfidenceDistribution({
          violations_only: confidenceViolationsOnly ? 'true' : 'false',
        }),
        getTimeline(filterParams),
      ]);

      setViolations(violRes?.violations || []);
      setMediaComparison(compRes?.comparison || []);
      setConfidenceData(confRes?.distribution || []);
      setTimelineData(timeRes?.timeline || []);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
      setError('Could not fetch analytics. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, mediaType, confidenceViolationsOnly]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleResetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setMediaType('');
    setConfidenceViolationsOnly(false);
  };

  const pieData = violations.map((v) => ({
    name: v.category,
    value: v.count,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Safety & Compliance Analytics</h2>
        <p className="text-sm text-slate-500">
          Aggregated visual insights across media detections, PPE compliance rates, and confidence calibrations
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-blue-600" />
            <span>Filters:</span>
          </div>

          {/* Date From */}
          <div className="flex items-center gap-1.5 text-xs">
            <label className="text-slate-500 font-medium">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs"
            />
          </div>

          {/* Date To */}
          <div className="flex items-center gap-1.5 text-xs">
            <label className="text-slate-500 font-medium">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs"
            />
          </div>

          {/* Media Type Filter */}
          <div className="flex items-center gap-1.5 text-xs">
            <label className="text-slate-500 font-medium">Media:</label>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-xs"
            >
              <option value="">All Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
          </div>
        </div>

        {(dateFrom || dateTo || mediaType) && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear Filters
          </button>
        )}
      </div>

      {/* Frame-level explanation notice */}
      <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-start gap-3 text-blue-900 text-xs">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold">Note on Detection vs Incident Counts:</span> Video
          analytics records detections on a per-frame basis (e.g. at sample intervals). A
          single worker without a helmet walking across a 10-second inspection video may generate
          multiple frame-level violation logs.
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="py-16 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
          <span className="text-sm font-medium">Aggregating visual analytics...</span>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-6">
          {/* Row 1: Category Bar & Donut Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Violations by Category */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800 text-sm">
                  Violations by Category
                </h3>
              </div>

              {violations.length > 0 ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={violations}
                      margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="category"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        angle={-20}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Violations"
                        fill="#ef4444"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex flex-col items-center justify-center text-slate-400">
                  <BarChart3 className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-sm">No violation records match the criteria</p>
                </div>
              )}
            </div>

            {/* Violation Category Share (Donut) */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <PieChartIcon className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800 text-sm">
                  Violation Category Distribution
                </h3>
              </div>

              {pieData.length > 0 ? (
                <div className="h-72 w-full flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((_, index) => (
                          <Cell
                            key={`pie-cell-${index}`}
                            fill={PALETTE[index % PALETTE.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex flex-col items-center justify-center text-slate-400">
                  <PieChartIcon className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-sm">No category distribution available</p>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Media Comparison & Confidence Score Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Image vs Video Comparison */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-slate-800 text-sm">
                  Image vs Video Comparison
                </h3>
              </div>

              {mediaComparison.length > 0 ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={mediaComparison}
                      margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="media_type"
                        tick={{ fontSize: 12, fill: '#64748b' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        dataKey="analysis_count"
                        name="Analyses"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="total_violations"
                        name="Violations"
                        fill="#ef4444"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex flex-col items-center justify-center text-slate-400">
                  <Scale className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-sm">No media comparison data</p>
                </div>
              )}
            </div>

            {/* Confidence Score Distribution */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-slate-800 text-sm">
                    Confidence Score Distribution
                  </h3>
                </div>

                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confidenceViolationsOnly}
                    onChange={(e) => setConfidenceViolationsOnly(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500/20"
                  />
                  <span>Violations only</span>
                </label>
              </div>

              {confidenceData.length > 0 ? (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={confidenceData}
                      margin={{ top: 10, right: 10, left: -20, bottom: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis
                        dataKey="range"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          borderRadius: '8px',
                          color: '#fff',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Detections"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex flex-col items-center justify-center text-slate-400">
                  <Gauge className="w-8 h-8 mb-2 text-slate-300" />
                  <p className="text-sm">No confidence distribution records</p>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Detection Timeline Line Chart */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm">
                Safety Trend Timeline (Detections vs Violations)
              </h3>
            </div>

            {timelineData.length > 0 ? (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={timelineData}
                    margin={{ top: 10, right: 20, left: -10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderRadius: '8px',
                        color: '#fff',
                        fontSize: '12px',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Line
                      type="monotone"
                      dataKey="detections"
                      name="Total Detections"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="violations"
                      name="Violations"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                <TrendingUp className="w-8 h-8 mb-2 text-slate-300" />
                <p className="text-sm">No timeline activity logged for selected dates</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
