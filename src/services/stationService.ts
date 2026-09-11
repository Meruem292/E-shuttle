import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { ShuttleStation } from '../types';
import { logActivity } from './activityLogService';

export const STATIONS_COLLECTION = 'shuttleStations';
export const DEFAULT_STATION_RADIUS_METERS = 100; // 100m catchment / tagging radius from station pins

/**
 * Calculates distance between two coordinates in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Checks if a given coordinate is within proximity of ANY active designated shuttle station.
 * @param pointType Optional check for 'pickup' or 'dropoff' permission
 */
export function checkLocationWithinStationArea(
  lat: number,
  lng: number,
  stations: ShuttleStation[],
  pointType?: 'pickup' | 'dropoff',
  fallbackRadiusMeters: number = DEFAULT_STATION_RADIUS_METERS
): {
  isWithinRadius: boolean;
  nearestStation: ShuttleStation | null;
  distanceMeters: number;
} {
  const activeStations = stations.filter((s) => {
    if (s.isActive === false) return false;
    if (pointType === 'pickup') {
      return s.allowPickup !== false && s.allowedType !== 'dropoff_only';
    }
    if (pointType === 'dropoff') {
      return s.allowDropoff !== false && s.allowedType !== 'pickup_only';
    }
    return true;
  });

  if (activeStations.length === 0) {
    // If no stations match the filtered role, fall back to any active station or allow if system has no stations
    const fallbackActive = stations.filter((s) => s.isActive !== false);
    if (fallbackActive.length === 0) {
      return {
        isWithinRadius: true,
        nearestStation: null,
        distanceMeters: 0,
      };
    }
  }

  const poolToSearch = activeStations.length > 0 ? activeStations : stations.filter((s) => s.isActive !== false);

  let nearestStation: ShuttleStation | null = null;
  let minDistance = Infinity;

  for (const station of poolToSearch) {
    const dist = calculateDistanceMeters(lat, lng, station.latitude, station.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      nearestStation = station;
    }
  }

  if (!nearestStation) {
    return { isWithinRadius: false, nearestStation: null, distanceMeters: Infinity };
  }

  const allowedRadius = nearestStation.radiusMeters || fallbackRadiusMeters;
  const isWithin = minDistance <= allowedRadius;

  return {
    isWithinRadius: isWithin,
    nearestStation,
    distanceMeters: minDistance,
  };
}

const LOCAL_STORAGE_KEY = 'eshuttle_stations_cache';

function getLocalStations(): ShuttleStation[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Filter out any previously seeded mock/demo stations (e.g. default-*, seed-*)
        const realOnly = parsed.filter(
          (st) => st && st.id && !st.id.startsWith('default-') && !st.id.startsWith('seed-')
        );
        // Deduplicate by station ID
        const uniqueMap = new Map<string, ShuttleStation>();
        for (const st of realOnly) {
          if (st && st.id) uniqueMap.set(st.id, st);
        }
        const deduplicated = Array.from(uniqueMap.values());
        if (deduplicated.length !== parsed.length) {
          saveLocalStations(deduplicated);
        }
        return deduplicated;
      }
    }
  } catch (e) {
    console.warn('Could not read local stations cache', e);
  }
  return [];
}

function saveLocalStations(stations: ShuttleStation[]) {
  try {
    const uniqueMap = new Map<string, ShuttleStation>();
    for (const st of stations) {
      if (st && st.id) {
        uniqueMap.set(st.id, st);
      }
    }
    const deduplicated = Array.from(uniqueMap.values());
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(deduplicated));
  } catch (e) {
    console.warn('Could not write local stations cache', e);
  }
}

// In-memory subscribers for instant updates when fallback is used
const localSubscribers = new Set<(stations: ShuttleStation[]) => void>();

function notifyLocalSubscribers() {
  const current = getLocalStations();
  localSubscribers.forEach((cb) => cb(current));
}

/**
 * Real-time listener for shuttle stations with graceful local fallback
 */
export function listenToShuttleStations(
  callback: (stations: ShuttleStation[]) => void
): () => void {
  // Provide cached/initial stations immediately
  const initial = getLocalStations();
  callback(initial);

  // Register in local subscribers
  localSubscribers.add(callback);

  let isUnsubscribed = false;
  let unsubscribeFirestore = () => {};

  try {
    const q = query(collection(db, STATIONS_COLLECTION), orderBy('name', 'asc'));

    unsubscribeFirestore = onSnapshot(
      q,
      (snapshot) => {
        if (isUnsubscribed) return;
        const stations: ShuttleStation[] = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<ShuttleStation, 'id'>),
          }))
          .filter(
            (st) => !st.id.startsWith('default-') && !st.id.startsWith('seed-')
          );
        saveLocalStations(stations);
        callback(stations);
      },
      (err) => {
        console.warn('Firestore station listener fallback to local cache:', err.message);
        if (!isUnsubscribed) {
          const current = getLocalStations();
          callback(current);
        }
      }
    );
  } catch (err) {
    console.warn('Error setting up Firestore listener, using local:', err);
    callback(getLocalStations());
  }

  return () => {
    isUnsubscribed = true;
    localSubscribers.delete(callback);
    try {
      unsubscribeFirestore();
    } catch {}
  };
}

