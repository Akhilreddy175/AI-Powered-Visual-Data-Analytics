import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Calendar, Shield, Cpu, Server, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800">Account & System Settings</h2>
        <p className="text-sm text-slate-500">
          Manage your operator profile and inspect SafeVision AI platform parameters
        </p>
      </div>

      {/* User Profile Card */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white font-bold text-xl flex items-center justify-center shadow-md shadow-blue-500/20">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{user?.name || 'Operator'}</h3>
            <p className="text-sm text-slate-500">{user?.email || 'operator@safevision.ai'}</p>
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active Session
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <User className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Full Name
              </p>
              <p className="text-sm font-semibold text-slate-800">{user?.name || '-'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <Mail className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Email Address
              </p>
              <p className="text-sm font-semibold text-slate-800">{user?.email || '-'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <Calendar className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Member Since
              </p>
              <p className="text-sm font-semibold text-slate-800">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Active Member'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <Shield className="w-5 h-5 text-slate-400" />
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                Role
              </p>
              <p className="text-sm font-semibold text-slate-800">
                {user?.is_admin ? 'Administrator' : 'Safety Inspector'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* App & AI System Info */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <h3 className="font-semibold text-sm text-slate-800 uppercase tracking-wider">
          Platform Architecture & Model Specs
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
            <Cpu className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Detection Engine</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">YOLOv8 Computer Vision</p>
              <p className="text-xs text-slate-500 mt-1">Multi-class PPE compliance weights</p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
            <Server className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Backend Server</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">Flask API Service</p>
              <p className="text-xs text-slate-500 mt-1">Proxying via localhost:5000</p>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Compliance Classes</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">Hardhat, Vest, Mask, Boots</p>
              <p className="text-xs text-slate-500 mt-1">NO-Hardhat, NO-Vest violation checks</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
