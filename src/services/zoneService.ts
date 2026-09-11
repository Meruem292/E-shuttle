import {
  collection,
  doc,
  addDoc,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { OperationalZone } from '../types';
import { calculateDistanceKm } from '../constants/fare';
import { logActivity } from './activityLogService';

export const ZONES_COLLECTION = 'operational_zones';
const LOCAL_STORAGE_ZONES_KEY = 'eshuttle_operational_zones_cache';
const LOCAL_DELETED_ZONES_KEY = 'eshuttle_deleted_zone_ids';

export const DEFAULT_INITIAL_ZONES: Omit<OperationalZone, 'id'>[] = [
  {
    name: 'Tagaytay City Hall & Government Center',
    code: 'tagaytay-city-hall',
    description: 'Primary administrative hub and central shuttle terminal boundary',
    centerLatitude: 14.1153,
    centerLongitude: 120.9621,
    radiusMeters: 1500,
    isActive: true,
  },
  {
    name: 'Tagaytay City National High School Campus',
    code: 'tagaytay-high-school',
    description: 'Educational district and student transit geofence',
    centerLatitude: 14.1180,
    centerLongitude: 120.9670,
    radiusMeters: 1200,
    isActive: true,
  },
];

function getDeletedZoneIds(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCAL_DELETED_ZONES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch {}
  return new Set();
}

function markZoneAsDeleted(id: string) {
  try {
    const current = getDeletedZoneIds();
    current.add(id);
    localStorage.setItem(LOCAL_DELETED_ZONES_KEY, JSON.stringify(Array.from(current)));
  } catch {}
}

function getLocalZones(): OperationalZone[] {
  try {
    const deleted = getDeletedZoneIds();
    const raw = localStorage.getItem(LOCAL_STORAGE_ZONES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const uniqueMap = new Map<string, OperationalZone>();
        for (const z of parsed) {
          if (z && z.id && !deleted.has(z.id)) uniqueMap.set(z.id, z);
        }
        return Array.from(uniqueMap.values());
      }
    }
  } catch (e) {
    console.warn('Could not read local zones cache', e);
  }
  return [];
}

function saveLocalZones(zones: OperationalZone[]) {
  try {
    const deleted = getDeletedZoneIds();
    const uniqueMap = new Map<string, OperationalZone>();
    for (const z of zones) {
      if (z && z.id && !deleted.has(z.id)) uniqueMap.set(z.id, z);
    }
    const deduplicated = Array.from(uniqueMap.values());
    localStorage.setItem(LOCAL_STORAGE_ZONES_KEY, JSON.stringify(deduplicated));
  } catch (e) {
    console.warn('Could not write local zones cache', e);
  }
}

function seedDefaultZonesIfEmptySync(): OperationalZone[] {
  const now = new Date().toISOString();
  const created = DEFAULT_INITIAL_ZONES.map((def, idx) => ({
    id: `default-zone-${idx + 1}`,
    ...def,
    createdAt: now,
    updatedAt: now,
  }));
  saveLocalZones(created);

  // Asynchronously push default zones to Firestore so they sync remotely
  for (const z of created) {
    addDoc(collection(db, ZONES_COLLECTION), {
      ...z,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  return created;
}

// In-memory subscribers for real-time fallback updates
const localZoneSubscribers = new Set<(zones: OperationalZone[]) => void>();

function notifyLocalZoneSubscribers() {
  const current = getLocalZones();
  localZoneSubscribers.forEach((cb) => cb(current));
}

/**
 * Real-time listener for operational zones
 */
export function listenToOperationalZones(
  callback: (zones: OperationalZone[]) => void
): () => void {
  // Provide initial zones immediately
  let initial = getLocalZones();
  if (initial.length === 0) {
    initial = seedDefaultZonesIfEmptySync();
  }
  callback(initial);
  localZoneSubscribers.add(callback);

  let isUnsubscribed = false;
  let unsubscribeFirestore = () => {};

  try {
    const q = query(collection(db, ZONES_COLLECTION), orderBy('name', 'asc'));

    unsubscribeFirestore = onSnapshot(
      q,
      (snapshot) => {
        if (isUnsubscribed) return;
        const deletedIds = getDeletedZoneIds();
        const remoteZones: OperationalZone[] = snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<OperationalZone, 'id'>),
          }))
          .filter((z) => !deletedIds.has(z.id));

        // Merge remote list with any local unsynced zones
        const localList = getLocalZones().filter((z) => !deletedIds.has(z.id));
        const remoteIds = new Set(remoteZones.map((z) => z.id));
        const unsyncedLocal = localList.filter((z) => !remoteIds.has(z.id));

        let merged = [...remoteZones, ...unsyncedLocal];

        // Seed initial defaults if system has zero zones
        if (merged.length === 0 && deletedIds.size === 0) {
          merged = seedDefaultZonesIfEmptySync();
        }

        saveLocalZones(merged);
        callback(merged);
      },
      (err) => {
        console.warn('Firestore zones listener fallback to local cache:', err.message);
        if (!isUnsubscribed) {
          callback(getLocalZones());
        }
      }
    );
  } catch (err) {
    console.warn('Error setting up Firestore zones listener, using local:', err);
    callback(getLocalZones());
  }

  return () => {
    isUnsubscribed = true;
    localZoneSubscribers.delete(callback);
    try {
      unsubscribeFirestore();
    } catch {}
  };
}

