import {
  CheckCircle2, Clock, AlertTriangle, RefreshCw, Loader2,
  XCircle, FileWarning, FileCheck
} from 'lucide-react';

const STATUS_CONFIG = {
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-slate-50 text-slate-600 border-slate-200',
    iconClass: 'text-slate-400',
  },
  uploading: {
    label: 'Uploading',
    icon: Loader2,
    className: 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse',
    iconClass: 'text-blue-500 animate-spin',
  },
  extracting: {
    label: 'Extracting',
    icon: Loader2,
    className: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
    iconClass: 'text-amber-500 animate-spin',
  },
  indexing: {
    label: 'Indexing',
    icon: Loader2,
    className: 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse',
    iconClass: 'text-purple-500 animate-spin',
  },
  processing: {
    label: 'Processing',
    icon: Loader2,
    className: 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse',
    iconClass: 'text-amber-500 animate-spin',
  },
  completed: {
    label: 'Indexed',
    icon: CheckCircle2,
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    iconClass: 'text-emerald-600',
  },
  partial: {
    label: 'Partial',
    icon: FileWarning,
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    iconClass: 'text-orange-500',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    iconClass: 'text-rose-600',
  },
};

export default function DocStatusBadge({ status, size = 'sm' }) {
  const key = (status || '').toLowerCase();
  const config = STATUS_CONFIG[key] || {
    label: status || 'Unknown',
    icon: FileCheck,
    className: 'bg-slate-100 text-slate-600 border-slate-200',
    iconClass: 'text-slate-400',
  };

  const Icon = config.icon;
  const sizeClass = size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold border ${sizeClass} ${config.className}`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 ${config.iconClass}`} />
      {config.label}
    </span>
  );
}
