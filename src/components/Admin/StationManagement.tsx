import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { ShuttleStation, StationCategory, OperationalZone } from '../../types';
import {
  listenToShuttleStations,
  addShuttleStation,
  updateShuttleStation,
  deleteShuttleStation,
  DEFAULT_STATION_RADIUS_METERS,
  isStationInZone,
  findZoneForStation,
  autoHealStationZoneRelations,
} from '../../services/stationService';
import { listenToOperationalZones } from '../../services/zoneService';
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Layers,
  Search,
  RefreshCw,
  X,
  Navigation2,
  Check,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { LocationPickerMap } from '../Common/LocationPickerMap';
import { useAdminPin } from '../../contexts/AdminPinContext';
import { useToast } from '../../contexts/ToastContext';
import { useBackHandler } from '../../contexts/NativeBackContext';

interface StationManagementProps {
  onStationSelectForMap?: (station: ShuttleStation) => void;
}

export const StationManagement: React.FC<StationManagementProps> = () => {
  const { promptAdminPin } = useAdminPin();
  const toast = useToast();
  const [stations, setStations] = useState<ShuttleStation[]>([]);
  const [zones, setZones] = useState<OperationalZone[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [zoneFilter, setZoneFilter] = useState<string>('all');

  // Pinning & Editing Mode
  const [isPinningMode, setIsPinningMode] = useState<boolean>(false);
  const [pinningTargetType, setPinningTargetType] = useState<'both' | 'dropoff_only' | 'pickup_only'>('both');
  const [selectedStation, setSelectedStation] = useState<ShuttleStation | null>(null);
  const [editingStation, setEditingStation] = useState<ShuttleStation | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [mapSearchQuery, setMapSearchQuery] = useState<string>('');
  const [isSearchingLocation, setIsSearchingLocation] = useState<boolean>(false);
  const [stationToDelete, setStationToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Form State
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [formName, setFormName] = useState<string>('');
  const [formAddress, setFormAddress] = useState<string>('');
  const [formLat, setFormLat] = useState<string>('14.5547');
  const [formLng, setFormLng] = useState<string>('121.0244');
  const [formRadius, setFormRadius] = useState<number>(DEFAULT_STATION_RADIUS_METERS);
  const [formCategory, setFormCategory] = useState<StationCategory>('stop');
  const [formAllowedType, setFormAllowedType] = useState<'both' | 'pickup_only' | 'dropoff_only'>('both');
  const [formZoneId, setFormZoneId] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Map Container
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const circlesGroupRef = useRef<L.LayerGroup | null>(null);
  const tempPinMarkerRef = useRef<L.Marker | null>(null);

  // Keep latest state in refs for Leaflet callbacks
  const isPinningModeRef = useRef(isPinningMode);
  const pinningTargetTypeRef = useRef(pinningTargetType);

  useEffect(() => {
    isPinningModeRef.current = isPinningMode;
  }, [isPinningMode]);

  useEffect(() => {
    pinningTargetTypeRef.current = pinningTargetType;
  }, [pinningTargetType]);

  // Native back handlers
  useBackHandler(
    showAddForm && formStep === 2,
    () => {
      setFormStep(1);
      return true;
    },
    25,
    'station-form-step'
  );

  useBackHandler(
    showAddForm && formStep === 1,
    () => {
      setShowAddForm(false);
      return true;
    },
    20,
    'station-form-modal'
  );

  // 1. Subscribe to stations & zones
  useEffect(() => {
    const unsub = listenToShuttleStations((list) => {
      setStations(list);
      setLoading(false);
    });
    const unsubZones = listenToOperationalZones((zList) => {
      setZones(zList);
    });
    return () => {
      unsub();
      unsubZones();
    };
  }, []);

  // Auto-heal relation between stations and zones when both are loaded
  useEffect(() => {
    if (stations.length > 0 && zones.length > 0) {
      autoHealStationZoneRelations(stations, zones).catch(() => {});
    }
  }, [stations, zones]);

  // 2. Initialize Leaflet Map with reliable gesture handling
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [14.5547, 121.0244],
        zoom: 13,
        zoomControl: false,
        tapHold: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Add zoom control in top-right
      L.control.zoom({ position: 'topright' }).addTo(map);

      markersGroupRef.current = L.layerGroup().addTo(map);
      circlesGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      // Handle map click
      map.on('click', (e: L.LeafletMouseEvent) => {
        handleProcessCoordinateSelection(e.latlng.lat, e.latlng.lng);
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

  // Expose global window helpers for popup actions
  useEffect(() => {
    (window as any).__editStationAdmin = (stationId: string) => {
      const st = stations.find((s) => s.id === stationId);
      if (st) handleOpenEdit(st);
    };
    (window as any).__deleteStationAdmin = (stationId: string, name: string) => {
      setStationToDelete({ id: stationId, name });
    };
    return () => {
      delete (window as any).__editStationAdmin;
      delete (window as any).__deleteStationAdmin;
    };
  }, [stations]);

  // Coordinate Selection Processor (via map click or center pin)
  const handleProcessCoordinateSelection = async (lat: number, lng: number) => {
    setFormLat(lat.toFixed(6));
    setFormLng(lng.toFixed(6));

    const type = pinningTargetTypeRef.current;
    const defaultName =
      type === 'dropoff_only'
        ? 'Designated Drop-off Point'
        : type === 'pickup_only'
        ? 'Designated Pick-up Point'
        : 'Designated Shuttle Station';

    setFormName((prev) => (prev && prev !== 'Designated Drop-off Point' && prev !== 'Designated Pick-up Point' ? prev : defaultName));
    setFormCategory(type === 'dropoff_only' ? 'dropoff_point' : 'stop');
    setFormAllowedType(type);
    setFormAddress(`Station Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`);

    // Place visual temporary marker
    const map = mapInstanceRef.current;
    if (map) {
      if (tempPinMarkerRef.current) {
        tempPinMarkerRef.current.setLatLng([lat, lng]);
      } else {
        const tempIcon = L.divIcon({
          className: 'custom-temp-pin',
          html: `
            <div class="flex items-center justify-center w-9 h-9 bg-amber-500 text-white rounded-full border-2 border-white shadow-2xl animate-bounce">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        });
        tempPinMarkerRef.current = L.marker([lat, lng], { icon: tempIcon, draggable: true }).addTo(map);
        tempPinMarkerRef.current.on('dragend', (ev: any) => {
          const pos = ev.target.getLatLng();
          setFormLat(pos.lat.toFixed(6));
          setFormLng(pos.lng.toFixed(6));
        });
      }
    }

    // Auto-detect zone from selected coordinates
    const detectedZone = findZoneForStation({ latitude: lat, longitude: lng }, zones);
    if (detectedZone) {
      setFormZoneId(detectedZone.id);
    }

    setIsPinningMode(false);
    setShowAddForm(true);

    // Try reverse geocoding via Nominatim
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      if (data && data.display_name) {
        const shortAddr = data.display_name.split(',').slice(0, 3).join(',').trim();
        setFormAddress(shortAddr || data.display_name);
      }
    } catch {
      // Keep default lat/long string if network offline
    }
  };

  // Pin Current Map Center (Instant single-tap precision)
  const handlePinCurrentCenter = () => {
    if (!mapInstanceRef.current) return;
    const center = mapInstanceRef.current.getCenter();
    handleProcessCoordinateSelection(center.lat, center.lng);
  };

  // Location / Address Search
  const handleSearchLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapSearchQuery.trim() || !mapInstanceRef.current) return;

    setIsSearchingLocation(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(mapSearchQuery)}&limit=1`
      );
      const results = await res.json();
      if (results && results.length > 0) {
        const item = results[0];
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        mapInstanceRef.current.setView([lat, lng], 16, { animate: true });
        const foundMsg = `Found "${item.display_name.split(',')[0]}". Pan or tap to pin!`;
        setNotification(foundMsg);
        toast.info(foundMsg);
      } else {
        const notFound = `No matching locations found for "${mapSearchQuery}".`;
        setNotification(notFound);
        toast.warning(notFound);
      }
    } catch (err: any) {
      const errMsg = `Search error: ${err.message}`;
      setNotification(errMsg);
      toast.error(errMsg);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  // Filtered stations list
  const filteredStations = stations.filter((st) => {
    const matchesSearch =
      st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (st.description && st.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat = categoryFilter === 'all' || st.category === categoryFilter;
    const selectedFilterZone = zones.find((z) => z.id === zoneFilter);
    const matchesZone =
      zoneFilter === 'all' ||
      (selectedFilterZone ? isStationInZone(st, selectedFilterZone) : st.zoneId === zoneFilter);
    return matchesSearch && matchesCat && matchesZone;
  });

  // 4. Render Station Pins & Radius Circles
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    const circlesGroup = circlesGroupRef.current;
    if (!map || !markersGroup || !circlesGroup) return;

    markersGroup.clearLayers();
    circlesGroup.clearLayers();

    const boundsPoints: [number, number][] = [];

    filteredStations.forEach((st) => {
      if (!st.latitude || !st.longitude) return;

      const isCurrentSelected = selectedStation?.id === st.id;
      const isActive = st.isActive !== false;

      const isDropoffOnly = st.allowedType === 'dropoff_only' || (st.allowDropoff && !st.allowPickup);
      const isPickupOnly = st.allowedType === 'pickup_only' || (st.allowPickup && !st.allowDropoff);

      // Color coding based on status and category
      const badgeBg = !isActive
        ? 'bg-slate-400 border-slate-200'
        : isCurrentSelected
        ? 'bg-[#0D47A1] border-amber-300 ring-4 ring-[#0D47A1]/20'
        : isDropoffOnly
        ? 'bg-purple-700 border-white'
        : 'bg-[#0D47A1] border-white';

      const stationIcon = L.divIcon({
        className: 'station-map-pin',
        html: `
          <div class="flex items-center gap-1.5 ${badgeBg} text-white font-black text-[10px] px-2.5 py-1 rounded-full border-2 shadow-xl uppercase tracking-wider whitespace-nowrap cursor-pointer transition-transform hover:scale-105 select-none">
            <span class="w-2 h-2 ${isActive ? (isDropoffOnly ? 'bg-amber-300' : 'bg-emerald-400') : 'bg-slate-300'} rounded-full"></span>
            <span>${st.name}</span>
            ${isDropoffOnly ? '<span class="text-[8px] bg-purple-900/50 px-1 rounded">Drop</span>' : ''}
          </div>
        `,
        iconSize: [130, 28],
        iconAnchor: [65, 28],
      });

      const marker = L.marker([st.latitude, st.longitude], { icon: stationIcon, riseOnHover: true });
      
      const popupHtml = `
        <div class="p-1 space-y-2 max-w-xs text-left">
          <div class="flex items-center justify-between gap-2 border-b border-slate-200 pb-1">
            <div>
              <b class="text-xs text-[#0D47A1] font-black">${st.name}</b>
              <span class="text-[8px] block font-bold uppercase text-slate-500">${st.category || 'Stop'}</span>
            </div>
            <span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${st.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
              ${st.isActive ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
          <p class="text-[10px] text-slate-600 font-medium">${st.address}</p>
          <div class="flex items-center justify-between text-[9px] text-[#0D47A1] font-bold">
            <span>Catchment: ${st.radiusMeters || DEFAULT_STATION_RADIUS_METERS}m</span>
            <span class="text-slate-500 font-mono text-[8px]">${st.latitude.toFixed(4)}, ${st.longitude.toFixed(4)}</span>
          </div>
          ${st.description ? `<p class="text-[9px] text-slate-500 italic border-l-2 border-slate-300 pl-1.5">${st.description}</p>` : ''}
          <div class="flex items-center gap-1.5 pt-1 border-t border-slate-200">
            <button
              onclick="window.__editStationAdmin && window.__editStationAdmin('${st.id}')"
              class="flex-1 py-1 px-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-lg text-[9px] font-black uppercase tracking-wider text-center cursor-pointer shadow-sm"
            >
              ✏️ Edit Pin
            </button>
            <button
              onclick="window.__deleteStationAdmin && window.__deleteStationAdmin('${st.id}', '${st.name.replace(/'/g, "\\'")}')"
              class="py-1 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[9px] font-black uppercase cursor-pointer"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        setSelectedStation(st);
      });

      marker.addTo(markersGroup);

      // Add catchment circle
      const circleRadius = st.radiusMeters || DEFAULT_STATION_RADIUS_METERS;
      L.circle([st.latitude, st.longitude], {
        radius: circleRadius,
        color: isActive ? (isDropoffOnly ? '#7B1FA2' : '#0D47A1') : '#94A3B8',
        fillColor: isActive ? (isDropoffOnly ? '#AB47BC' : '#2196F3') : '#CBD5E1',
        fillOpacity: isActive ? 0.12 : 0.05,
        weight: 1.5,
        dashArray: isActive ? undefined : '4, 4',
      }).addTo(circlesGroup);

      boundsPoints.push([st.latitude, st.longitude]);
    });

    if (boundsPoints.length > 0 && !selectedStation) {
      map.fitBounds(boundsPoints, { padding: [40, 40], maxZoom: 15 });
    }
  }, [filteredStations, selectedStation]);

  // Center on Selected Station
  const handleFocusStation = (st: ShuttleStation) => {
    setSelectedStation(st);
    if (mapInstanceRef.current && st.latitude && st.longitude) {
      mapInstanceRef.current.setView([st.latitude, st.longitude], 16, { animate: true });
    }
  };

  // Open Edit Form
  const handleOpenEdit = (st: ShuttleStation) => {
    setEditingStation(st);
    setFormStep(1);
    setFormName(st.name);
    setFormAddress(st.address);
    setFormLat(st.latitude.toString());
    setFormLng(st.longitude.toString());
    setFormRadius(st.radiusMeters || DEFAULT_STATION_RADIUS_METERS);
    setFormCategory(st.category || 'stop');
    setFormAllowedType(
      st.allowedType || (st.allowDropoff && !st.allowPickup ? 'dropoff_only' : st.allowPickup && !st.allowDropoff ? 'pickup_only' : 'both')
    );
    setFormZoneId(st.zoneId || '');
    setFormDescription(st.description || '');
    setFormIsActive(st.isActive !== false);
    setShowAddForm(true);
  };

  // Open Add Form
  const handleOpenAdd = (presetType: 'both' | 'dropoff_only' | 'pickup_only' = 'both') => {
    setEditingStation(null);
    setFormStep(1);
    setFormName(presetType === 'dropoff_only' ? 'Designated Drop-off Point' : presetType === 'pickup_only' ? 'Designated Pick-up Point' : '');
    setFormAddress('');
    
    const defaultZone = zones.length > 0 ? zones[0] : null;
    setFormLat(defaultZone?.centerLatitude?.toString() || '14.1153');
    setFormLng(defaultZone?.centerLongitude?.toString() || '120.9621');
    setFormRadius(DEFAULT_STATION_RADIUS_METERS);
    setFormCategory(presetType === 'dropoff_only' ? 'dropoff_point' : 'stop');
    setFormAllowedType(presetType);
    setFormZoneId(defaultZone ? defaultZone.id : '');
    setFormDescription('');
    setFormIsActive(true);
    setShowAddForm(true);
  };

  // Trigger Interactive Pinning Mode with Preset
  const handleStartPinning = (type: 'both' | 'dropoff_only' | 'pickup_only' = 'both') => {
    setPinningTargetType(type);
    setFormAllowedType(type);
    setFormCategory(type === 'dropoff_only' ? 'dropoff_point' : 'stop');
    setFormName(type === 'dropoff_only' ? 'Designated Drop-off Point' : type === 'pickup_only' ? 'Designated Pick-up Point' : '');
    if (!formZoneId && zones.length > 0) {
      setFormZoneId(zones[0].id);
    }
    setIsPinningMode(true);
    setNotification(
      type === 'dropoff_only'
        ? 'Click anywhere on the map to pin a new Drop-off Destination.'
        : 'Click anywhere on the map to drop a new station pin.'
    );
  };

  // Close Form
  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingStation(null);
    setFormStep(1);
    if (tempPinMarkerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(tempPinMarkerRef.current);
      tempPinMarkerRef.current = null;
    }
  };

  // Save Station (Add or Update)
  const handleSaveStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formAddress.trim()) {
      const err = 'Please enter a station name and address.';
      setNotification(err);
      toast.warning(err);
      return;
    }

    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);
    if (isNaN(lat) || isNaN(lng)) {
      const err = 'Please enter valid numeric latitude and longitude coordinates.';
      setNotification(err);
      toast.warning(err);
      return;
    }

    const allowPickup = formAllowedType === 'both' || formAllowedType === 'pickup_only';
    const allowDropoff = formAllowedType === 'both' || formAllowedType === 'dropoff_only';

    // Auto-resolve zone if not explicitly set or if zone selection is empty
    const detectedZone = findZoneForStation(
      { latitude: lat, longitude: lng, zoneId: formZoneId || undefined },
      zones
    );
    const finalZoneId = formZoneId || detectedZone?.id || undefined;
    const selectedZoneObj = zones.find((z) => z.id === finalZoneId) || detectedZone;
    const finalZoneName = selectedZoneObj?.name || undefined;

    setSubmitting(true);
    try {
      if (editingStation) {
        await updateShuttleStation(editingStation.id, {
          name: formName.trim(),
          address: formAddress.trim(),
          latitude: lat,
          longitude: lng,
          radiusMeters: Number(formRadius) || DEFAULT_STATION_RADIUS_METERS,
          category: formCategory,
          allowedType: formAllowedType,
          allowPickup,
          allowDropoff,
          zoneId: finalZoneId,
          zoneName: finalZoneName,
          description: formDescription.trim(),
          isActive: formIsActive,
        });
        const msg = `Station "${formName}" updated successfully!`;
        setNotification(msg);
        toast.success(msg);
      } else {
        await addShuttleStation({
          name: formName.trim(),
          address: formAddress.trim(),
          latitude: lat,
          longitude: lng,
          radiusMeters: Number(formRadius) || DEFAULT_STATION_RADIUS_METERS,
          category: formCategory,
          allowedType: formAllowedType,
          allowPickup,
          allowDropoff,
          zoneId: finalZoneId,
          zoneName: finalZoneName,
          description: formDescription.trim(),
          isActive: formIsActive,
        });
        const msg = `Station "${formName}" pinned successfully! Users in this zone can now book to/from this point.`;
        setNotification(msg);
        toast.success(msg);
      }
      handleCloseForm();
    } catch (err: any) {
      console.error('Error saving station:', err);
      const errMsg = `Failed to save station: ${err.message || 'Unknown error'}`;
      setNotification(errMsg);
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
      setTimeout(() => setNotification(null), 4000);
    }
  };

  // Toggle Active Status
  const handleToggleStatus = async (st: ShuttleStation) => {
    try {
      await updateShuttleStation(st.id, { isActive: !st.isActive });
      const msg = `Station "${st.name}" is now ${!st.isActive ? 'ACTIVE' : 'INACTIVE'}.`;
      setNotification(msg);
      toast.info(msg);
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      console.error('Error toggling status:', err);
      toast.error(err?.message || 'Failed to update station status.');
    }
  };

  // Delete Station Prompt (Opens Confirmation Modal)
  const handleDeleteStation = (id: string, name: string) => {
    setStationToDelete({ id, name });
  };

  // Perform Confirmed Deletion (Protected by Secret PIN)
  const handleConfirmDeleteStation = () => {
    if (!stationToDelete) return;
    const { id, name } = stationToDelete;

    promptAdminPin({
      title: 'Authorize Delete Shuttle Station',
      actionDescription: `Enter Secret PIN to permanently remove designated station "${name}" from route navigation`,
      entityName: name,
      severity: 'danger',
      onConfirm: async () => {
        setIsDeleting(true);
        try {
          await deleteShuttleStation(id);
          const msg = `Station "${name}" was permanently removed.`;
          setNotification(msg);
          toast.success(msg);
          if (selectedStation?.id === id) setSelectedStation(null);
          setStationToDelete(null);
        } catch (err: any) {
          console.error('Error deleting station:', err);
          const errMsg = `Error deleting station: ${err.message || 'Unknown error'}`;
          setNotification(errMsg);
          toast.error(errMsg);
        } finally {
          setIsDeleting(false);
          setTimeout(() => setNotification(null), 3000);
        }
      },
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200 pb-28 sm:pb-36">
      {/* Top Banner & Instructions */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#0D47A1] rounded-xl flex items-center justify-center text-white">
              <MapPin className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-black text-[#0D47A1]">Designated Station Pins & Geofencing</h2>
          </div>
          <p className="text-xs text-slate-600 font-medium mt-1">
            E-Shuttles strictly operate between designated pinned stations. Customers can only tag these pins for pick-up and drop-off. If a customer is outside the allowed proximity radius, booking is automatically restricted.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => handleOpenAdd('both')}
            className="px-4 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-transform"
          >
            <Plus className="w-4 h-4" />
            <span>Add Station</span>
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="p-3 bg-[#E3F2FD] border-2 border-[#0D47A1] text-[#0D47A1] text-xs font-bold rounded-2xl flex items-center justify-between shadow-md animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#0D47A1]" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-[#BBDEFB] rounded-lg">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Pinning & Station Map */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-[#0D47A1] uppercase tracking-wide flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#0D47A1]" />
              Interactive Station Map & Catchment Radii
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Click anywhere on the map or tap the pin button to register an authorized pick-up or drop-off location.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-[#0D47A1] bg-[#E3F2FD] border border-[#0D47A1] px-2.5 py-1 rounded-xl">
              {stations.filter((s) => s.isActive !== false).length} Active Stations
            </span>
          </div>
        </div>

        {/* Location Search Bar & Center Pin Shortcut */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <form onSubmit={handleSearchLocation} className="relative flex-1 w-full flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-[#0D47A1]" />
              <input
                type="text"
                value={mapSearchQuery}
                onChange={(e) => setMapSearchQuery(e.target.value)}
                placeholder="Search building, gate, landmark, or street to jump on map..."
                className="w-full pl-9 pr-3 py-2 bg-[#E3F2FD]/50 border-2 border-[#0D47A1]/40 focus:border-[#0D47A1] rounded-xl text-xs font-bold text-[#0D47A1] placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isSearchingLocation || !mapSearchQuery.trim()}
              className="px-3.5 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider shrink-0 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSearchingLocation ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Navigation2 className="w-3.5 h-3.5" />}
              <span>Jump</span>
            </button>
          </form>

          <button
            type="button"
            onClick={handlePinCurrentCenter}
            className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-transform shrink-0"
            title="Drop a new station pin exactly at the center of the current map view"
          >
            <MapPin className="w-4 h-4" />
            <span>Pin Map Center</span>
          </button>
        </div>

        {/* Map Container */}
        <div
          className={`map-card-wrapper relative w-full h-[300px] sm:h-[380px] rounded-2xl overflow-hidden border-2 border-[#0D47A1] shadow-inner isolate ${
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
          <div ref={mapContainerRef} className="w-full h-full relative z-0 rounded-2xl overflow-hidden" />

          {/* Center Target Indicator when Pinning Mode is Active */}
          {isPinningMode && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className="relative flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-2 border-amber-500 border-dashed animate-spin opacity-75"></div>
                <div className="absolute w-3 h-3 bg-amber-500 rounded-full border-2 border-white shadow-lg"></div>
              </div>
            </div>
          )}

          {/* Map Pinning Helper Overlay */}
          {isPinningMode && (
            <div className="absolute top-3 left-3 right-3 z-20 max-w-md mx-auto bg-amber-500 text-white p-3 rounded-2xl shadow-2xl flex items-center justify-between gap-2 text-xs font-bold animate-in fade-in">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 animate-spin shrink-0" />
                <span>
                  {pinningTargetType === 'dropoff_only'
                    ? 'Tap anywhere on map to pin a Drop-off point'
                    : 'Tap anywhere on map or pan to center point'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handlePinCurrentCenter}
                  className="px-2.5 py-1 bg-white text-amber-900 rounded-lg text-[10px] uppercase font-black shadow"
                >
                  Pin Center
                </button>
                <button
                  type="button"
                  onClick={() => setIsPinningMode(false)}
                  className="px-2 py-1 bg-black/20 hover:bg-black/40 rounded-lg text-[10px] uppercase font-black"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Quick Legend Overlay */}
          <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-md border border-[#0D47A1] text-[#0D47A1] p-2.5 rounded-2xl shadow-md text-[10px] font-bold space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-[#0D47A1] rounded-full"></span>
              <span>Pickup & Drop-off Station</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-purple-700 rounded-full"></span>
              <span>Drop-off Only Station</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-[#2196F3]/30 border border-[#0D47A1] rounded-full"></span>
              <span>Allowed Proximity Catchment</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stations List & Management */}
      <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-[#0D47A1] uppercase tracking-wide">
              Official Pinned Stations ({filteredStations.length})
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Manage exact coordinates, catchment radius, and active operating status for each stop.
            </p>
          </div>

          {/* Actions & Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search stations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs text-[#0D47A1] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D47A1]"
              />
            </div>

            {/* Zone Filter */}
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#E3F2FD] border border-[#0D47A1] rounded-xl text-xs font-bold text-[#0D47A1] focus:outline-none"
            >
              <option value="all">All Operational Zones</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-[#E3F2FD] border border-[#0D47A1] rounded-xl text-xs font-bold text-[#0D47A1] focus:outline-none"
            >
              <option value="all">All Categories</option>
              <option value="terminal">Terminals</option>
              <option value="campus_gate">Campus Gates</option>
              <option value="hub">Hubs</option>
              <option value="building">Buildings</option>
              <option value="stop">Stops</option>
            </select>

            {/* Re-link Zones & Stations Button */}
            <button
              onClick={async () => {
                const healed = await autoHealStationZoneRelations(stations, zones);
                const msg =
                  healed > 0
                    ? `Successfully re-linked ${healed} stations to their operational zones!`
                    : 'All stations are actively connected to their operational zones.';
                setNotification(msg);
                toast.success(msg);
              }}
              title="Audit and automatically re-link all stations to their enclosing operational zones"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-link Zones</span>
            </button>
          </div>
        </div>

        {/* Stations Grid / Table */}
        {loading ? (
          <div className="py-8 text-center text-xs font-bold text-slate-400">Loading stations...</div>
        ) : filteredStations.length === 0 ? (
          <div className="py-8 text-center text-xs font-bold text-slate-500 bg-[#E3F2FD]/30 rounded-2xl border border-dashed border-[#0D47A1]/40">
            No shuttle stations found. Click "Add Station" or "Drop Pin on Map" to create one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredStations.map((st, idx) => {
              const isActive = st.isActive !== false;
              const isSelected = selectedStation?.id === st.id;

              return (
                <div
                  key={`${st.id || 'st'}-${idx}`}
                  onClick={() => handleFocusStation(st)}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-[#E3F2FD] border-[#0D47A1] shadow-md ring-2 ring-[#0D47A1]'
                      : 'bg-white border-[#0D47A1]/40 hover:border-[#0D47A1] hover:shadow-md'
                  }`}
                >
                  {/* Card Top / Info */}
                  <div className="space-y-2.5 min-w-0">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isActive ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-slate-400'}`} />
                          <h4 className="text-xs font-black text-[#0D47A1] leading-tight break-words" title={st.name}>
                            {st.name}
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium break-words mt-0.5" title={st.address}>
                          {st.address}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-[#0D47A1] text-white">
                          {st.category || 'Stop'}
                        </span>
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                          st.allowedType === 'dropoff_only' || (st.allowDropoff && !st.allowPickup)
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : st.allowedType === 'pickup_only' || (st.allowPickup && !st.allowDropoff)
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {st.allowedType === 'dropoff_only' || (st.allowDropoff && !st.allowPickup)
                            ? '🏁 Drop-off Only'
                            : st.allowedType === 'pickup_only' || (st.allowPickup && !st.allowDropoff)
                            ? '📍 Pick-up Only'
                            : '🟢 Pick & Drop'}
                        </span>
                      </div>
                    </div>

                    {/* Zone Badge */}
                    {(() => {
                      const displayZoneName =
                        st.zoneName ||
                        zones.find((z) => z.id === st.zoneId)?.name ||
                        findZoneForStation(st, zones)?.name;
                      return displayZoneName ? (
                        <div className="flex items-center gap-1">
                          <span className="bg-[#E3F2FD] border border-[#0D47A1] text-[#0D47A1] text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase">
                            📍 {displayZoneName}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="bg-amber-50 border border-amber-300 text-amber-800 text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase">
                            ⚠️ Auto-Matching Zone
                          </span>
                        </div>
                      );
                    })()}

                    {/* Coordinates & Proximity Info */}
                    <div className="grid grid-cols-2 gap-2 text-[10px] bg-[#F8FAFC] p-2.5 rounded-xl border border-slate-200">
                      <div>
                        <span className="text-slate-400 font-bold uppercase text-[9px] block">COORDINATES</span>
                        <span className="text-[#0D47A1] font-mono font-bold">
                          {st.latitude.toFixed(4)}, {st.longitude.toFixed(4)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold uppercase text-[9px] block">CATCHMENT</span>
                        <span className="text-[#0D47A1] font-bold">
                          {st.radiusMeters || DEFAULT_STATION_RADIUS_METERS} meters
                        </span>
                      </div>
                    </div>

                    {st.description && (
                      <p className="text-[10px] text-slate-500 italic bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 break-words">
                        {st.description}
                      </p>
                    )}
                  </div>

                  {/* Card Bottom / Action Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/80 mt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStatus(st);
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFocusStation(st);
                        }}
                        title="Locate pin on map"
                        className="p-1.5 bg-[#E3F2FD] hover:bg-[#BBDEFB] text-[#0D47A1] rounded-lg transition-colors border border-[#0D47A1]/20 active:scale-95"
                      >
                        <Navigation2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(st);
                        }}
                        title="Edit station"
                        className="p-1.5 bg-[#E3F2FD] hover:bg-[#BBDEFB] text-[#0D47A1] rounded-lg transition-colors border border-[#0D47A1]/20 active:scale-95"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStation(st.id, st.name);
                        }}
                        title="Delete station pin"
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

      {/* Add / Edit Station Modal (2-Step Form) */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-2 border-[#0D47A1] rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#0D47A1]/20 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#0D47A1] rounded-xl flex items-center justify-center text-white shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0D47A1]">
                    {editingStation ? 'Edit Station Pin' : 'Add New Station Pin'}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500">
                    Step {formStep} of 2: {formStep === 1 ? 'Station Information' : 'Pin Location on Map'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseForm}
                className="p-1.5 hover:bg-[#E3F2FD] rounded-xl text-slate-500 transition-colors"
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
                1. Station Details
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!formName.trim() || !formAddress.trim()) {
                    setNotification('Please fill in Station Name and Address first.');
                    return;
                  }
                  setFormStep(2);
                }}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-center transition-all ${
                  formStep === 2
                    ? 'bg-[#0D47A1] text-white shadow-sm'
                    : 'text-[#0D47A1] hover:bg-[#E3F2FD]'
                }`}
              >
                2. Pin on Map
              </button>
            </div>

            <form onSubmit={handleSaveStation} className="space-y-3">
              {/* STEP 1: Station Info & Details */}
              {formStep === 1 && (
                <div className="space-y-3 animate-in fade-in">
                  <div>
                    <label className="text-[10px] font-black text-[#0D47A1] uppercase block mb-1">
                      Station / Stop Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jollibee Restaurant / IT Building"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs text-[#0D47A1] font-bold focus:outline-none focus:ring-2 focus:ring-[#0D47A1]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-[#0D47A1] uppercase block mb-1">
                      Address / Landmark *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Emilio Aguinaldo Hwy, Tagaytay"
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      className="w-full px-3 py-2 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs text-[#0D47A1] font-bold focus:outline-none focus:ring-2 focus:ring-[#0D47A1]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-[#0D47A1] uppercase block mb-1">
                      Assigned Operational Zone
                    </label>
                    <select
                      value={formZoneId}
                      onChange={(e) => {
                        const zid = e.target.value;
                        setFormZoneId(zid);
                        const matched = zones.find((z) => z.id === zid);
                        if (matched && matched.centerLatitude && matched.centerLongitude) {
                          setFormLat(matched.centerLatitude.toString());
                          setFormLng(matched.centerLongitude.toString());
                        }
                      }}
                      className="w-full px-3 py-2 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs font-bold text-[#0D47A1] focus:outline-none"
                    >
                      <option value="">-- No Zone Assigned --</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} ({z.code})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Geofences bookers within 100m catchment of pins under this zone.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-black text-[#0D47A1] uppercase block mb-1">
                        Category
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value as StationCategory)}
                        className="w-full px-3 py-2 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs font-bold text-[#0D47A1] focus:outline-none"
                      >
                        <option value="terminal">Terminal</option>
                        <option value="campus_gate">Campus Gate</option>
                        <option value="dropoff_point">Drop-off Point</option>
                        <option value="hub">Transit Hub</option>
                        <option value="building">Campus Building</option>
                        <option value="stop">Regular Stop</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-[#0D47A1] uppercase block mb-1">
                        Catchment Radius
                      </label>
                      <select
                        value={formRadius}
                        onChange={(e) => setFormRadius(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs font-bold text-[#0D47A1] focus:outline-none"
                      >
                        <option value={50}>50m (Exact Spot)</option>
                        <option value={100}>100m (Standard Pin Catchment)</option>
                        <option value={150}>150m (Medium Bay)</option>
                        <option value={200}>200m (Wide Hub)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-[#0D47A1] uppercase block mb-1">
                      Allowed Operation Type *
                    </label>
                    <select
                      value={formAllowedType}
                      onChange={(e) => setFormAllowedType(e.target.value as 'both' | 'pickup_only' | 'dropoff_only')}
                      className="w-full px-3 py-2 bg-[#E3F2FD] border-2 border-[#0D47A1] rounded-xl text-xs font-black text-[#0D47A1] focus:outline-none"
                    >
                      <option value="both">🟢 Both Pick-up and Drop-off Allowed</option>
                      <option value="dropoff_only">🏁 Drop-off Destination Only</option>
                      <option value="pickup_only">📍 Pick-up Origin Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-[#0D47A1] uppercase block mb-1">
                      Notes / Shelter Description (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Waiting bay opposite Jollibee"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="w-full px-3 py-2 bg-[#E3F2FD]/50 border border-[#0D47A1] rounded-xl text-xs text-[#0D47A1] focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="formIsActive"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="w-4 h-4 rounded text-[#0D47A1] border-gray-300 focus:ring-[#0D47A1]"
                    />
                    <label htmlFor="formIsActive" className="text-xs font-bold text-[#0D47A1]">
                      Station is Active for Customer Pick-up / Drop-off
                    </label>
                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleCloseForm}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!formName.trim() || !formAddress.trim()) {
                          setNotification('Please enter a station name and address.');
                          return;
                        }
                        setFormStep(2);
                      }}
                      className="px-4 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-transform"
                    >
                      <span>Next: Pin Location</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Interactive Location Pinning on Map */}
              {formStep === 2 && (
                <div className="space-y-3 animate-in fade-in">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black text-[#0D47A1] uppercase">
                        Select Station Location Pin *
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium">Search or drag pin</span>
                    </div>

                    <LocationPickerMap
                      lat={parseFloat(formLat) || 14.1153}
                      lng={parseFloat(formLng) || 120.9621}
                      onChange={(newLat, newLng) => {
                        setFormLat(newLat.toString());
                        setFormLng(newLng.toString());
                      }}
                      radiusMeters={formRadius}
                      circleColor="#10B981"
                      height="230px"
                    />
                  </div>

                  {/* Clean Read-Only Coordinates Badge */}
                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="block text-[9px] uppercase text-emerald-600 font-black tracking-wider">
                          Pinned Location
                        </span>
                        <span className="font-mono text-xs font-bold">
                          {parseFloat(formLat).toFixed(6)}, {parseFloat(formLng).toFixed(6)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-black px-2 py-0.5 rounded-md">
                      {formRadius}m Radius
                    </span>
                  </div>

                  <div className="pt-3 flex items-center justify-between gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setFormStep(1)}
                      className="hidden sm:inline-flex px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold items-center gap-1 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md active:scale-95 transition-transform flex items-center gap-1.5"
                    >
                      {submitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>{editingStation ? 'Update Station Pin' : 'Save Station Pin'}</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {stationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white border-2 border-rose-500 rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 border border-rose-200 rounded-2xl flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-rose-900">Delete Station Pin?</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Are you sure you want to remove <span className="font-bold text-[#0D47A1]">"{stationToDelete.name}"</span>?
                </p>
              </div>
            </div>

            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-xs text-rose-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <span>⚠️ Geofence Impact:</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                Customers will no longer be able to select or book rides to/from this designated stop.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setStationToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteStation}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
