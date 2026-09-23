import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  TrendingUp,
  Clock,
  Activity,
  BarChart3,
  Calendar,
  Zap,
  CheckCircle2,
  Users,
  Route,
  ChevronDown,
  Info,
  Layers,
  ArrowUpRight,
  Database,
  AlertCircle,
} from 'lucide-react';
import { Booking, DriverProfile, OperationalZone } from '../../types';
import { Tooltip } from '../Common/Tooltip';

export interface AdminAnalyticsWidgetProps {
  bookings: Booking[];
  drivers: DriverProfile[];
  zones?: OperationalZone[];
  className?: string;
  onNavigateToRides?: () => void;
}

type Timeframe = '7d' | '14d' | '30d';
type ViewMode = 'all' | 'volume' | 'peak' | 'utilization';

// Color Palette for Real Data Charts
const PALETTE = {
  primary: '#0D47A1',
  primaryLight: '#1976D2',
  cyan: '#0288D1',
  emerald: '#059669',
  emeraldLight: '#10B981',
  amber: '#D97706',
  rose: '#E11D48',
  slate: '#64748B',
  pieColors: [
    '#0D47A1',
    '#0288D1',
    '#0097A7',
    '#059669',
    '#D97706',
    '#7C3AED',
    '#DB2777',
    '#4B5563',
  ],
};

