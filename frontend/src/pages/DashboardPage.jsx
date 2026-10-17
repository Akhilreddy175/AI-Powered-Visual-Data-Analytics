import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getDashboardStats, getViolations } from '../services/api';
import KPICard from '../components/KPICard';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import {
  FileCheck2,
  Image as ImageIcon,
  Film,
  ScanEye,
  AlertTriangle,
  Award,
  Upload,
  ArrowRight,
  TrendingUp,
  PieChart as PieChartIcon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [statsRes, violationsRes] = await Promise.all([
          getDashboardStats(),
          getViolations(),
        ]);

        if (mounted) {
          setStats(statsRes);
          setViolations(violationsRes?.violations || []);
        }
      } catch (err) {
        if (mounted) {
          console.error('Error loading dashboard data:', err);
          setError('Failed to fetch dashboard statistics. Please ensure the backend server is active.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-lg w-48 mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="h-72 bg-slate-200 rounded-xl" />
          <div className="h-72 bg-slate-200 rounded-xl" />
        </div>
        <div className="h-64 bg-slate-200 rounded-xl mt-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base mb-1">Data Load Error</h3>
          <p className="text-sm">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasAnalyses = stats && stats.total_analyses > 0;

  if (!hasAnalyses) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Operational Overview</h2>
          <p className="text-sm text-slate-500">Real-time PPE safety compliance tracking</p>
        </div>

        <EmptyState
          icon={Upload}
          title="No media analyses yet"
          description="Upload job site images or inspection videos to scan for PPE compliance including helmets, safety vests, masks, and boots."
          actionLabel="Upload First Media"
          actionLink="/analyze"
        />
      </div>
    );
  }

  const pieData = violations.map((v) => ({
    name: v.category,
    value: v.count,
  }));

  const mostCommonText = stats.most_common_violation
    ? `${stats.most_common_violation.label} (${stats.most_common_violation.count})`
    : 'None';

  return (
    <div className="space-y-6">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Operational Overview</h2>
          <p className="text-sm text-slate-500">Live safety metrics and compliance indicators</p>
        </div>
        <Link
          to="/analyze"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-xs transition"
        >
          <Upload className="w-4 h-4" />
          <span>New Analysis</span>
        </Link>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="Total Analyses"
          value={stats.total_analyses}
          icon={FileCheck2}
          color="blue"
        />
        <KPICard
          title="Images Analyzed"
          value={stats.image_analyses}
          icon={ImageIcon}
          color="indigo"
        />
        <KPICard
          title="Videos Analyzed"
          value={stats.video_analyses}
          icon={Film}
          color="purple"
        />
        <KPICard
          title="Total Detections"
          value={stats.total_detections}
          icon={ScanEye}
          color="green"
        />
        <KPICard
          title="PPE Violations"
          value={stats.total_violations}
          icon={AlertTriangle}
          color="red"
        />
        <KPICard
          title="Top Violation"
          value={stats.most_common_violation ? stats.most_common_violation.label : 'None'}
          subtitle={stats.most_common_violation ? `${stats.most_common_violation.count} occurrences` : 'Safe workspace'}
          icon={Award}
          color="amber"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Violations Bar Chart */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm">
                Violations by Category
              </h3>
            </div>
            <Link
              to="/analytics"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
            >
              Details <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {violations.length > 0 ? (
            <div className="h-64 w-full">
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
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <AlertTriangle className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-sm">No safety violations recorded!</p>
            </div>
          )}
        </div>

        {/* Violations Pie/Donut Chart */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800 text-sm">
                Violation Distribution
              </h3>
            </div>
            <Link
              to="/analytics"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
            >
              Detailed Breakdown <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {pieData.length > 0 ? (
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
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
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400">
              <PieChartIcon className="w-8 h-8 mb-2 text-slate-300" />
              <p className="text-sm">No violation distribution data</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Analyses Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">
              Recent Analyses
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Latest inspections processed by the computer vision model
            </p>
          </div>
          <Link
            to="/history"
            className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200/80">
              <tr>
                <th className="px-5 py-3.5">Filename</th>
                <th className="px-5 py-3.5">Type</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Detections</th>
                <th className="px-5 py-3.5">Violations</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.recent_analyses && stats.recent_analyses.length > 0 ? (
                stats.recent_analyses.map((analysis) => (
                  <tr
                    key={analysis.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-5 py-4 font-medium text-slate-900 max-w-[200px] truncate">
                      {analysis.original_filename}
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
                      <Link
                        to={`/history/${analysis.id}`}
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 hover:underline"
                      >
                        View <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-5 py-8 text-center text-slate-400">
                    No recent analyses found
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
