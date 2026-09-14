import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { LocationPoint, DriverProfile, ShuttleStation } from '../types';
import { fetchRoadRoute, RouteResult, RouteStep } from '../services/routingService';
import { Navigation, Compass, ArrowUp, ArrowLeft, ArrowRight, CornerUpRight, CornerUpLeft, CheckCircle2, MapPin } from 'lucide-react';
import { sanitizeVehicleInfo } from '../utils/sanitizeVehicle';

interface MapViewProps {
  pickup?: LocationPoint | null;
  destination?: LocationPoint | null;
  driverLocation?: LocationPoint | null;
  nearbyDrivers?: DriverProfile[];
  stations?: ShuttleStation[];
  onStationTag?: (station: ShuttleStation, type: 'pickup' | 'destination') => void;
  isSelectingLocation?: 'pickup' | 'destination' | null;
  onLocationSelect?: (lat: number, lng: number) => void;
  className?: string;
  center?: [number, number];
  zoom?: number;
  rideStatus?: string;
  showNavigationBanner?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({
  pickup,
  destination,
  driverLocation,
  nearbyDrivers = [],
  stations = [],
  onStationTag,
  isSelectingLocation = null,
  onLocationSelect,
  className = 'h-full w-full',
  center = [14.5547, 121.0244], // Default Metropolitan location
  zoom = 14,
  rideStatus,
  showNavigationBanner = true,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const stationsGroupRef = useRef<L.LayerGroup | null>(null);
  const routesGroupRef = useRef<L.LayerGroup | null>(null);

  // Keep references to latest callbacks and state to avoid stale closure issues in Leaflet listeners
  const onLocationSelectRef = useRef(onLocationSelect);
  const onStationTagRef = useRef(onStationTag);
  const isSelectingLocationRef = useRef(isSelectingLocation);

  useEffect(() => {
    onLocationSelectRef.current = onLocationSelect;
  }, [onLocationSelect]);

  useEffect(() => {
    onStationTagRef.current = onStationTag;
  }, [onStationTag]);

  useEffect(() => {
    isSelectingLocationRef.current = isSelectingLocation;
  }, [isSelectingLocation]);

  // Active navigation routing info state
  const [activeRouteInfo, setActiveRouteInfo] = useState<RouteResult | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isRouteLoading, setIsRouteLoading] = useState<boolean>(false);

  // Pure HTML/CSS Custom Markers with #0D47A1, #2196F3, #90CAF9, #E3F2FD palette
  const pickupIcon = L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div class="flex items-center gap-1.5 bg-[#2196F3] text-white font-black text-[10px] px-2.5 py-1 rounded-full border-2 border-white shadow-xl uppercase tracking-wider">
        <span class="w-2 h-2 bg-white rounded-full animate-ping"></span>
        PICKUP
      </div>
    `,
    iconSize: [80, 26],
    iconAnchor: [40, 26],
  });

  const destinationIcon = L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div class="flex items-center gap-1 bg-[#0D47A1] text-white font-black text-[10px] px-2.5 py-1 rounded-full border-2 border-white shadow-xl uppercase tracking-wider">
        DESTINATION
      </div>
    `,
    iconSize: [95, 26],
    iconAnchor: [47, 26],
  });

  const driverIcon = L.divIcon({
    className: 'custom-map-icon',
    html: `
      <div class="relative flex items-center justify-center bg-white border-2 border-[#2196F3] text-[#0D47A1] font-extrabold text-[10px] px-3 py-1 rounded-full shadow-xl">
        <span class="w-2 h-2 bg-[#2196F3] rounded-full mr-1.5 animate-pulse"></span>
        E-SHUTTLE
      </div>
    `,
    iconSize: [85, 28],
    iconAnchor: [42, 14],
  });

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: L.latLng(center[0], center[1]),
        zoom,
        zoomControl: false,
      });

      // Standard OpenStreetMap tiles (No API Key Required)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Map click handler for interactive location picking
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onLocationSelectRef.current) {
          onLocationSelectRef.current(e.latlng.lat, e.latlng.lng);
        }
      });

      markersGroupRef.current = L.layerGroup().addTo(map);
      stationsGroupRef.current = L.layerGroup().addTo(map);
      routesGroupRef.current = L.layerGroup().addTo(map);
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

  // Expose global window helper for popup buttons
  useEffect(() => {
    (window as any).__tagStationHelper = (stationId: string, type: 'pickup' | 'destination') => {
      const st = stations.find((s) => s.id === stationId);
      if (st && onStationTagRef.current) {
        onStationTagRef.current(st, type);
      }
    };
    return () => {
      delete (window as any).__tagStationHelper;
    };
  }, [stations]);

  // Calculate Real-World OSRM Road Route & Render Station Pins
  useEffect(() => {
    let isCancelled = false;

    const loadRoadRoutes = async () => {
      const map = mapInstanceRef.current;
      const markersGroup = markersGroupRef.current;
      const stationsGroup = stationsGroupRef.current;
      const routesGroup = routesGroupRef.current;
      if (!map || !markersGroup || !stationsGroup || !routesGroup) return;

      markersGroup.clearLayers();
      stationsGroup.clearLayers();
      routesGroup.clearLayers();

      const boundsPoints: [number, number][] = [];

      // Render Designated Station Pins
      if (stations && stations.length > 0) {
        stations.forEach((st) => {
          if (!st.latitude || !st.longitude || st.isActive === false) return;

          const isSelectedPickup = pickup && Math.abs(pickup.latitude - st.latitude) < 0.0001 && Math.abs(pickup.longitude - st.longitude) < 0.0001;
          const isSelectedDest = destination && Math.abs(destination.latitude - st.latitude) < 0.0001 && Math.abs(destination.longitude - st.longitude) < 0.0001;

          const pinBorder = isSelectedPickup
            ? 'border-emerald-400 ring-2 ring-emerald-500 bg-emerald-700'
            : isSelectedDest
            ? 'border-purple-400 ring-2 ring-purple-500 bg-purple-700'
            : 'border-white bg-[#0D47A1]';

          const allowsPickup = st.allowedType !== 'dropoff_only' && st.allowPickup !== false;
          const allowsDropoff = st.allowedType !== 'pickup_only' && st.allowDropoff !== false;

          const stationDivIcon = L.divIcon({
            className: 'custom-station-pin',
            html: `
              <div class="flex items-center gap-1.5 ${pinBorder} text-white font-black text-[9px] px-2.5 py-1 rounded-full border-2 shadow-lg uppercase tracking-wider whitespace-nowrap cursor-pointer hover:scale-105 transition-transform">
                <span class="w-1.5 h-1.5 ${allowsDropoff && !allowsPickup ? 'bg-amber-300' : 'bg-emerald-400'} rounded-full"></span>
                <span>${st.name}</span>
                ${allowsDropoff && !allowsPickup ? '<span class="text-[8px] bg-amber-400/30 px-1 rounded">Drop</span>' : ''}
              </div>
            `,
            iconSize: [120, 24],
            iconAnchor: [60, 24],
          });

          const stMarker = L.marker([st.latitude, st.longitude], { icon: stationDivIcon });

          // Direct click: if user is in selecting mode, immediately apply; otherwise open popup
          stMarker.on('click', (e) => {
            if (isSelectingLocationRef.current === 'destination' && allowsDropoff) {
              L.DomEvent.stopPropagation(e);
              if (onStationTagRef.current) {
                onStationTagRef.current(st, 'destination');
              } else if (onLocationSelectRef.current) {
                onLocationSelectRef.current(st.latitude, st.longitude);
              }
              return;
            }
            if (isSelectingLocationRef.current === 'pickup' && allowsPickup) {
              L.DomEvent.stopPropagation(e);
              if (onStationTagRef.current) {
                onStationTagRef.current(st, 'pickup');
              } else if (onLocationSelectRef.current) {
                onLocationSelectRef.current(st.latitude, st.longitude);
              }
              return;
            }
          });

          const popupContent = `
            <div class="p-1.5 space-y-2 max-w-xs text-left">
              <div>
                <div class="flex items-center justify-between gap-1">
                  <div class="flex items-center gap-1">
                    <span class="w-2 h-2 rounded-full ${st.isActive ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
                    <b class="text-xs text-[#0D47A1] font-black">${st.name}</b>
                  </div>
                  <span class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-100 text-[#0D47A1]">
                    ${!allowsPickup && allowsDropoff ? 'Drop-off Only' : allowsPickup && !allowsDropoff ? 'Pick-up Only' : 'Pick & Drop'}
                  </span>
                </div>
                <p class="text-[10px] text-slate-600 mt-0.5">${st.address}</p>
                <div class="text-[9px] text-[#0D47A1] font-bold mt-1">Catchment Radius: ${st.radiusMeters || 200}m</div>
                ${st.description ? `<p class="text-[9px] text-slate-500 italic mt-0.5">${st.description}</p>` : ''}
              </div>
              <div class="flex items-center gap-1.5 pt-1 border-t border-slate-200">
                ${
                  allowsPickup
                    ? `
                  <button
                    onclick="window.__tagStationHelper && window.__tagStationHelper('${st.id}', 'pickup')"
                    class="flex-1 py-1 px-2 bg-[#2196F3] hover:bg-[#1E88E5] text-white rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm cursor-pointer text-center"
                  >
                    📍 Set Pick-up
                  </button>
                `
                    : ''
                }
                ${
                  allowsDropoff
                    ? `
                  <button
                    onclick="window.__tagStationHelper && window.__tagStationHelper('${st.id}', 'destination')"
                    class="flex-1 py-1 px-2 bg-[#0D47A1] hover:bg-[#1565C0] text-white rounded-lg text-[9px] font-black uppercase tracking-wider shadow-sm cursor-pointer text-center"
                  >
                    🏁 Set Drop-off
                  </button>
                `
                    : ''
                }
              </div>
            </div>
          `;

          stMarker.bindPopup(popupContent);
          stMarker.addTo(stationsGroup);

          // Render Service Radius circle
          L.circle([st.latitude, st.longitude], {
            radius: st.radiusMeters || 200,
            color: '#0D47A1',
            fillColor: allowsDropoff && !allowsPickup ? '#9C27B0' : '#2196F3',
            fillOpacity: 0.08,
            weight: 1,
            dashArray: '3, 3',
          }).addTo(stationsGroup);

          if (!pickup && !destination && !driverLocation) {
            boundsPoints.push([st.latitude, st.longitude]);
          }
        });
      }

      // Pickup Marker
      if (pickup) {
        L.marker([pickup.latitude, pickup.longitude], { icon: pickupIcon })
          .bindPopup(`<b>Pickup Point</b><br/>${pickup.address}`)
          .addTo(markersGroup);
        boundsPoints.push([pickup.latitude, pickup.longitude]);
      }

      // Destination Marker
      if (destination) {
        L.marker([destination.latitude, destination.longitude], { icon: destinationIcon })
          .bindPopup(`<b>Destination</b><br/>${destination.address}`)
          .addTo(markersGroup);
        boundsPoints.push([destination.latitude, destination.longitude]);
      }

      // Single Active Driver Marker
      if (driverLocation) {
        L.marker([driverLocation.latitude, driverLocation.longitude], { icon: driverIcon })
          .bindPopup(`<b>E-Shuttle Driver Location</b>`)
          .addTo(markersGroup);
        boundsPoints.push([driverLocation.latitude, driverLocation.longitude]);
      }

      // Nearby Drivers
      if (nearbyDrivers && nearbyDrivers.length > 0) {
        nearbyDrivers.forEach((dr) => {
          if (dr.currentLocation) {
            L.marker([dr.currentLocation.latitude, dr.currentLocation.longitude], {
              icon: driverIcon,
            })
              .bindPopup(`<b>${dr.fullName}</b><br/>${sanitizeVehicleInfo(dr.vehicleInfo)}`)
              .addTo(markersGroup);
          }
        });
      }

      // Determine routing start and end points based on ride status
      let routeStart: LocationPoint | null = null;
      let routeEnd: LocationPoint | null = null;

      if (rideStatus === 'DRIVER_ASSIGNED' && driverLocation && pickup) {
        // Leg 1: Driver heading to Pickup
        routeStart = driverLocation;
        routeEnd = pickup;
      } else if (pickup && destination) {
        // Leg 2 / Main trip: Pickup to Destination
        routeStart = pickup;
        routeEnd = destination;
      }

      if (routeStart && routeEnd) {
        setIsRouteLoading(true);

        try {
          const routeResult = await fetchRoadRoute(
            routeStart.latitude,
            routeStart.longitude,
            routeEnd.latitude,
            routeEnd.longitude
          );

          if (isCancelled) return;

          setActiveRouteInfo(routeResult);
          setActiveStepIndex(0);

          // Render Google Maps Style Double Polyline
          if (routeResult.coordinates.length > 0) {
            // Casing (Light blue background stroke for high visibility)
            L.polyline(routeResult.coordinates, {
              color: '#0D47A1',
              weight: 8,
              opacity: 0.85,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(routesGroup);

            // Main Vibrant Blue Stroke (#2196F3)
            const mainColor = rideStatus === 'DRIVER_ASSIGNED' ? '#FF9800' : '#2196F3';
            L.polyline(routeResult.coordinates, {
              color: mainColor,
              weight: 5,
              opacity: 0.98,
              lineCap: 'round',
              lineJoin: 'round',
            }).addTo(routesGroup);

            // Turn Waypoints
            routeResult.steps.forEach((step) => {
              if (step.type === 'turn' || step.type === 'roundabout') {
                L.circleMarker(step.location, {
                  radius: 4,
                  color: '#0D47A1',
                  fillColor: '#FFFFFF',
                  fillOpacity: 1,
                  weight: 2,
                }).addTo(routesGroup);
              }
            });

            // Expand map bounds to comfortably fit all coordinates
            routeResult.coordinates.forEach((coord) => boundsPoints.push(coord));
          }
        } catch (err) {
          console.error('Failed to load road route:', err);
        } finally {
          if (!isCancelled) setIsRouteLoading(false);
        }
      } else {
        setActiveRouteInfo(null);
      }

      // Fit map bounds smoothly
      if (boundsPoints.length > 0) {
        map.fitBounds(boundsPoints, { padding: [45, 45], maxZoom: 17 });
      }
    };

    loadRoadRoutes();

    return () => {
      isCancelled = true;
    };
  }, [pickup, destination, driverLocation, nearbyDrivers, rideStatus, stations]);

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      if (driverLocation) {
        mapInstanceRef.current.setView([driverLocation.latitude, driverLocation.longitude], 16);
      } else if (pickup) {
        mapInstanceRef.current.setView([pickup.latitude, pickup.longitude], 16);
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          mapInstanceRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 16);
        });
      } else {
        mapInstanceRef.current.setView(center, zoom);
      }
    }
  };

  // Helper to render turn maneuver icon
  const renderTurnIcon = (step?: RouteStep) => {
    if (!step) return <Navigation className="w-5 h-5 text-white" />;
    const mod = (step.modifier || '').toLowerCase();
    const type = (step.type || '').toLowerCase();

    if (mod.includes('left')) return <CornerUpLeft className="w-6 h-6 text-white" />;
    if (mod.includes('right')) return <CornerUpRight className="w-6 h-6 text-white" />;
    if (type.includes('arrive')) return <CheckCircle2 className="w-6 h-6 text-white" />;

    return <ArrowUp className="w-6 h-6 text-white" />;
  };

  const currentStep = activeRouteInfo?.steps[activeStepIndex];

  return (
    <div
      className={`map-card-wrapper relative overflow-hidden isolate ${className}`}
      style={{
        isolation: 'isolate',
        contain: 'paint',
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        WebkitMaskImage: '-webkit-radial-gradient(white, black)',
      }}
    >
      {/* Map Element */}
      <div ref={mapContainerRef} className="w-full h-full relative z-0 bg-[#E3F2FD] overflow-hidden" />

      {/* Interactive Selection Banner Overlay */}
      {isSelectingLocation && (
        <div className="absolute top-4 left-4 right-4 z-10 bg-white/95 backdrop-blur border-2 border-[#0D47A1] text-[#0D47A1] px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-pulse">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#0D47A1] rounded-full animate-ping"></span>
            <span className="font-bold">Tap anywhere on map to select <b>{isSelectingLocation}</b></span>
          </div>
        </div>
      )}

      {/* NAVIGATION BANNER */}
      {showNavigationBanner && activeRouteInfo && (
        <div className="absolute top-3 left-3 right-3 z-10 max-w-md mx-auto animate-in slide-in-from-top duration-300">
          <div className="bg-white/95 backdrop-blur-xl border-2 border-[#0D47A1] text-[#0D47A1] rounded-2xl p-3.5 shadow-xl flex items-center justify-between gap-3">
            <div className="w-11 h-11 bg-[#0D47A1] rounded-xl flex items-center justify-center shrink-0 shadow-md">
              {renderTurnIcon(currentStep)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-black text-[#0D47A1] uppercase tracking-widest">
                <span>GPS TURN NAVIGATION</span>
                {isRouteLoading && <span className="text-slate-400 animate-pulse">(Updating...)</span>}
              </div>
              <h4 className="text-xs font-black text-[#0D47A1] truncate leading-tight">
                {currentStep ? currentStep.instruction : 'Follow highlighted road path'}
              </h4>
              <p className="text-[10px] text-slate-600 truncate mt-0.5 font-medium">
                {activeRouteInfo.distanceKm} km total &bull; ~{activeRouteInfo.durationMinutes} mins
              </p>
            </div>

            {activeRouteInfo.steps.length > 1 && (
              <button
                onClick={() =>
                  setActiveStepIndex((prev) => (prev + 1) % activeRouteInfo.steps.length)
                }
                className="bg-[#0D47A1] hover:bg-[#1565C0] text-white text-[9px] font-extrabold px-2.5 py-1.5 rounded-lg border border-[#0D47A1] shrink-0 uppercase tracking-wider transition-colors shadow-sm"
              >
                NEXT &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* Recenter / GPS Button */}
      <button
        onClick={handleRecenter}
        type="button"
        className="absolute bottom-6 right-4 z-10 bg-white text-[#0D47A1] hover:bg-[#0D47A1] hover:text-white px-3.5 py-2.5 rounded-2xl border-2 border-[#0D47A1] text-xs font-bold shadow-xl backdrop-blur active:scale-95 transition-all flex items-center gap-1.5 group"
        title="Recenter Map"
      >
        <Compass className="w-4 h-4 text-[#0D47A1] group-hover:text-white transition-colors" />
        <span className="uppercase text-[10px] tracking-wider font-extrabold">RECENTER</span>
      </button>
    </div>
  );
};