/**
 * Fetch all shuttle stations (one-time read)
 */
export async function getShuttleStations(): Promise<ShuttleStation[]> {
  try {
    const snap = await getDocs(query(collection(db, STATIONS_COLLECTION), orderBy('name', 'asc')));
    const list = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ShuttleStation, 'id'>) }))
      .filter((st) => !st.id.startsWith('default-') && !st.id.startsWith('seed-'));
    saveLocalStations(list);
    return list;
  } catch (err) {
    console.warn('Error getting shuttle stations, using local cache:', err);
    return getLocalStations();
  }
}

/**
 * Add a new designated shuttle station pin
 */
export async function addShuttleStation(
  station: Omit<ShuttleStation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const newStationData = {
    ...station,
    radiusMeters: station.radiusMeters || DEFAULT_STATION_RADIUS_METERS,
    isActive: station.isActive ?? true,
    allowedType: station.allowedType || 'both',
    allowPickup: station.allowPickup !== undefined ? station.allowPickup : (station.allowedType !== 'dropoff_only'),
    allowDropoff: station.allowDropoff !== undefined ? station.allowDropoff : (station.allowedType !== 'pickup_only'),
  };

  let assignedId = `station-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    const docRef = await addDoc(collection(db, STATIONS_COLLECTION), {
      ...newStationData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    assignedId = docRef.id;
  } catch (err) {
    console.warn('Firestore addDoc fallback to local cache:', err);
  }

  // Update local cache & notify
  const localList = getLocalStations();
  const fullStation: ShuttleStation = {
    id: assignedId,
    ...newStationData,
    createdAt: new Date().toISOString() as any,
    updatedAt: new Date().toISOString() as any,
  };
  const filteredList = localList.filter((s) => s.id !== assignedId);
  saveLocalStations([...filteredList, fullStation]);
  notifyLocalSubscribers();

  // Audit log creation
  logActivity({
    action: 'CREATE',
    actionLabel: 'Created Station Pin',
    entityType: 'STATION',
    entityId: assignedId,
    entityName: newStationData.name,
    summary: `Created designated shuttle station "${newStationData.name}" (${newStationData.allowedType}) with ${newStationData.radiusMeters}m geofence`,
    details: {
      summary: `Designated shuttle station added at coordinates [${newStationData.latitude}, ${newStationData.longitude}]`,
      after: newStationData,
    },
    severity: 'success',
  }).catch(() => {});

  return assignedId;
}

/**
 * Update an existing designated shuttle station
 */
export async function updateShuttleStation(
  id: string,
  updates: Partial<ShuttleStation>
): Promise<void> {
  const localList = getLocalStations();
  const existing = localList.find((st) => st.id === id);

  try {
    const stationRef = doc(db, STATIONS_COLLECTION, id);
    await updateDoc(stationRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore updateDoc fallback to local cache:', err);
  }

  // Update local cache & notify
  const updatedList = localList.map((st) => (st.id === id ? { ...st, ...updates } : st));
  saveLocalStations(updatedList);
  notifyLocalSubscribers();

  // Audit log update
  logActivity({
    action: 'UPDATE',
    actionLabel: 'Updated Station',
    entityType: 'STATION',
    entityId: id,
    entityName: updates.name || existing?.name || id,
    summary: `Updated shuttle station "${updates.name || existing?.name || id}" attributes`,
    details: {
      summary: `Station modified with fields: ${Object.keys(updates).join(', ')}`,
      before: existing ? { ...existing } : null,
      after: updates,
    },
    severity: 'info',
  }).catch(() => {});
}

/**
 * Delete a designated shuttle station
 */
export async function deleteShuttleStation(id: string, nameHint?: string): Promise<void> {
  const localList = getLocalStations();
  const existing = localList.find((st) => st.id === id);
  const stationName = nameHint || existing?.name || id;

  try {
    const stationRef = doc(db, STATIONS_COLLECTION, id);
    await deleteDoc(stationRef);
  } catch (err) {
    console.warn('Firestore deleteDoc fallback to local cache:', err);
  }

  // Always update local cache & notify subscribers so UI immediately removes the pin
  const filtered = localList.filter((st) => st.id !== id);
  saveLocalStations(filtered);
  notifyLocalSubscribers();

  // Audit log deletion
  await logActivity({
    action: 'DELETE',
    actionLabel: 'Deleted Station Pin',
    entityType: 'STATION',
    entityId: id,
    entityName: stationName,
    summary: `Deleted shuttle station pin "${stationName}"`,
    details: {
      summary: `Station deleted from system by administrator`,
      before: existing ? { ...existing } : null,
    },
    severity: 'danger',
  });
}

/**
 * Empty placeholder for backwards-compatibility without adding demo/static data
 */
export const DEFAULT_INITIAL_STATIONS: Omit<ShuttleStation, 'id'>[] = [];

/**
 * No-op function to prevent injecting demo/static data
 */
export async function seedDefaultStationsIfEmpty(): Promise<void> {
  // Demo/static data seeding is completely prohibited
}