/**
 * Get all operational zones
 */
export async function getOperationalZones(): Promise<OperationalZone[]> {
  try {
    const snap = await getDocs(query(collection(db, ZONES_COLLECTION), orderBy('name', 'asc')));
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OperationalZone, 'id'>) }));
    saveLocalZones(list);
    return list;
  } catch (err) {
    console.warn('Error getting zones from Firestore, using local cache:', err);
    return getLocalZones();
  }
}

/**
 * Create a new operational zone
 */
export async function addOperationalZone(
  zone: Omit<OperationalZone, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const newZoneData = {
    name: zone.name.trim(),
    code: (zone.code || zone.name).toLowerCase().replace(/[^a-z0-9]/g, '-'),
    description: zone.description || '',
    centerLatitude: Number(zone.centerLatitude),
    centerLongitude: Number(zone.centerLongitude),
    radiusMeters: Number(zone.radiusMeters) || 1500,
    isActive: zone.isActive ?? true,
  };

  let assignedId = `zone-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  try {
    const docRef = await addDoc(collection(db, ZONES_COLLECTION), {
      ...newZoneData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    assignedId = docRef.id;
  } catch (err) {
    console.warn('Firestore addDoc zone fallback to local cache:', err);
  }

  const localList = getLocalZones();
  const fullZone: OperationalZone = {
    id: assignedId,
    ...newZoneData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const filteredList = localList.filter((z) => z.id !== assignedId);
  saveLocalZones([...filteredList, fullZone]);
  notifyLocalZoneSubscribers();

  // Audit log creation
  logActivity({
    action: 'CREATE',
    actionLabel: 'Created Service Zone',
    entityType: 'ZONE',
    entityId: assignedId,
    entityName: newZoneData.name,
    summary: `Created geofence service zone "${newZoneData.name}" with radius ${newZoneData.radiusMeters}m`,
    details: {
      summary: `Zone registered with boundary center [${newZoneData.centerLatitude}, ${newZoneData.centerLongitude}]`,
      after: newZoneData,
    },
    severity: 'success',
  }).catch(() => {});

  return assignedId;
}

/**
 * Update an existing operational zone
 */
export async function updateOperationalZone(
  id: string,
  updates: Partial<OperationalZone>
): Promise<void> {
  const localList = getLocalZones();
  const existing = localList.find((z) => z.id === id);

  try {
    const zoneRef = doc(db, ZONES_COLLECTION, id);
    await updateDoc(zoneRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore updateDoc zone fallback to local cache:', err);
  }

  const updatedList = localList.map((z) => (z.id === id ? { ...z, ...updates } : z));
  saveLocalZones(updatedList);
  notifyLocalZoneSubscribers();

  // Audit log update
  logActivity({
    action: 'UPDATE',
    actionLabel: 'Updated Service Zone',
    entityType: 'ZONE',
    entityId: id,
    entityName: updates.name || existing?.name || id,
    summary: `Updated geofence zone "${updates.name || existing?.name || id}"`,
    details: {
      summary: `Zone attributes updated: ${Object.keys(updates).join(', ')}`,
      before: existing ? { ...existing } : null,
      after: updates,
    },
    severity: 'info',
  }).catch(() => {});
}

/**
 * Delete an operational zone
 */
export async function deleteOperationalZone(id: string, nameHint?: string): Promise<void> {
  markZoneAsDeleted(id);

  const localList = getLocalZones();
  const existing = localList.find((z) => z.id === id);
  const zoneName = nameHint || existing?.name || id;

  try {
    const zoneRef = doc(db, ZONES_COLLECTION, id);
    await deleteDoc(zoneRef);
  } catch (err) {
    console.warn('Firestore deleteDoc zone fallback to local cache:', err);
  }

  const filtered = localList.filter((z) => z.id !== id);
  saveLocalZones(filtered);
  notifyLocalZoneSubscribers();

  // Audit log deletion
  await logActivity({
    action: 'DELETE',
    actionLabel: 'Deleted Service Zone',
    entityType: 'ZONE',
    entityId: id,
    entityName: zoneName,
    summary: `Deleted geofence service zone "${zoneName}"`,
    details: {
      summary: `Geofence zone deleted from system by administrator`,
      before: existing ? { ...existing } : null,
    },
    severity: 'danger',
  });
}

import { ShuttleStation } from '../types';

/**
 * Validates if a user's GPS coordinates are within a zone's operational boundary radius.
 * Geofencing starts with the station pins registered under that zone (e.g. 100m catchment from pins).
 */
export function checkLocationWithinZone(
  lat: number,
  lng: number,
  zone: OperationalZone,
  stations: ShuttleStation[] = []
): { isWithinZone: boolean; distanceMeters: number; nearestStation?: ShuttleStation | null } {
  const zonePins = stations.filter((s) => s.zoneId === zone.id && s.isActive !== false);

  if (zonePins.length > 0) {
    let minPinDist = Infinity;
    let closestPin: ShuttleStation | null = null;

    for (const pin of zonePins) {
      const distKm = calculateDistanceKm(lat, lng, pin.latitude, pin.longitude);
      const distMeters = Math.round(distKm * 1000);
      if (distMeters < minPinDist) {
        minPinDist = distMeters;
        closestPin = pin;
      }
    }

    const pinCatchmentRadius = closestPin?.radiusMeters || 100;
    return {
      isWithinZone: minPinDist <= pinCatchmentRadius,
      distanceMeters: minPinDist,
      nearestStation: closestPin,
    };
  }

  // Fallback if no station pins are under the zone yet
  if (!zone.centerLatitude || !zone.centerLongitude) {
    return { isWithinZone: true, distanceMeters: 0 };
  }

  const distKm = calculateDistanceKm(lat, lng, zone.centerLatitude, zone.centerLongitude);
  const distanceMeters = Math.round(distKm * 1000);
  const maxRadiusMeters = zone.radiusMeters || 100;

  return {
    isWithinZone: distanceMeters <= maxRadiusMeters,
    distanceMeters,
  };
}

/**
 * Finds the closest active zone to a given GPS location based on station pins under each zone
 */
export function findNearestZone(
  lat: number,
  lng: number,
  zones: OperationalZone[],
  stations: ShuttleStation[] = []
): { nearestZone: OperationalZone | null; distanceMeters: number; isWithinBoundary: boolean; nearestStation: ShuttleStation | null } {
  const activeZones = zones.filter((z) => z.isActive !== false);
  if (activeZones.length === 0) {
    return { nearestZone: null, distanceMeters: 0, isWithinBoundary: false, nearestStation: null };
  }

  let closestZone: OperationalZone | null = null;
  let minZoneDistance = Infinity;
  let closestStationPin: ShuttleStation | null = null;

  for (const zone of activeZones) {
    const check = checkLocationWithinZone(lat, lng, zone, stations);
    if (check.distanceMeters < minZoneDistance) {
      minZoneDistance = check.distanceMeters;
      closestZone = zone;
      closestStationPin = check.nearestStation || null;
    }
  }

  const allowedRadius = closestStationPin?.radiusMeters || closestZone?.radiusMeters || 100;
  const isWithin = closestZone ? minZoneDistance <= allowedRadius : false;

  return {
    nearestZone: closestZone,
    distanceMeters: Math.round(minZoneDistance),
    isWithinBoundary: isWithin,
    nearestStation: closestStationPin,
  };
}
