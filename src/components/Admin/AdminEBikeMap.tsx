import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { EBikeDevice, DriverProfile, ShuttleStation, OperationalZone } from '../../types';
import { subscribeToEBikes } from '../../services/ebikeService';
import { listenToShuttleStations, DEFAULT_STATION_RADIUS_METERS } from '../../services/stationService';
import { listenToOperationalZones, findNearestZone } from '../../services/zoneService';
import { useBackHandler } from '../../contexts/NativeBackContext';
import {
  Bike,
  Compass,
  Search,
  User,
  MapPin,
  Landmark,
} from 'lucide-react';

interface AdminEBikeMapProps {
  ebikes?: EBikeDevice[];
  drivers?: DriverProfile[];
  onSelectDevice?: (deviceId: string) => void;
  onNavigateToStations?: () => void;
  className?: string;
  height?: string;
}

export const AdminEBikeMap: React.FC<AdminEBikeMapProps> = ({
  ebikes: propEbikes,
  drivers: propDrivers,
  onSelectDevice,
  onNavigateToStations,
  className = 'w-full h-full min-h-[500px]',
  height,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const stationsGroupRef = useRef<L.LayerGroup | null>(null);

  const [ebikes, setEbikes] = useState<EBikeDevice[]>(propEbikes || []);
  const [drivers, setDrivers] = useState<DriverProfile[]>(propDrivers || []);
  const [stations, setStations] = useState<ShuttleStation[]>([]);
  const [zones, setZones] = useState<OperationalZone[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<EBikeDevice | null>(null);

  // Native back handler for device detail bottom sheet/card
  useBackHandler(
    selectedDevice !== null,
    () => {
      setSelectedDevice(null);
      return true;
    },
    18,
    'ebike-map-device'
  );

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'IN_USE' | 'AVAILABLE' | 'MAINTENANCE'>('ALL');
  const [filterZoneId, setFilterZoneId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Synchronize from props or Firestore subscription
  useEffect(() => {
    if (propEbikes) {
      setEbikes(propEbikes);
    } else {
      const unsubBikes = subscribeToEBikes((bikes) => setEbikes(bikes));
      return () => unsubBikes();
    }
  }, [propEbikes]);

  useEffect(() => {
    const unsubZones = listenToOperationalZones((zList) => setZones(zList));
    return () => unsubZones();
  }, []);

  const getBikeZoneName = (bike: EBikeDevice): string => {
    if (bike.zoneName) return bike.zoneName;
    if (bike.zoneId) {
      const found = zones.find((z) => z.id === bike.zoneId);
      if (found) return found.name;
    }
    if (bike.location?.latitude && bike.location?.longitude && zones.length > 0) {
      const nearest = findNearestZone(bike.location.latitude, bike.location.longitude, zones, stations);
      if (nearest.nearestZone) return nearest.nearestZone.name;
    }
    return 'General Zone';
  };

  useEffect(() => {
    if (propDrivers) {
      setDrivers(propDrivers);
    } else {
      const driversRef = collection(db, 'drivers');
      const unsubDrivers = onSnapshot(
        driversRef,
        (snap) => {
          const drvs: DriverProfile[] = snap.docs.map((d) => ({
            ...(d.data() as DriverProfile),
            uid: d.id,
          }));
          setDrivers(drvs);
        },
        (err) => console.error('Error fetching drivers for map:', err)
      );
      return () => unsubDrivers();
    }
  }, [propDrivers]);

  useEffect(() => {
    const unsubStations = listenToShuttleStations((list) => setStations(list));
    return () => unsubStations();
  }, []);

  // Initialize Leaflet Map instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Default center Metropolitan Manila
      const defaultCenter: [number, number] = [14.5547, 121.0244];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: false,
      });

      // OpenStreetMap Standard Tile Layer (No API Key Required)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      stationsGroupRef.current = L.layerGroup().addTo(map);
      markersGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      // Invalidate size after layout mounts to guarantee correct sizing
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 150);
    }

    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Filter E-Bikes based on search query, status & zone
  const filteredEbikes = ebikes.filter((bike) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      bike.name?.toLowerCase().includes(q) ||
      bike.deviceId?.toLowerCase().includes(q) ||
      bike.serialNumber?.toLowerCase().includes(q) ||
      bike.currentDriverName?.toLowerCase().includes(q) ||
      bike.lastRfidCardUid?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (filterZoneId !== 'ALL') {
      const zoneName = getBikeZoneName(bike);
      const matchedZone = zones.find((z) => z.id === filterZoneId);
      const matchesId = bike.zoneId === filterZoneId;
      const matchesName = matchedZone && (bike.zoneName === matchedZone.name || zoneName === matchedZone.name);
      if (!matchesId && !matchesName) return false;
    }

    if (filterStatus === 'IN_USE') return bike.status === 'IN_USE' || !!bike.currentDriverId;
    if (filterStatus === 'AVAILABLE') return bike.status === 'AVAILABLE' && !bike.currentDriverId;
    if (filterStatus === 'MAINTENANCE') return bike.status === 'MAINTENANCE';

    return true;
  });

  // Render E-Bike markers on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    const boundsPoints: [number, number][] = [];

    filteredEbikes.forEach((bike) => {
      // Get location or default coords
      const lat = bike.location?.latitude || 14.5995;
      const lng = bike.location?.longitude || 120.9842;

      boundsPoints.push([lat, lng]);

      // Determine Driver info
      const assignedDriver = drivers.find(
        (d) => d.uid === bike.currentDriverId || d.activeEbikeId === bike.deviceId
      );
      const driverName = assignedDriver?.fullName || bike.currentDriverName || 'Unassigned';

      // Custom DivIcon based on status
      let iconHtml = '';
      if (bike.status === 'IN_USE' || bike.currentDriverId) {
        // Active duty
        iconHtml = `
          <div class="relative flex items-center gap-1.5 bg-white border-2 border-[#2196F3] text-[#0D47A1] font-extrabold text-[10px] px-2.5 py-1 rounded-full shadow-xl cursor-pointer hover:scale-105 transition-transform">
            <span class="w-2 h-2 bg-[#2196F3] rounded-full animate-ping shrink-0"></span>
            <div class="flex flex-col leading-tight">
              <span class="text-[9px] text-[#0D47A1] font-black uppercase tracking-wider">${bike.name}</span>
              <span class="text-[8px] text-slate-500 truncate max-w-[80px]">👤 ${driverName}</span>
            </div>
          </div>
        `;
      } else if (bike.status === 'MAINTENANCE') {
        // Maintenance
        iconHtml = `
          <div class="relative flex items-center gap-1.5 bg-white border-2 border-rose-500 text-rose-700 font-extrabold text-[10px] px-2.5 py-1 rounded-full shadow-xl cursor-pointer hover:scale-105 transition-transform">
            <span class="w-2 h-2 bg-rose-500 rounded-full shrink-0"></span>
            <span class="text-[9px] font-bold">${bike.name} (Service)</span>
          </div>
        `;
      } else {
        // Available / Idle
        iconHtml = `
          <div class="relative flex items-center gap-1.5 bg-white border-2 border-[#90CAF9] text-[#0D47A1] font-extrabold text-[10px] px-2.5 py-1 rounded-full shadow-xl cursor-pointer hover:scale-105 transition-transform">
            <span class="w-2 h-2 bg-[#2196F3] rounded-full shrink-0"></span>
            <div class="flex flex-col leading-tight">
              <span class="text-[9px] text-[#0D47A1] font-black uppercase">${bike.name}</span>
              <span class="text-[8px] text-slate-400">IDLE STANDBY</span>
            </div>
          </div>
        `;
      }

      const customIcon = L.divIcon({
        className: 'custom-ebike-map-icon',
        html: iconHtml,
        iconSize: [120, 36],
        iconAnchor: [60, 18],
      });

      // Format Last Ping time
      let lastPingStr = 'Active';
      if (bike.location?.updatedAt) {
        lastPingStr = new Date(bike.location.updatedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      } else if (bike.updatedAt?.seconds) {
        lastPingStr = new Date(bike.updatedAt.seconds * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      // Popup Content
      const popupHtml = `
        <div class="p-2 min-w-[200px] text-[#0D47A1] font-sans">
          <div class="flex items-center justify-between border-b border-[#90CAF9]/40 pb-1.5 mb-1.5">
            <span class="font-black text-xs uppercase text-[#0D47A1]">${bike.name}</span>
            <span class="text-[9px] font-mono font-bold bg-[#E3F2FD] text-[#0D47A1] px-1.5 py-0.5 rounded">${bike.deviceId}</span>
          </div>
          <div class="text-[11px] space-y-1">
            <p><b>Plate / Serial:</b> ${bike.serialNumber || 'N/A'}</p>
            <p><b>Status:</b> <span class="uppercase font-bold ${
              bike.currentDriverId ? 'text-[#2196F3]' : 'text-slate-600'
            }">${bike.currentDriverId ? 'IN USE' : bike.status}</span></p>
            <p><b>Active Driver:</b> ${driverName}</p>
            <p><b>Operating Zone:</b> <span class="text-[#0D47A1] font-bold">${getBikeZoneName(bike)}</span></p>
            <p><b>Live Speed:</b> ${bike.speedKmH ? bike.speedKmH.toFixed(1) : '0.0'} km/h</p>
            <p><b>Last RFID Tag:</b> <code class="font-mono bg-[#E3F2FD] text-[#0D47A1] px-1 py-0.5 rounded">${
              bike.lastRfidCardUid || 'None'
            }</code></p>
            <p class="text-[9px] text-slate-500 pt-1 border-t border-[#90CAF9]/40 mt-1">GPS Updated: ${lastPingStr}</p>
          </div>
        </div>
      `;

      const marker = L.marker([lat, lng], { icon: customIcon })
        .bindPopup(popupHtml)
        .addTo(markersGroup);

      marker.on('click', () => {
        setSelectedDevice(bike);
        if (onSelectDevice) onSelectDevice(bike.deviceId);
      });
    });

    // Auto-fit bounds if we have points and map is loaded
    if (boundsPoints.length > 0) {
      map.fitBounds(boundsPoints, { padding: [50, 50], maxZoom: 16 });
    }
  }, [filteredEbikes, drivers]);

  // Render Designated Stations & Catchment Circles on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const stationsGroup = stationsGroupRef.current;
    if (!map || !stationsGroup) return;

    stationsGroup.clearLayers();

    stations.forEach((st) => {
      const isActive = st.isActive !== false;
      const isDropoffOnly = st.allowedType === 'dropoff_only' || (st.allowDropoff && !st.allowPickup);

      const badgeBg = !isActive
        ? 'bg-slate-400 border-slate-200'
        : isDropoffOnly
        ? 'bg-purple-700 border-white'
        : 'bg-[#0D47A1] border-white';

      const stationIcon = L.divIcon({
        className: 'custom-station-map-icon',
        html: `
          <div class="flex items-center gap-1.5 ${badgeBg} text-white font-black text-[9px] px-2 py-0.5 rounded-full border-2 shadow-lg uppercase tracking-wider whitespace-nowrap cursor-pointer hover:scale-105 transition-transform">
            <span class="w-1.5 h-1.5 ${isActive ? (isDropoffOnly ? 'bg-amber-300' : 'bg-emerald-400') : 'bg-slate-300'} rounded-full"></span>
            <span>${st.name}</span>
          </div>
        `,
        iconSize: [110, 24],
        iconAnchor: [55, 24],
      });

      const marker = L.marker([st.latitude, st.longitude], { icon: stationIcon });
      marker.bindPopup(`
        <div class="p-1 space-y-1 text-xs text-[#0D47A1]">
          <div class="font-black text-xs">${st.name}</div>
          <div class="text-[10px] text-slate-500">${st.address}</div>
          <div class="text-[9px] font-bold text-[#0D47A1]">Catchment: ${st.radiusMeters || DEFAULT_STATION_RADIUS_METERS}m</div>
        </div>
      `);
      marker.addTo(stationsGroup);

      // Catchment radius circle
      L.circle([st.latitude, st.longitude], {
        radius: st.radiusMeters || DEFAULT_STATION_RADIUS_METERS,
        color: isActive ? (isDropoffOnly ? '#7B1FA2' : '#0D47A1') : '#94A3B8',
        fillColor: isActive ? (isDropoffOnly ? '#AB47BC' : '#2196F3') : '#CBD5E1',
        fillOpacity: 0.1,
        weight: 1.5,
        dashArray: '3, 3',
      }).addTo(stationsGroup);
    });
  }, [stations]);

  // Recenter / Fit All Bounds
  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const points: [number, number][] = filteredEbikes
      .map((b) => [b.location?.latitude || 14.5995, b.location?.longitude || 120.9842] as [number, number]);

    if (points.length > 0) {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView([14.5995, 120.9842], 13);
    }
  };

  // Fly to specific E-Bike
  const handleFlyToBike = (bike: EBikeDevice) => {
    setSelectedDevice(bike);
    if (onSelectDevice) onSelectDevice(bike.deviceId);

    const map = mapInstanceRef.current;
    if (!map) return;

    const lat = bike.location?.latitude || 14.5995;
    const lng = bike.location?.longitude || 120.9842;
    map.flyTo([lat, lng], 17, { duration: 1.2 });
  };

  // Stats Counters
  const inUseCount = ebikes.filter((b) => b.status === 'IN_USE' || !!b.currentDriverId).length;
  const availableCount = ebikes.filter((b) => b.status === 'AVAILABLE' && !b.currentDriverId).length;
  const maintenanceCount = ebikes.filter((b) => b.status === 'MAINTENANCE').length;

  return (
    <div className={`relative rounded-3xl overflow-hidden border-2 border-[#0D47A1] shadow-2xl flex flex-col bg-[#E3F2FD] ${className}`} style={{ height: height || '560px' }}>
      {/* MAP TOP OVERLAY CONTROLS BAR */}
      <div className="z-10 bg-white/95 backdrop-blur-md border-b-2 border-[#0D47A1] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 text-xs font-black text-[#0D47A1] uppercase tracking-wider shrink-0 mr-2">
            <Bike className="w-4 h-4 text-[#0D47A1]" />
            <span>Live Map</span>
          </div>

          {/* Quick Counter Chips */}
          <button
            onClick={() => setFilterStatus('ALL')}
            title="Show all e-shuttles"
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase transition-all shrink-0 border ${
              filterStatus === 'ALL'
                ? 'bg-[#0D47A1] text-white border-[#0D47A1] font-extrabold shadow-md'
                : 'bg-white text-[#0D47A1] border-[#0D47A1] hover:bg-[#E3F2FD]'
            }`}
          >
            All ({ebikes.length})
          </button>

          <button
            onClick={() => setFilterStatus('IN_USE')}
            title="Filter by active on-duty e-shuttles"
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase transition-all shrink-0 flex items-center gap-1 border ${
              filterStatus === 'IN_USE'
                ? 'bg-[#0D47A1] text-white border-[#0D47A1] font-extrabold shadow-md'
                : 'bg-white text-[#0D47A1] border-[#0D47A1] hover:bg-[#E3F2FD]'
            }`}
          >
            <span className="w-1.5 h-1.5 bg-[#0D47A1] rounded-full animate-ping" />
            On Duty ({inUseCount})
          </button>

          <button
            onClick={() => setFilterStatus('AVAILABLE')}
            title="Filter by available e-shuttles"
            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase transition-all shrink-0 border ${
              filterStatus === 'AVAILABLE'
                ? 'bg-[#0D47A1] text-white border-[#0D47A1] font-extrabold shadow-md'
                : 'bg-white text-[#0D47A1] border-[#0D47A1] hover:bg-[#E3F2FD]'
            }`}
          >
            Available ({availableCount})
          </button>

          {maintenanceCount > 0 && (
            <button
              onClick={() => setFilterStatus('MAINTENANCE')}
              title="Filter by shuttles in maintenance"
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase transition-all shrink-0 border ${
                filterStatus === 'MAINTENANCE'
                  ? 'bg-rose-600 text-white border-rose-700 font-extrabold shadow-md'
                  : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
              }`}
            >
              Maintenance ({maintenanceCount})
            </button>
          )}

          {zones.length > 0 && (
            <select
              value={filterZoneId}
              onChange={(e) => setFilterZoneId(e.target.value)}
              className="bg-white border-2 border-[#0D47A1] text-[#0D47A1] text-[10px] font-bold rounded-xl px-2.5 py-1 focus:outline-none focus:border-[#1565C0] shrink-0"
              title="Filter by Operational Zone"
            >
              <option value="ALL">All Zones ({zones.length})</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Search Bar & Station Shortcut */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 text-[#0D47A1]/60 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search E-Shuttle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#0D47A1] placeholder:text-slate-400 focus:outline-none focus:border-[#1565C0] focus:bg-white"
            />
          </div>

          {onNavigateToStations && (
            <button
              onClick={onNavigateToStations}
              title="Open full station pinning and geofencing management"
              className="px-3 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm shrink-0 active:scale-95 transition-transform"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-300" />
              <span>Pin Stations ({stations.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* DEVICE QUICK SELECTOR HORIZONTAL CHIPS */}
      {filteredEbikes.length > 0 && (
        <div className="z-10 bg-white/90 backdrop-blur border-b border-[#0D47A1]/40 px-3 py-2 flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="text-[9px] uppercase font-bold text-slate-500 shrink-0">Find Shuttle:</span>
          {filteredEbikes.map((bike) => {
            const isSelected = selectedDevice?.deviceId === bike.deviceId;
            const isOnline = bike.status === 'IN_USE' || !!bike.currentDriverId;

            return (
              <button
                key={bike.deviceId}
                onClick={() => handleFlyToBike(bike)}
                title={`Locate ${bike.name} on map`}
                className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold flex items-center gap-1.5 shrink-0 transition-all border-2 ${
                  isSelected
                    ? 'bg-[#0D47A1] text-white border-[#0D47A1] shadow-md scale-105'
                    : isOnline
                    ? 'bg-[#E3F2FD] text-[#0D47A1] border-[#0D47A1] hover:bg-[#0D47A1] hover:text-white'
                    : 'bg-white text-[#0D47A1] border-[#0D47A1] hover:bg-[#E3F2FD]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[#0D47A1] animate-ping' : 'bg-slate-400'}`} />
                <span>{bike.name}</span>
                <span className="text-[8px] opacity-75">({bike.deviceId})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* MAP CANVAS */}
      <div
        className="map-card-wrapper relative flex-1 w-full h-full min-h-[360px] overflow-hidden isolate"
        style={{
          isolation: 'isolate',
          contain: 'paint',
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          WebkitMaskImage: '-webkit-radial-gradient(white, black)',
        }}
      >
        <div ref={mapContainerRef} className="w-full h-full relative z-0 bg-[#E3F2FD] overflow-hidden" />

        {/* Recenter Button */}
        <button
          onClick={handleRecenter}
          type="button"
          className="absolute bottom-4 right-4 z-10 bg-[#0D47A1] hover:bg-[#1565C0] text-white px-3.5 py-2 rounded-2xl text-xs font-black shadow-xl backdrop-blur active:scale-95 transition-all flex items-center gap-1.5 border border-[#0D47A1]"
          title="Center map view"
        >
          <Compass className="w-4 h-4 text-white" />
          <span className="uppercase text-[10px] tracking-wider">Recenter</span>
        </button>

        {/* SELECTED DEVICE TELEMETRY CARD OVERLAY */}
        {selectedDevice && (
          <div className="absolute top-4 left-4 z-10 max-w-xs w-full bg-white/95 backdrop-blur-xl border-2 border-[#0D47A1] text-[#0D47A1] p-4 rounded-3xl shadow-2xl space-y-3 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between border-b border-[#0D47A1]/30 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#0D47A1] text-white rounded-xl flex items-center justify-center shadow-sm">
                  <Bike className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-xs text-[#0D47A1]">{selectedDevice.name}</h4>
                  <p className="text-[9px] font-mono text-[#0D47A1] font-bold">ID: {selectedDevice.deviceId}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDevice(null)}
                className="text-slate-400 hover:text-[#0D47A1] p-1 rounded-lg bg-[#E3F2FD] text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center bg-[#F8FAFC] p-2 rounded-xl border border-[#0D47A1]/40">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Status</span>
                <span className={`font-bold text-[10px] uppercase px-2 py-0.5 rounded-full ${
                  selectedDevice.currentDriverId ? 'bg-[#E3F2FD] text-[#0D47A1] border border-[#0D47A1]' : 'bg-slate-100 text-slate-700'
                }`}>
                  {selectedDevice.currentDriverId ? 'ON DUTY' : selectedDevice.status}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] text-slate-500 font-bold uppercase">Assigned Driver</span>
                <div className="font-bold text-[#0D47A1] text-xs flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#0D47A1]" />
                  <span>{selectedDevice.currentDriverName || 'No Driver Assigned'}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] text-slate-500 font-bold uppercase">Operating Zone</span>
                <div className="font-bold text-[#0D47A1] text-xs flex items-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-[#0D47A1]" />
                  <span>{getBikeZoneName(selectedDevice)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-[#F8FAFC] p-2.5 rounded-xl border border-[#0D47A1]/40 text-[10px]">
                <div>
                  <span className="text-slate-500 font-bold uppercase block">Speed</span>
                  <span className="font-black text-[#0D47A1] text-xs">{selectedDevice.speedKmH ? selectedDevice.speedKmH.toFixed(1) : '0.0'} km/h</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase block">Plate Number</span>
                  <span className="font-bold text-[#0D47A1]">{selectedDevice.serialNumber || 'N/A'}</span>
                </div>
              </div>

              {selectedDevice.lastRfidCardUid && (
                <div className="bg-[#E3F2FD] border border-[#0D47A1] p-2 rounded-xl text-[10px] flex items-center justify-between">
                  <span className="text-[#0D47A1] font-bold uppercase">Last Scanned Card</span>
                  <code className="font-mono text-[#0D47A1] font-bold bg-white px-1.5 py-0.5 rounded border border-[#0D47A1]">
                    {selectedDevice.lastRfidCardUid}
                  </code>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
