import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityLog,
  ActivityAction,
  ActivityEntityType,
  listenToActivityLogs,
  exportLogsToCSV,
  exportLogsToJSON,
  clearAllActivityLogs,
} from '../../services/activityLogService';
import {
  Search,
  Filter,
  Download,
  Trash2,
  RefreshCw,
  Clock,
  Shield,
  ShieldCheck,
  User,
  MapPin,
  Layers,
  Cpu,
  Route,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  Calendar,
  Eye,
  Sliders,
  Database,
  ArrowRight,
  Activity,
  UserCheck,
  Key,
  BookOpen,
} from 'lucide-react';

interface ActivityLogsViewProps {
  onOpenTutorial?: () => void;
}

export const ActivityLogsView: React.FC<ActivityLogsViewProps> = ({ onOpenTutorial }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEntity, setSelectedEntity] = useState<string>('ALL');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [timeframe, setTimeframe] = useState<'ALL' | 'TODAY' | '24H' | '7D'>('ALL');
  const [inspectingLog, setInspectingLog] = useState<ActivityLog | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);

  // Subscribe to real-time activity logs
  useEffect(() => {
    setLoading(true);
    const unsubscribe = listenToActivityLogs((updatedLogs) => {
      setLogs(updatedLogs);
      setLoading(false);
    }, 300);

    return () => unsubscribe();
  }, []);

  // Filter logs
  const filteredLogs = useMemo(() => {
    const now = Date.now();
    return logs.filter((log) => {
      // Entity Filter
      if (selectedEntity !== 'ALL' && log.entityType !== selectedEntity) {
        return false;
      }

      // Action Filter
      if (selectedAction !== 'ALL') {
        if (selectedAction === 'AUTH') {
          if (!log.action.startsWith('AUTH_')) return false;
        } else if (log.action !== selectedAction) {
          return false;
        }
      }

      // Severity Filter
      if (selectedSeverity !== 'ALL' && log.severity !== selectedSeverity) {
        return false;
      }

      // Timeframe Filter
      if (timeframe !== 'ALL') {
        const logTime = new Date(log.timestamp).getTime();
        if (timeframe === 'TODAY') {
          const startOfToday = new Date().setHours(0, 0, 0, 0);
          if (logTime < startOfToday) return false;
        } else if (timeframe === '24H') {
          if (now - logTime > 24 * 60 * 60 * 1000) return false;
        } else if (timeframe === '7D') {
          if (now - logTime > 7 * 24 * 60 * 60 * 1000) return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSummary = log.summary.toLowerCase().includes(q);
        const matchesEntity = log.entityName?.toLowerCase().includes(q) || false;
        const matchesId = log.entityId?.toLowerCase().includes(q) || false;
        const matchesActor = log.performedBy.name.toLowerCase().includes(q) || (log.performedBy.email?.toLowerCase().includes(q) ?? false);
        const matchesAction = log.actionLabel.toLowerCase().includes(q);
        return matchesSummary || matchesEntity || matchesId || matchesActor || matchesAction;
      }

      return true;
    });
  }, [logs, selectedEntity, selectedAction, selectedSeverity, timeframe, searchQuery]);

  // Quick summary counts
  const stats = useMemo(() => {
    const creates = logs.filter((l) => l.action === 'CREATE').length;
    const updates = logs.filter((l) => l.action === 'UPDATE' || l.action === 'STATUS_CHANGE' || l.action === 'SETTINGS_UPDATE').length;
    const deletes = logs.filter((l) => l.action === 'DELETE').length;
    const auths = logs.filter((l) => l.action.startsWith('AUTH_')).length;
    return { total: logs.length, creates, updates, deletes, auths };
  }, [logs]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Clear confirmation handler
  const handleConfirmClear = async () => {
    setClearing(true);
    try {
      await clearAllActivityLogs();
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    } finally {
      setClearing(false);
    }
  };

  // Helper for entity icons
  const getEntityIcon = (type: ActivityEntityType) => {
    switch (type) {
      case 'STATION':
        return <MapPin className="w-4 h-4 text-emerald-600" />;
      case 'ZONE':
        return <Layers className="w-4 h-4 text-blue-600" />;
      case 'SHUTTLE':
        return <Cpu className="w-4 h-4 text-purple-600" />;
      case 'RIDE':
        return <Route className="w-4 h-4 text-amber-600" />;
      case 'DRIVER':
        return <UserCheck className="w-4 h-4 text-cyan-600" />;
      case 'USER':
        return <User className="w-4 h-4 text-indigo-600" />;
      case 'INCIDENT':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      case 'SETTINGS':
        return <Sliders className="w-4 h-4 text-slate-600" />;
      case 'AUTH':
        return <Key className="w-4 h-4 text-violet-600" />;
      case 'ADMIN':
        return <ShieldCheck className="w-4 h-4 text-[#0D47A1]" />;
      default:
        return <Activity className="w-4 h-4 text-slate-600" />;
    }
  };

  // Helper for action colors
  const getActionBadge = (action: ActivityAction) => {
    switch (action) {
      case 'CREATE':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'DELETE':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'STATUS_CHANGE':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'SETTINGS_UPDATE':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'AUTH_LOGIN':
      case 'AUTH_REGISTER':
        return 'bg-violet-100 text-violet-800 border-violet-300';
      case 'AUTH_LOGOUT':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return {
        date: d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
    } catch {
      return { date: 'N/A', time: '' };
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Banner & KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-[#0D47A1]">
            <span className="text-[10px] uppercase font-bold tracking-wider">Total Audit Logs</span>
            <Database className="w-4 h-4 text-[#0D47A1]" />
          </div>
          <div className="text-2xl font-black text-[#0D47A1]">{stats.total}</div>
          <p className="text-[10px] text-slate-500 font-medium">Real-time system events</p>
        </div>

        <div className="bg-white border-2 border-emerald-500 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10px] uppercase font-bold tracking-wider">Created Records</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700">{stats.creates}</div>
          <p className="text-[10px] text-emerald-600 font-medium">Additions & registrations</p>
        </div>

        <div className="bg-white border-2 border-blue-500 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-[10px] uppercase font-bold tracking-wider">Updates & Changes</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700">{stats.updates}</div>
          <p className="text-[10px] text-blue-600 font-medium">Edits, status, settings</p>
        </div>

        <div className="bg-white border-2 border-rose-500 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-[10px] uppercase font-bold tracking-wider">Deletions</span>
            <Trash2 className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-700">{stats.deletes}</div>
          <p className="text-[10px] text-rose-600 font-medium">Purges & removals</p>
        </div>

        <div className="bg-white border-2 border-violet-500 rounded-2xl p-4 space-y-1 shadow-md">
          <div className="flex items-center justify-between text-violet-700">
            <span className="text-[10px] uppercase font-bold tracking-wider">Auth & Security</span>
            <Shield className="w-4 h-4 text-violet-600" />
          </div>
          <div className="text-2xl font-black text-violet-700">{stats.auths}</div>
          <p className="text-[10px] text-violet-600 font-medium">Logins, signouts, signups</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        {/* Controls Toolbar: Search & Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="relative flex-1 max-w-lg">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs by keyword, entity name, ID, or user..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-[#0D47A1] focus:bg-white outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {onOpenTutorial && (
              <button
                onClick={onOpenTutorial}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-xs font-black flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
                title="Open simple walkthrough: How to use E-Shuttle"
              >
                <BookOpen className="w-3.5 h-3.5 text-slate-900" />
                <span>How to Use</span>
              </button>
            )}

            <button
              onClick={() => exportLogsToCSV(filteredLogs)}
              disabled={filteredLogs.length === 0}
              className="px-3 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 disabled:opacity-50 transition-all shadow-sm"
              title="Download filtered logs as spreadsheet (.CSV)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => exportLogsToJSON(filteredLogs)}
              disabled={filteredLogs.length === 0}
              className="px-3 py-2 bg-white border border-[#0D47A1] text-[#0D47A1] hover:bg-blue-50 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 disabled:opacity-50 transition-all shadow-sm"
              title="Download filtered logs as structured JSON (.JSON)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-2 bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-sm"
              title="Purge activity logs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Purge Cache</span>
            </button>
          </div>
        </div>

        {/* Filter Badges Row */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="font-bold text-slate-600 flex items-center gap-1">
            <Filter className="w-3 h-3 text-slate-500" /> Filters:
          </span>

          {/* Entity Type Selector */}
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-lg font-bold text-[#0D47A1] outline-none focus:border-[#0D47A1]"
          >
            <option value="ALL">All Entities</option>
            <option value="STATION">📍 Shuttle Stations</option>
            <option value="ZONE">🗺️ Service Zones</option>
            <option value="SHUTTLE">⚡ E-Shuttle Hardware</option>
            <option value="RIDE">🚗 Rides & Trips</option>
            <option value="DRIVER">👨‍✈️ Drivers</option>
            <option value="USER">👥 Customers</option>
            <option value="INCIDENT">🚨 Incidents</option>
            <option value="SETTINGS">⚙️ System Settings</option>
            <option value="AUTH">🔐 Auth & Sessions</option>
            <option value="ADMIN">🛡️ Admin & Credentials</option>
          </select>

          {/* Action Type Selector */}
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-lg font-bold text-[#0D47A1] outline-none focus:border-[#0D47A1]"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE">➕ Create / Register</option>
            <option value="UPDATE">✏️ Update / Modify</option>
            <option value="DELETE">🗑️ Delete / Purge</option>
            <option value="STATUS_CHANGE">🔄 Status Change</option>
            <option value="SETTINGS_UPDATE">⚙️ Settings Update</option>
            <option value="AUTH">🔐 Auth Events</option>
          </select>

          {/* Severity Selector */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-100 border border-slate-300 rounded-lg font-bold text-[#0D47A1] outline-none focus:border-[#0D47A1]"
          >
            <option value="ALL">All Severities</option>
            <option value="info">ℹ️ Info</option>
            <option value="success">✅ Success</option>
            <option value="warning">⚠️ Warning</option>
            <option value="danger">🛑 Critical / Danger</option>
          </select>

          {/* Timeframe Chips */}
          <div className="flex items-center gap-1 ml-auto">
            {(['ALL', 'TODAY', '24H', '7D'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                  timeframe === t
                    ? 'bg-[#0D47A1] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t === 'ALL' ? 'All Time' : t === 'TODAY' ? 'Today' : t === '24H' ? '24 Hours' : '7 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count & Backtracking indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
          <span>
            Showing <strong className="text-[#0D47A1]">{filteredLogs.length}</strong> of{' '}
            <strong>{logs.length}</strong> total records
          </span>
          <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px] font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Backtracking Active
          </span>
        </div>

        {/* Activity Logs Table / List */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#0D47A1]" />
              <p className="text-xs font-bold">Loading activity audit logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 space-y-2">
              <Database className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-bold text-slate-700">No activity logs match your filter criteria.</p>
              <p className="text-xs text-slate-400">All CRUD operations across zones, stations, shuttles, trips, and accounts will be recorded here automatically.</p>
              {(searchQuery || selectedEntity !== 'ALL' || selectedAction !== 'ALL' || selectedSeverity !== 'ALL' || timeframe !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedEntity('ALL');
                    setSelectedAction('ALL');
                    setSelectedSeverity('ALL');
                    setTimeframe('ALL');
                  }}
                  className="mt-2 px-3 py-1.5 bg-[#0D47A1] text-white rounded-lg text-xs font-bold"
                >
                  Reset All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
              {filteredLogs.map((log) => {
                const ts = formatTimestamp(log.timestamp);
                const hasStateDiff = log.details && (log.details.before || log.details.after);

                return (
                  <div
                    key={log.id}
                    className="p-3.5 sm:p-4 hover:bg-blue-50/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    {/* Left: Action Icon + Details */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Icon container */}
                      <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        {getEntityIcon(log.entityType)}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        {/* Badges row */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getActionBadge(
                              log.action
                            )}`}
                          >
                            {log.actionLabel}
                          </span>

                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                            {log.entityType}
                          </span>

                          {log.entityName && (
                            <span className="font-bold text-slate-900 truncate max-w-[200px]" title={log.entityName}>
                              {log.entityName}
                            </span>
                          )}

                          {log.entityId && (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                              ID: {log.entityId.slice(-8)}
                            </span>
                          )}
                        </div>

                        {/* Summary Description */}
                        <p className="text-slate-700 font-medium leading-relaxed break-words">{log.summary}</p>

                        {/* Actor & Timestamp */}
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap pt-0.5">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            <strong className="text-slate-700 font-semibold">{log.performedBy.name}</strong>
                            {log.performedBy.role && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {log.performedBy.role}
                              </span>
                            )}
                          </span>

                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>
                              {ts.date} at {ts.time}
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {hasStateDiff && (
                        <span className="hidden sm:inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Diff Captured
                        </span>
                      )}

                      <button
                        onClick={() => setInspectingLog(log)}
                        className="px-3 py-1.5 bg-[#E3F2FD] hover:bg-[#0D47A1] text-[#0D47A1] hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all shadow-sm group"
                        title="Inspect full audit record and state before/after for backtracking"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                        <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          AUDIT INSPECTOR & BACKTRACKING MODAL
         ========================================================================= */}
      {inspectingLog && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white border-2 border-[#0D47A1] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden space-y-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-[#0D47A1] text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  {getEntityIcon(inspectingLog.entityType)}
                </div>
                <div>
                  <h3 className="text-base font-black flex items-center gap-2">
                    <span>Audit Record & Backtracking Inspector</span>
                  </h3>
                  <p className="text-xs text-blue-100 font-medium">Log ID: {inspectingLog.id}</p>
                </div>
              </div>

              <button
                onClick={() => setInspectingLog(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-black text-sm transition-all"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Event Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Action</span>
                  <div className="mt-0.5 font-black text-slate-800 flex items-center gap-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getActionBadge(inspectingLog.action)}`}>
                      {inspectingLog.action}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Target Entity</span>
                  <div className="mt-0.5 font-bold text-slate-800">
                    {inspectingLog.entityType} {inspectingLog.entityName ? `(${inspectingLog.entityName})` : ''}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Performed By</span>
                  <div className="mt-0.5 font-bold text-slate-800 truncate" title={inspectingLog.performedBy.name}>
                    {inspectingLog.performedBy.name} ({inspectingLog.performedBy.role || 'system'})
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Timestamp</span>
                  <div className="mt-0.5 font-medium text-slate-700">
                    {new Date(inspectingLog.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Summary Description Box */}
              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#0D47A1]">Event Narrative Summary</span>
                <p className="text-sm font-semibold text-slate-800 leading-snug">{inspectingLog.summary}</p>
                {inspectingLog.details?.summary && (
                  <p className="text-xs text-slate-600 italic pt-1">{inspectingLog.details.summary}</p>
                )}
              </div>

              {/* State Diff / Changes Inspector */}
              {inspectingLog.details && (inspectingLog.details.before || inspectingLog.details.after) ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[#0D47A1]" />
                      Backtracking State Snapshot (Before vs. After)
                    </span>
                    <span className="text-[10px] text-slate-400">Captured at transaction time</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Before State */}
                    <div className="border border-rose-200 rounded-xl overflow-hidden bg-rose-50/30">
                      <div className="px-3 py-1.5 bg-rose-100/70 border-b border-rose-200 font-black text-rose-800 text-[11px] flex items-center justify-between">
                        <span>BEFORE CHANGE (State Prior)</span>
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                      </div>
                      <div className="p-3 font-mono text-[11px] text-slate-700 overflow-x-auto max-h-48">
                        {inspectingLog.details.before ? (
                          <pre>{JSON.stringify(inspectingLog.details.before, null, 2)}</pre>
                        ) : (
                          <span className="text-slate-400 italic">None (Newly created record)</span>
                        )}
                      </div>
                    </div>

                    {/* After State */}
                    <div className="border border-emerald-200 rounded-xl overflow-hidden bg-emerald-50/30">
                      <div className="px-3 py-1.5 bg-emerald-100/70 border-b border-emerald-200 font-black text-emerald-800 text-[11px] flex items-center justify-between">
                        <span>AFTER CHANGE (Current / Applied State)</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="p-3 font-mono text-[11px] text-slate-700 overflow-x-auto max-h-48">
                        {inspectingLog.details.after ? (
                          <pre>{JSON.stringify(inspectingLog.details.after, null, 2)}</pre>
                        ) : (
                          <span className="text-slate-400 italic">None (Record was permanently deleted)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 italic text-center">
                  No structural diff was required for this operational event.
                </div>
              )}

              {/* Full Raw Audit JSON Payload */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 text-xs uppercase tracking-wider">Raw Audit Record JSON</span>
                  <button
                    onClick={() => handleCopy(JSON.stringify(inspectingLog, null, 2), inspectingLog.id)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all"
                  >
                    {copiedId === inspectingLog.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-700">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-slate-500" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-slate-900 text-emerald-400 p-3 rounded-xl font-mono text-[10px] overflow-x-auto max-h-48 border border-slate-800">
                  <pre>{JSON.stringify(inspectingLog, null, 2)}</pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                Entity ID: <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-700">{inspectingLog.entityId || 'N/A'}</code>
              </span>
              <button
                onClick={() => setInspectingLog(null)}
                className="px-4 py-2 bg-[#0D47A1] text-white rounded-xl text-xs font-bold hover:bg-[#1565C0] transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRM PURGE LOGS MODAL
         ========================================================================= */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-500 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">Purge Activity Audit Logs?</h4>
                <p className="text-xs text-slate-500">This will clear historical logs from your view.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to clear historical audit logs? An entry recording this purge operation will be automatically logged to maintain accountability and compliance.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                disabled={clearing}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                {clearing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>{clearing ? 'Purging...' : 'Yes, Purge Logs'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
