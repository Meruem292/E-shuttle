import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { OperationalZone, ShuttleStation, EBikeDevice, DriverProfile } from '../../types';
import {
  listenToOperationalZones,
  addOperationalZone,
  updateOperationalZone,
  deleteOperationalZone,
} from '../../services/zoneService';
import { listenToShuttleStations } from '../../services/stationService';
import { subscribeToEBikes } from '../../services/ebikeService';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Layers,
  Search,
  Navigation2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Compass,
  Bike,
  Users,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { LocationPickerMap } from '../Common/LocationPickerMap';

export const ZoneManagement: React.FC = () => {
  const [zones, setZones] = useState<OperationalZone[]>([]);
  const [stations, setStations] = useState<ShuttleStation[]>([]);
  const [ebikes, setEbikes] = useState<EBikeDevice[]>([]);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<OperationalZone | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Form State
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [formName, setFormName] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formLat, setFormLat] = useState<string>('14.1153'); // Tagaytay region default coordinates
  const [formLng, setFormLng] = useState<string>('120.9621');
  const [formRadius, setFormRadius] = useState<number>(1500); // 1.5 km default geofence radius
  const [isPinningMode, setIsPinningMode] = useState<boolean>(false);
  const [formSaving, setFormSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete modal state
  const [zoneToDelete, setZoneToDelete] = useState<OperationalZone | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Map references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const zonesLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const tempMarkerRef = useRef<L.Marker | null>(null);

  // 1. Subscribe to Zones, Stations, EBikes, Drivers
  useEffect(() => {
    const unsubZones = listenToOperationalZones((list) => {
      setZones(list);
      setLoading(false);
    });

    const unsubStations = listenToShuttleStations((list) => {
      setStations(list);
    });

    const unsubBikes = subscribeToEBikes((list) => {
      setEbikes(list);
    });

    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      setDrivers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as DriverProfile)));
    });

    return () => {
      unsubZones();
      unsubStations();
      unsubBikes();
      unsubDrivers();
    };
  }, []);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [14.1153, 120.9621], // Tagaytay overview center
        zoom: 13,
        zoomControl: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      zonesLayerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      map.on('click', (e: L.LeafletMouseEvent) => {
        if ((window as any).__isPinningZoneMode) {
          handleSelectCoordinatesFromMap(e.latlng.lat, e.latlng.lng);
        }
      });

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

  // Sync pinning mode to window
  useEffect(() => {
    (window as any).__isPinningZoneMode = isPinningMode;
  }, [isPinningMode]);

  // 3. Render Zone Circles & Center Markers on Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = zonesLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: [number, number][] = [];

    zones.forEach((zone) => {
      if (!zone.centerLatitude || !zone.centerLongitude) return;
      const pos: [number, number] = [zone.centerLatitude, zone.centerLongitude];
      boundsPoints.push(pos);

      const isSelected = selectedZone?.id === zone.id;
      const zoneStationsCount = stations.filter((s) => s.zoneId === zone.id).length;
      const zoneBikesCount = ebikes.filter((b) => b.zoneId === zone.id).length;

      // Outer Geofence Circle
      const circle = L.circle(pos, {
        radius: zone.radiusMeters || 100,
        color: isSelected ? '#0D47A1' : '#2196F3',
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? '#0D47A1' : '#2196F3',
        fillOpacity: isSelected ? 0.15 : 0.05,
        dashArray: '6, 6',
      }).addTo(group);

      // Render Station Pins & 100m Fencing Circles ONLY for this Zone if no zone is selected OR if this is the selected zone
      const shouldRenderStationPins = !selectedZone || selectedZone.id === zone.id;
      if (shouldRenderStationPins) {
        const zoneStations = stations.filter((s) => s.zoneId === zone.id && s.isActive !== false);
        zoneStations.forEach((st) => {
          if (!st.latitude || !st.longitude) return;

          // 100m Station Pin Geofence Catchment Circle
          L.circle([st.latitude, st.longitude], {
            radius: st.radiusMeters || 100,
            color: '#10B981',
            weight: 2,
            fillColor: '#10B981',
            fillOpacity: 0.18,
          }).addTo(group);

          const pinIcon = L.divIcon({
            className: 'zone-station-pin',
            html: `
              <div class="flex items-center gap-1 bg-emerald-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full border border-white shadow-lg whitespace-nowrap">
                <span>📍</span>
                <span class="truncate max-w-[100px]">${st.name}</span>
              </div>
            `,
            iconSize: [110, 22],
            iconAnchor: [55, 22],
          });
          L.marker([st.latitude, st.longitude], { icon: pinIcon }).addTo(group);
        });
      }

      // Center Zone Badge Marker
      const zoneIcon = L.divIcon({
        className: 'custom-zone-marker',
        html: `
          <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border-2 font-black text-xs shadow-xl transition-transform ${
            isSelected
              ? 'bg-[#0D47A1] text-white border-white scale-110 ring-4 ring-[#0D47A1]/30'
              : 'bg-white text-[#0D47A1] border-[#0D47A1]'
          }">
            <span class="w-2 h-2 rounded-full ${zone.isActive !== false ? 'bg-emerald-400' : 'bg-slate-400'}"></span>
            <span class="truncate max-w-[140px]">${zone.name}</span>
          </div>
        `,
        iconSize: [160, 36],
        iconAnchor: [80, 18],
      });

      const marker = L.marker(pos, { icon: zoneIcon }).addTo(group);

      marker.on('click', () => {
        setSelectedZone(zone);
      });

      circle.on('click', () => {
        setSelectedZone(zone);
      });
    });

    // Auto-fit map bounds if zones exist
    if (boundsPoints.length > 0 && !selectedZone) {
      try {
        const bounds = L.latLngBounds(boundsPoints);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      } catch {}
    }
  }, [zones, selectedZone, stations, ebikes]);

  const handleSelectCoordinatesFromMap = (lat: number, lng: number) => {
    setFormLat(lat.toFixed(6));
    setFormLng(lng.toFixed(6));
    setIsPinningMode(false);
    setShowAddModal(true);

    const map = mapInstanceRef.current;
    if (map) {
      if (tempMarkerRef.current) {
        tempMarkerRef.current.setLatLng([lat, lng]);
      } else {
        const tempIcon = L.divIcon({
          className: 'temp-zone-pin',
          html: `<div class="w-8 h-8 rounded-full bg-rose-600 border-2 border-white shadow-xl flex items-center justify-center text-white font-black text-xs animate-bounce">📍</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        tempMarkerRef.current = L.marker([lat, lng], { icon: tempIcon }).addTo(map);
      }
      map.panTo([lat, lng]);
    }
  };

  const handleOpenAddModal = () => {
    setEditingZoneId(null);
    setFormStep(1);
    setFormName('');
    setFormDescription('');
    setFormRadius(1500);
    setFormError(null);

    // If map has a center, use that
    if (mapInstanceRef.current) {
      const center = mapInstanceRef.current.getCenter();
      setFormLat(center.lat.toFixed(6));
      setFormLng(center.lng.toFixed(6));
    }
    setShowAddModal(true);
  };

  const handleOpenEditModal = (zone: OperationalZone) => {
    setEditingZoneId(zone.id);
    setFormStep(1);
    setFormName(zone.name);
    setFormDescription(zone.description || '');
    setFormLat(zone.centerLatitude.toString());
    setFormLng(zone.centerLongitude.toString());
    setFormRadius(zone.radiusMeters || 1500);
    setFormError(null);
    setShowAddModal(true);
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Please enter a zone name.');
      return;
    }

    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);
    if (isNaN(lat) || isNaN(lng)) {
      setFormError('Please provide valid latitude and longitude coordinates.');
      return;
    }

    setFormSaving(true);
    try {
      if (editingZoneId) {
        await updateOperationalZone(editingZoneId, {
          name: formName.trim(),
          description: formDescription.trim(),
          centerLatitude: lat,
          centerLongitude: lng,
          radiusMeters: Number(formRadius) || 1500,
        });
        setNotification(`Zone "${formName}" updated.`);
      } else {
        await addOperationalZone({
          name: formName.trim(),
          code: formName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-'),
          description: formDescription.trim(),
          centerLatitude: lat,
          centerLongitude: lng,
          radiusMeters: Number(formRadius) || 1500,
          isActive: true,
        });
        setNotification(`New Zone "${formName}" created.`);
      }

      setShowAddModal(false);
      if (tempMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(tempMarkerRef.current);
        tempMarkerRef.current = null;
      }
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setFormError(err.message || 'Error saving zone');
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggleZoneActive = async (zone: OperationalZone) => {
    const nextStatus = zone.isActive === false;
    await updateOperationalZone(zone.id, { isActive: nextStatus });
    setNotification(`Zone "${zone.name}" is now ${nextStatus ? 'Active' : 'Disabled'}.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleConfirmDelete = async () => {
    if (!zoneToDelete) return;
    setIsDeleting(true);
    try {
      await deleteOperationalZone(zoneToDelete.id, zoneToDelete.name);
      setNotification(`Zone "${zoneToDelete.name}" deleted.`);
      if (selectedZone?.id === zoneToDelete.id) setSelectedZone(null);
      setZoneToDelete(null);
    } catch (err: any) {
      setNotification(`Error deleting zone: ${err.message}`);
    } finally {
      setIsDeleting(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleFocusZone = (zone: OperationalZone) => {
    setSelectedZone(zone);
    if (mapInstanceRef.current && zone.centerLatitude && zone.centerLongitude) {
      mapInstanceRef.current.setView([zone.centerLatitude, zone.centerLongitude], 15, { animate: true });
    }
  };

  const filteredZones = zones.filter((z) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      z.name.toLowerCase().includes(q) ||
      (z.description && z.description.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-200 pb-28 sm:pb-36">
      {/* Top Banner */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-[#0D47A1] rounded-full animate-pulse shrink-0" />
            <h1 className="text-lg font-black text-[#0D47A1]">Service Area Zones Management</h1>
          </div>
          <p className="text-xs text-slate-600 font-medium mt-1">
            Register and isolate distinct operational territories (e.g., <span className="font-bold text-[#0D47A1]">Tagaytay City Hall Complex</span> & <span className="font-bold text-[#0D47A1]">Tagaytay City National High School</span>). Shuttles, station pins, and drivers are restricted strictly within their assigned zone.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setIsPinningMode(!isPinningMode);
              if (!isPinningMode) {
                setNotification('Tap anywhere on the map to set the center of the new zone.');
              }
            }}
            className={`px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm ${
              isPinningMode
                ? 'bg-amber-500 text-white border-2 border-amber-600 ring-2 ring-amber-300 animate-pulse'
                : 'bg-[#E3F2FD] text-[#0D47A1] border-2 border-[#0D47A1] hover:bg-[#BBDEFB]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>{isPinningMode ? 'Cancel Pinning' : 'Drop Zone Pin on Map'}</span>
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Zone</span>
          </button>
        </div>
      </div>

      {notification && (
        <div className="p-3 bg-[#E3F2FD] border-2 border-[#0D47A1] text-[#0D47A1] rounded-2xl text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="text-[#0D47A1] font-black ml-2">✕</button>
        </div>
      )}

      {/* Interactive Map */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 space-y-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#0D47A1]" />
            <h2 className="text-xs font-black text-[#0D47A1] uppercase tracking-wider">
              Operational Zones Geofence Overview ({zones.length})
            </h2>
          </div>
          {isPinningMode && (
            <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
              🎯 Pinning Mode Active: Click map to place center
            </span>
          )}
        </div>

        <div
          className={`map-card-wrapper relative w-full h-[320px] sm:h-[400px] rounded-2xl overflow-hidden border-2 border-[#0D47A1] shadow-inner isolate ${
            isPinningMode ? 'cursor-crosshair' : ''
          }`}
          style={{
            isolation: 'isolate',
            contain: 'paint',
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
            WebkitMaskImage: '-webkit-radial-gradient(white, black)',
          }}
        >
          <div ref={mapContainerRef} className="h-full w-full relative z-0 rounded-2xl overflow-hidden" />
        </div>
      </div>

      {/* Zone Cards Grid */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 space-y-4 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#0D47A1]/20 pb-3">
          <div>
            <h2 className="text-sm font-black text-[#0D47A1] uppercase tracking-wider">
              Registered Operational Zones ({zones.length})
            </h2>
            <p className="text-xs text-slate-500 font-medium">Click any zone to inspect or locate on map</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search zones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl text-xs text-[#0D47A1] font-bold placeholder:text-slate-400 focus:outline-none focus:bg-white"
            />
          </div>
        </div>

        {filteredZones.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-xs text-slate-500 font-medium space-y-2">
            <p className="font-bold text-[#0D47A1] text-sm">No Operational Zones Found</p>
            <p>Click "Add New Zone" or "Drop Zone Pin on Map" to configure your first operating area.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredZones.map((zone, idx) => {
              const isSelected = selectedZone?.id === zone.id;
              const isActive = zone.isActive !== false;
              const zoneStations = stations.filter((s) => s.zoneId === zone.id);
              const zoneBikes = ebikes.filter((b) => b.zoneId === zone.id);
              const zoneDrivers = drivers.filter((d) => d.zoneId === zone.id);

              return (
                <div
                  key={`${zone.id || 'zone'}-${idx}`}
                  onClick={() => handleFocusZone(zone)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#E3F2FD] border-[#0D47A1] shadow-md ring-2 ring-[#0D47A1]'
                      : 'bg-white border-[#0D47A1]/40 hover:border-[#0D47A1] hover:shadow-md'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-400'}`} />
                          <h3 className="text-xs font-black text-[#0D47A1] truncate" title={zone.name}>
                            {zone.name}
                          </h3>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                          Code: <span className="font-mono font-bold text-[#0D47A1]">{zone.code}</span>
                        </p>
                      </div>

                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-[#0D47A1] text-white shrink-0">
                        100m PIN FENCING
                      </span>
                    </div>

                    {zone.description && (
                      <p className="text-[10px] text-slate-500 italic line-clamp-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                        {zone.description}
                      </p>
                    )}

                    {/* Zone Assigned Entities Stats */}
                    <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] bg-[#F8FAFC] p-2 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-slate-400 font-bold block text-[9px]">STATIONS</span>
                        <span className="font-black text-[#0D47A1]">{zoneStations.length}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[9px]">SHUTTLES</span>
                        <span className="font-black text-[#0D47A1]">{zoneBikes.length}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[9px]">DRIVERS</span>
                        <span className="font-black text-[#0D47A1]">{zoneDrivers.length}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 mt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleZoneActive(zone);
                      }}
                      className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg transition-colors shadow-xs ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                      }`}
                    >
                      {isActive ? '● Active' : '○ Disabled'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFocusZone(zone);
                        }}
                        title="Locate zone on map"
                        className="p-1.5 bg-[#E3F2FD] hover:bg-[#BBDEFB] text-[#0D47A1] rounded-lg transition-colors border border-[#0D47A1]/20 active:scale-95"
                      >
                        <Navigation2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditModal(zone);
                        }}
                        title="Edit zone properties"
                        className="p-1.5 bg-[#E3F2FD] hover:bg-[#BBDEFB] text-[#0D47A1] rounded-lg transition-colors border border-[#0D47A1]/20 active:scale-95"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoneToDelete(zone);
                        }}
                        title="Delete zone"
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg transition-colors active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Zone Modal (2-Step Form) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 text-[#0D47A1] animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#0D47A1] rounded-xl flex items-center justify-center text-white shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0D47A1]">
                    {editingZoneId ? 'Edit Operational Zone' : 'Register Operational Zone'}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500">
                    Step {formStep} of 2: {formStep === 1 ? 'Zone Details' : 'Pin Center Location'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-[#0D47A1] p-1.5 hover:bg-[#E3F2FD] rounded-xl transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step Progress Pills */}
            <div className="flex items-center gap-2 bg-[#E3F2FD]/50 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFormStep(1)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-center transition-all ${
                  formStep === 1
                    ? 'bg-[#0D47A1] text-white shadow-sm'
                    : 'text-[#0D47A1] hover:bg-[#E3F2FD]'
                }`}
              >
                1. Zone Details
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!formName.trim()) {
                    setFormError('Please enter a zone name first.');
                    return;
                  }
                  setFormError(null);
                  setFormStep(2);
                }}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-center transition-all ${
                  formStep === 2
                    ? 'bg-[#0D47A1] text-white shadow-sm'
                    : 'text-[#0D47A1] hover:bg-[#E3F2FD]'
                }`}
              >
                2. Pin Location
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveZone} className="space-y-3.5">
              {/* STEP 1: Zone Details */}
              {formStep === 1 && (
                <div className="space-y-3 animate-in fade-in">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Zone / Area Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Tagaytay City Hall Complex / National High School"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-bold focus:outline-none focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Description / Coverage Details
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g., Covers City College of Tagaytay, Velodrome, City Hall, and Sigtuna Hall."
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="w-full bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2.5 text-xs text-[#0D47A1] font-medium focus:outline-none focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Operating Boundary Radius (Meters)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min="200"
                        max="10000"
                        step="100"
                        value={formRadius}
                        onChange={(e) => setFormRadius(Number(e.target.value))}
                        className="w-32 bg-[#F8FAFC] border-2 border-[#0D47A1] rounded-xl p-2 text-xs font-bold focus:outline-none focus:bg-white"
                      />
                      <span className="text-xs text-[#0D47A1] font-bold">
                        = {(formRadius / 1000).toFixed(1)} km radius geofence
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Customers must be physically located within this boundary to book rides in this zone.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!formName.trim()) {
                          setFormError('Please enter a zone name.');
                          return;
                        }
                        setFormError(null);
                        setFormStep(2);
                      }}
                      className="px-4 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-transform"
                    >
                      <span>Next: Pin Center</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Interactive Pinning on Map */}
              {formStep === 2 && (
                <div className="space-y-3 animate-in fade-in">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-[#0D47A1] flex items-center justify-between mb-1">
                      <span>Pin Zone Center Location *</span>
                      <span className="text-slate-400 font-normal">Search place or click/drag on map</span>
                    </label>
                    <LocationPickerMap
                      lat={parseFloat(formLat) || 14.1153}
                      lng={parseFloat(formLng) || 120.9621}
                      onChange={(newLat, newLng) => {
                        setFormLat(newLat.toString());
                        setFormLng(newLng.toString());
                      }}
                      radiusMeters={formRadius}
                      circleColor="#0D47A1"
                      height="220px"
                    />
                  </div>

                  {/* Clean Read-Only Center Coordinates Badge */}
                  <div className="bg-[#E3F2FD]/80 border border-[#0D47A1]/30 rounded-xl p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-[#0D47A1]">
                      <MapPin className="w-4 h-4 text-[#0D47A1] shrink-0" />
                      <div>
                        <span className="block text-[9px] uppercase font-black tracking-wider text-slate-500">
                          Center Coordinates
                        </span>
                        <span className="font-mono text-xs font-bold">
                          {parseFloat(formLat || '0').toFixed(6)}, {parseFloat(formLng || '0').toFixed(6)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] bg-[#0D47A1] text-white font-black px-2 py-0.5 rounded-md">
                      {formRadius}m Radius
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setFormStep(1)}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>

                    <button
                      type="submit"
                      disabled={formSaving}
                      className="px-5 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md disabled:opacity-50 active:scale-95 transition-transform"
                    >
                      {formSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>{editingZoneId ? 'Save Zone Changes' : 'Create Zone'}</span>
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {zoneToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-2 border-rose-500 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 border border-rose-200 rounded-2xl flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-rose-900">Delete Operational Zone?</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Are you sure you want to remove <span className="font-bold text-[#0D47A1]">"{zoneToDelete.name}"</span>?
                </p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-xs text-rose-800 space-y-1">
              <p className="font-bold">⚠️ Impact Notice:</p>
              <p className="text-[11px] leading-relaxed">
                Station pins and shuttles assigned to this zone will need to be reassigned.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setZoneToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Yes, Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