// Custom Minimalist Recharts Tooltip
const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 text-white p-3 rounded-2xl shadow-xl border border-slate-700/80 text-xs backdrop-blur-md min-w-[150px] space-y-1.5 pointer-events-none">
        <p className="font-black text-slate-300 border-b border-slate-700 pb-1 flex items-center justify-between">
          <span>{label}</span>
        </p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{ backgroundColor: entry.color || entry.fill || PALETTE.primaryLight }}
                />
                {entry.name}:
              </span>
              <span className="font-black text-white font-mono">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const AdminAnalyticsWidget: React.FC<AdminAnalyticsWidgetProps> = ({
  bookings,
  drivers,
  zones = [],
  className = '',
  onNavigateToRides,
}) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');
  const [viewMode, setViewMode] = useState<ViewMode>('all');

  // Helper to extract clean Date from Firestore Timestamp or string
  const getBookingDate = (b: Booking): Date | null => {
    if (!b) return null;
    const ts = b.createdAt || b.startedAt || b.completedAt || b.acceptedAt;
    if (ts) {
      if (typeof ts === 'object' && 'seconds' in ts) {
        return new Date(ts.seconds * 1000);
      }
      const d = new Date(ts);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  // 1. PURE PRODUCTION: Daily Ride Volume Data computed strictly from real Firestore bookings
  const dailyVolumeData = useMemo(() => {
    const daysCount = timeframe === '7d' ? 7 : timeframe === '14d' ? 14 : 30;
    const now = new Date();
    const result: Array<{
      date: string;
      rawDate: string;
      completed: number;
      cancelled: number;
      active: number;
      total: number;
      avgDistance: number;
    }> = [];

    // Group real bookings by date key (YYYY-MM-DD)
    const statsByDate: Record<
      string,
      { completed: number; cancelled: number; active: number; total: number; totalDistance: number }
    > = {};

    bookings.forEach((b) => {
      const bookingDate = getBookingDate(b);
      if (bookingDate) {
        const key = bookingDate.toISOString().split('T')[0];
        if (!statsByDate[key]) {
          statsByDate[key] = { completed: 0, cancelled: 0, active: 0, total: 0, totalDistance: 0 };
        }
        statsByDate[key].total += 1;
        statsByDate[key].totalDistance += Number(b.distanceKm) || 0;

        if (b.status === 'COMPLETED') {
          statsByDate[key].completed += 1;
        } else if (b.status === 'CANCELLED') {
          statsByDate[key].cancelled += 1;
        } else {
          statsByDate[key].active += 1;
        }
      }
    });

    // Populate daily entries for the selected timeframe window
    for (let i = daysCount - 1; i >= 0; i--) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() - i);
      const key = targetDate.toISOString().split('T')[0];
      const formattedLabel = targetDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      const entry = statsByDate[key];
      const completed = entry?.completed || 0;
      const cancelled = entry?.cancelled || 0;
      const active = entry?.active || 0;
      const total = entry?.total || 0;
      const avgDistance =
        total > 0 && entry?.totalDistance ? Number((entry.totalDistance / total).toFixed(1)) : 0;

      result.push({
        date: formattedLabel,
        rawDate: key,
        completed,
        cancelled,
        active,
        total,
        avgDistance,
      });
    }

    return result;
  }, [bookings, timeframe]);

  // 2. PURE PRODUCTION: Peak Booking Hours computed strictly from real Firestore booking creation times
  const peakHoursData = useMemo(() => {
    // 05:00 to 22:00 operational window (Tagaytay E-Shuttle operation schedule)
    const hours = Array.from({ length: 18 }, (_, i) => i + 5);
    const hourlyCounts: Record<number, { count: number; completed: number; cancelled: number }> = {};

    hours.forEach((h) => {
      hourlyCounts[h] = { count: 0, completed: 0, cancelled: 0 };
    });

    bookings.forEach((b) => {
      const d = getBookingDate(b);
      if (d) {
        const hr = d.getHours();
        if (hourlyCounts[hr]) {
          hourlyCounts[hr].count += 1;
          if (b.status === 'COMPLETED') hourlyCounts[hr].completed += 1;
          else if (b.status === 'CANCELLED') hourlyCounts[hr].cancelled += 1;
        }
      }
    });

    const activeFleetCount = drivers.filter(
      (d) => d.availability === 'ONLINE' || d.availability === 'BUSY'
    ).length;
    const totalDriverFleet = drivers.length;
    const baseCapacity = activeFleetCount > 0 ? activeFleetCount : totalDriverFleet;

    return hours.map((hr) => {
      const label = `${hr > 12 ? hr - 12 : hr}:00 ${hr >= 12 ? 'PM' : 'AM'}`;
      const stats = hourlyCounts[hr] || { count: 0, completed: 0, cancelled: 0 };

      return {
        hour: label,
        hourNum: hr,
        demand: stats.count,
        completed: stats.completed,
        cancelled: stats.cancelled,
        capacity: baseCapacity,
        utilizationRate:
          baseCapacity > 0 ? Math.min(100, Math.round((stats.count / baseCapacity) * 100)) : 0,
      };
    });
  }, [bookings, drivers]);

  // Determine actual real peak hour
  const realPeakHour = useMemo(() => {
    let max = 0;
    let peakEntry: { hour: string; demand: number } | null = null;
    peakHoursData.forEach((item) => {
      if (item.demand > max) {
        max = item.demand;
        peakEntry = { hour: item.hour, demand: item.demand };
      }
    });
    return peakEntry;
  }, [peakHoursData]);

  // 3. PURE PRODUCTION: Service Utilization & Regional Distribution
  const utilizationMetrics = useMemo(() => {
    const totalBookings = bookings.length;
    const completedBookings = bookings.filter((b) => b.status === 'COMPLETED');
    const cancelledBookings = bookings.filter((b) => b.status === 'CANCELLED');
    const onlineDrivers = drivers.filter(
      (d) => d.availability === 'ONLINE' || d.availability === 'BUSY'
    ).length;
    const busyDrivers = drivers.filter((d) => d.availability === 'BUSY').length;

    // Real active driver utilization rate %
    const fleetUtilizationRate =
      onlineDrivers > 0 ? Math.round((busyDrivers / onlineDrivers) * 100) : 0;

    // Real completion rate %
    const completionRate =
      totalBookings > 0 ? Math.round((completedBookings.length / totalBookings) * 100) : 0;

    // Real total distance & average distance
    const totalDistanceKm = bookings.reduce((sum, b) => sum + (Number(b.distanceKm) || 0), 0);
    const avgDistanceKm =
      completedBookings.length > 0
        ? (
            completedBookings.reduce((sum, b) => sum + (Number(b.distanceKm) || 0), 0) /
            completedBookings.length
          ).toFixed(1)
        : totalBookings > 0
        ? (totalDistanceKm / totalBookings).toFixed(1)
        : '0.0';

    // Real Pickup Zone / Station Demand Aggregation
    const locationCounts: Record<string, number> = {};
    bookings.forEach((b) => {
      const loc =
        b.pickup?.address?.trim() ||
        (b as any).pickupStationName ||
        (b as any).zoneName ||
        'Direct Pickup';

      // Shorten label for clean chart presentation if necessary
      const cleanLabel = loc.split(',')[0].trim() || 'General Zone';
      locationCounts[cleanLabel] = (locationCounts[cleanLabel] || 0) + 1;
    });

    const sortedLocations = Object.entries(locationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const totalTrackedLocations = sortedLocations.reduce((sum, [, count]) => sum + count, 0);

    const zoneDistribution = sortedLocations.map(([name, count], idx) => ({
      name,
      count,
      value:
        totalTrackedLocations > 0 ? Math.round((count / totalTrackedLocations) * 100) : 0,
      color: PALETTE.pieColors[idx % PALETTE.pieColors.length],
    }));

    return {
      totalBookings,
      completedCount: completedBookings.length,
      cancelledCount: cancelledBookings.length,
      onlineDrivers,
      busyDrivers,
      totalDrivers: drivers.length,
      fleetUtilizationRate,
      completionRate,
      totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
      avgDistanceKm,
      zoneDistribution,
    };
  }, [bookings, drivers]);

  // Summary Metrics for the selected timeframe
  const periodCompletedRides = useMemo(
    () => dailyVolumeData.reduce((acc, curr) => acc + curr.completed, 0),
    [dailyVolumeData]
  );
  const periodTotalRides = useMemo(
    () => dailyVolumeData.reduce((acc, curr) => acc + curr.total, 0),
    [dailyVolumeData]
  );
  const avgDailyRides = useMemo(
    () => (periodCompletedRides / (dailyVolumeData.length || 1)).toFixed(1),
    [periodCompletedRides, dailyVolumeData]
  );
  const peakDayEntry = useMemo(() => {
    let max = dailyVolumeData[0] || { date: 'N/A', completed: 0, total: 0 };
    dailyVolumeData.forEach((item) => {
      if (item.total > max.total) {
        max = item;
      }
    });
    return max;
  }, [dailyVolumeData]);

  return (
    <div className={`bg-white border-2 border-[#0D47A1] rounded-3xl p-4 sm:p-5 space-y-5 shadow-md ${className}`}>
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <h2 className="text-sm sm:text-base font-black text-[#0D47A1] flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#0D47A1]" />
              <span>Service Analytics</span>
            </h2>
            <div className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
              <Database className="w-3 h-3 text-emerald-600" />
              <span>Live Firestore</span>
            </div>
            <Tooltip content="Live production analytics strictly calculated from actual Firestore bookings and active driver records" position="right">
              <span className="cursor-help text-slate-400 hover:text-[#0D47A1] transition-colors p-0.5">
                <Info size={14} />
              </span>
            </Tooltip>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Real production ride volume, peak booking hours & fleet utilization
          </p>
        </div>

        {/* View Switches & Timeframe Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sub-view switcher */}
          <div className="bg-[#F1F5F9] p-1 rounded-2xl flex items-center gap-1 border border-slate-200">
            <button
              onClick={() => setViewMode('all')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                viewMode === 'all'
                  ? 'bg-[#0D47A1] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0D47A1]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setViewMode('volume')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                viewMode === 'volume'
                  ? 'bg-[#0D47A1] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0D47A1]'
              }`}
            >
              Volume
            </button>
            <button
              onClick={() => setViewMode('peak')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                viewMode === 'peak'
                  ? 'bg-[#0D47A1] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0D47A1]'
              }`}
            >
              Peak
            </button>
            <button
              onClick={() => setViewMode('utilization')}
              className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                viewMode === 'utilization'
                  ? 'bg-[#0D47A1] text-white shadow-sm'
                  : 'text-slate-600 hover:text-[#0D47A1]'
              }`}
            >
              Capacity
            </button>
          </div>

          {/* Timeframe selector */}
          <div className="bg-[#F8FAFC] border-2 border-[#0D47A1]/30 rounded-2xl p-0.5 flex items-center">
            {(['7d', '14d', '30d'] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2.5 py-1 rounded-xl text-xs font-black transition-all ${
                  timeframe === tf
                    ? 'bg-[#0D47A1] text-white shadow-xs'
                    : 'text-slate-600 hover:text-[#0D47A1]'
                }`}
              >
                {tf === '7d' ? '7 Days' : tf === '14d' ? '14 Days' : '30 Days'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric Stat Highlights Computed Strictly From Production State */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#F8FAFC] border border-[#0D47A1]/20 rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#0D47A1]">Period Rides</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#0D47A1]" />
          </div>
          <div className="text-xl font-black text-[#0D47A1]">
            {periodCompletedRides}
            <span className="text-xs text-slate-400 font-bold ml-1">/ {periodTotalRides} total</span>
          </div>
          <p className="text-[10px] text-slate-500 font-medium">~{avgDailyRides} rides/day</p>
        </div>

        <div className="bg-[#F8FAFC] border border-[#0D47A1]/20 rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-[#0D47A1]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#0D47A1]">Peak Hour</span>
            <Clock className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-700">
            {realPeakHour && realPeakHour.demand > 0 ? realPeakHour.hour : 'No Rides Yet'}
          </div>
          <p className="text-[10px] text-slate-500 font-medium">
            {realPeakHour && realPeakHour.demand > 0
              ? `${realPeakHour.demand} rides recorded`
              : 'Awaiting trip volume'}
          </p>
        </div>

        <div className="bg-[#F8FAFC] border border-[#0D47A1]/20 rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800">Success Rate</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-700">{utilizationMetrics.completionRate}%</div>
          <p className="text-[10px] text-slate-500 font-medium">
            {utilizationMetrics.completedCount} completed of {utilizationMetrics.totalBookings}
          </p>
        </div>

        <div className="bg-[#F8FAFC] border border-[#0D47A1]/20 rounded-2xl p-3 space-y-1">
          <div className="flex items-center justify-between text-[#0D47A1]">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#0D47A1]">Fleet Usage</span>
            <Zap className="w-3.5 h-3.5 text-[#0D47A1]" />
          </div>
          <div className="text-xl font-black text-[#0D47A1]">
            {utilizationMetrics.fleetUtilizationRate}%
          </div>
          <p className="text-[10px] text-slate-500 font-medium">
            {utilizationMetrics.busyDrivers} busy / {utilizationMetrics.onlineDrivers} online
          </p>
        </div>
      </div>

      {/* Main Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* CHART 1: Real Daily Ride Volume */}
        {(viewMode === 'all' || viewMode === 'volume') && (
          <div className={`space-y-3 ${viewMode === 'volume' ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Route className="w-4 h-4 text-[#0D47A1]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1]">
                  Daily Ride Volume ({timeframe.toUpperCase()})
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-500">
                {peakDayEntry && peakDayEntry.total > 0
                  ? `Peak: ${peakDayEntry.date} (${peakDayEntry.total} trips)`
                  : 'Zero baseline'}
              </span>
            </div>

            <div className="h-64 sm:h-72 w-full bg-[#F8FAFC] p-3 rounded-2xl border border-slate-200 relative">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyVolumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCompletedReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PALETTE.primary} stopOpacity={0.9} />
                      <stop offset="95%" stopColor={PALETTE.primaryLight} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingBottom: '8px' }}
                  />
                  <Bar
                    dataKey="completed"
                    name="Completed Rides"
                    fill={PALETTE.primary}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="cancelled"
                    name="Cancelled Rides"
                    fill={PALETTE.rose}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Total Demand"
                    stroke={PALETTE.amber}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: PALETTE.amber }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* CHART 2: Real Peak Booking Hours */}
        {(viewMode === 'all' || viewMode === 'peak') && (
          <div className={`space-y-3 ${viewMode === 'peak' ? 'lg:col-span-2' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#0D47A1]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1]">
                  Peak Booking Hours (Hourly Demand)
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-500" />
                <span className="text-[10px] font-bold text-slate-500">
                  {realPeakHour && realPeakHour.demand > 0
                    ? `Highest: ${realPeakHour.hour}`
                    : 'Real-time telemetry'}
                </span>
              </div>
            </div>

            <div className="h-64 sm:h-72 w-full bg-[#F8FAFC] p-3 rounded-2xl border border-slate-200">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={peakHoursData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorDemandReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={PALETTE.cyan} stopOpacity={0.7} />
                      <stop offset="95%" stopColor={PALETTE.cyan} stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 9, fill: '#64748B', fontWeight: 600 }}
                    interval={2}
                    tickLine={false}
                    axisLine={{ stroke: '#CBD5E1' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: '#64748B', fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsTooltip content={<CustomChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', paddingBottom: '8px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="demand"
                    name="Passenger Requests"
                    stroke={PALETTE.cyan}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorDemandReal)"
                  />
                  <Line
                    type="stepAfter"
                    dataKey="capacity"
                    name="Active Driver Capacity"
                    stroke={PALETTE.emerald}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* CHART 3: Real Service Utilization & Location Distribution */}
        {(viewMode === 'all' || viewMode === 'utilization') && (
          <div className="lg:col-span-2 space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#0D47A1]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-[#0D47A1]">
                  Service Utilization & Route Distribution
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-500">
                Avg Distance: {utilizationMetrics.avgDistanceKm} km / trip • Total: {utilizationMetrics.totalDistanceKm} km
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pickup Location Distribution */}
              <div className="bg-[#F8FAFC] p-4 rounded-2xl border border-slate-200 flex flex-col items-center justify-center space-y-2">
                <span className="text-[11px] font-black text-[#0D47A1] uppercase tracking-wider">
                  Pickup Location Demand
                </span>

                {utilizationMetrics.zoneDistribution.length === 0 ? (
                  <div className="h-44 w-full flex flex-col items-center justify-center text-slate-400 text-center p-3">
                    <Layers className="w-8 h-8 mb-1 text-slate-300" />
                    <p className="text-xs font-bold text-slate-500">No Location Data</p>
                    <p className="text-[10px] text-slate-400">Recorded passenger pickup points will map here.</p>
                  </div>
                ) : (
                  <>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={utilizationMetrics.zoneDistribution}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={65}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {utilizationMetrics.zoneDistribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <RechartsTooltip content={<CustomChartTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-[10px] font-bold text-slate-600 w-full max-h-24 overflow-y-auto">
                      {utilizationMetrics.zoneDistribution.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-1.5 truncate">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                            <span className="truncate">{item.name}</span>
                          </span>
                          <span className="text-slate-400 font-mono shrink-0 ml-1">
                            {item.count} ({item.value}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Driver Availability Progress */}
              <div className="bg-[#F8FAFC] p-4 rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-[#0D47A1] uppercase tracking-wider">
                      Driver Engagement
                    </span>
                    <span className="text-xs font-black text-[#0D47A1]">
                      {utilizationMetrics.fleetUtilizationRate}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Proportion of active drivers currently assigned to a passenger
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
                    <div
                      className="bg-[#0D47A1] h-full transition-all duration-500 rounded-full"
                      style={{ width: `${utilizationMetrics.fleetUtilizationRate}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                    <span>In-Trip: {utilizationMetrics.busyDrivers}</span>
                    <span>Available: {Math.max(0, utilizationMetrics.onlineDrivers - utilizationMetrics.busyDrivers)}</span>
                    <span>Online: {utilizationMetrics.onlineDrivers}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-500">Registered Fleet:</span>
                  <span className="font-black text-[#0D47A1]">
                    {utilizationMetrics.totalDrivers} Drivers
                  </span>
                </div>
              </div>

              {/* Trip Completion & Reliability */}
              <div className="bg-[#F8FAFC] p-4 rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-between">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-[#0D47A1] uppercase tracking-wider">
                      Trip Reliability
                    </span>
                    <span className="text-xs font-black text-emerald-700">
                      {utilizationMetrics.completionRate}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Percentage of requests successfully finished
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-600 h-full transition-all duration-500 rounded-full"
                      style={{ width: `${utilizationMetrics.completionRate}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600">
                    <span>Completed: {utilizationMetrics.completedCount}</span>
                    <span>Cancelled: {utilizationMetrics.cancelledCount}</span>
                    <span>Total: {utilizationMetrics.totalBookings}</span>
                  </div>
                </div>

                {onNavigateToRides ? (
                  <button
                    onClick={onNavigateToRides}
                    className="w-full py-2 bg-white hover:bg-[#E3F2FD] border-2 border-[#0D47A1] text-[#0D47A1] font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
                  >
                    <span>View Trips</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-500">Recorded Trips:</span>
                    <span className="font-black text-[#0D47A1]">{utilizationMetrics.totalBookings}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAnalyticsWidget;
