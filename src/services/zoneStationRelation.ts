import { OperationalZone, ShuttleStation } from '../types';
import { calculateDistanceKm } from '../constants/fare';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { STATIONS_COLLECTION } from './stationService';

/**
 * Checks whether a designated shuttle station belongs to a given operational zone.
 * Uses a 3-tier matching pipeline:
 * 1. Explicit zoneId matching
 * 2. Case-insensitive zoneName or zoneCode matching
 * 3. Spatial geofence containment (distance between station coordinates and zone center <= zone radius)
 */
export function isStationInZone(station: ShuttleStation, zone: OperationalZone): boolean {
  if (!station || !zone) return false;

  // 1. Direct ID match
  if (station.zoneId && station.zoneId === zone.id) {
    return true;
  }

  // 2. Name / Code match (handles re-seeded or renamed zones)
  if (station.zoneName) {
    const cleanStationZoneName = station.zoneName.trim().toLowerCase();
    const cleanZoneName = (zone.name || '').trim().toLowerCase();
    const cleanZoneCode = (zone.code || '').trim().toLowerCase();
    if (
      cleanStationZoneName === cleanZoneName ||
      (cleanZoneCode && cleanStationZoneName === cleanZoneCode)
    ) {
      return true;
    }
  }

  // 3. Spatial Geofence Containment
  if (
    typeof station.latitude === 'number' &&
    typeof station.longitude === 'number' &&
    typeof zone.centerLatitude === 'number' &&
    typeof zone.centerLongitude === 'number'
  ) {
    const distKm = calculateDistanceKm(
      station.latitude,
      station.longitude,
      zone.centerLatitude,
      zone.centerLongitude
    );
    const distMeters = Math.round(distKm * 1000);
    const allowedRadius = zone.radiusMeters || 1500;
    if (distMeters <= allowedRadius) {
      return true;
    }
  }

  return false;
}

/**
 * Returns all active stations that belong to a specific operational zone.
 */
export function getStationsForZone(
  zone: OperationalZone | null | undefined,
  stations: ShuttleStation[]
): ShuttleStation[] {
  if (!zone || !stations || stations.length === 0) return [];
  return stations.filter((s) => s.isActive !== false && isStationInZone(s, zone));
}

/**
 * Automatically finds the most appropriate Operational Zone for a given station pin or coordinate.
 */
export function findZoneForStation(
  station: { latitude: number; longitude: number; zoneId?: string | null; zoneName?: string | null },
  zones: OperationalZone[]
): OperationalZone | null {
  if (!zones || zones.length === 0) return null;
  const activeZones = zones.filter((z) => z.isActive !== false);
  const searchPool = activeZones.length > 0 ? activeZones : zones;

  // 1. Direct ID match
  if (station.zoneId) {
    const direct = searchPool.find((z) => z.id === station.zoneId);
    if (direct) return direct;
  }

  // 2. Name / Code match
  if (station.zoneName) {
    const cleanName = station.zoneName.trim().toLowerCase();
    const nameMatch = searchPool.find(
      (z) =>
        z.name.trim().toLowerCase() === cleanName ||
        (z.code && z.code.trim().toLowerCase() === cleanName)
    );
    if (nameMatch) return nameMatch;
  }

  // 3. Spatial Geofence Containment & Nearest Distance
  let closestZone: OperationalZone | null = null;
  let minDistance = Infinity;

  for (const zone of searchPool) {
    if (
      typeof station.latitude === 'number' &&
      typeof station.longitude === 'number' &&
      typeof zone.centerLatitude === 'number' &&
      typeof zone.centerLongitude === 'number'
    ) {
      const distKm = calculateDistanceKm(
        station.latitude,
        station.longitude,
        zone.centerLatitude,
        zone.centerLongitude
      );
      const distMeters = Math.round(distKm * 1000);
      if (distMeters < minDistance) {
        minDistance = distMeters;
        closestZone = zone;
      }
    }
  }

  if (closestZone) {
    return closestZone;
  }

  return searchPool[0] || null;
}

/**
 * Self-healing pipeline: Scans existing stations against active zones and heals any disconnected or outdated zone references.
 */
export async function autoHealStationZoneRelations(
  stations: ShuttleStation[],
  zones: OperationalZone[]
): Promise<number> {
  if (!stations.length || !zones.length) return 0;

  let healedCount = 0;
  const activeZones = zones.filter((z) => z.isActive !== false);
  if (!activeZones.length) return 0;

  for (const station of stations) {
    const matchedZone = findZoneForStation(station, activeZones);
    if (!matchedZone) continue;

    // Check if station has missing or disconnected zoneId / zoneName
    const isMismatched =
      station.zoneId !== matchedZone.id ||
      station.zoneName !== matchedZone.name;

    if (isMismatched) {
      healedCount++;
      station.zoneId = matchedZone.id;
      station.zoneName = matchedZone.name;

      // Asynchronously update in Firestore without blocking
      try {
        const stationRef = doc(db, STATIONS_COLLECTION, station.id);
        updateDoc(stationRef, {
          zoneId: matchedZone.id,
          zoneName: matchedZone.name,
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          console.warn(`[AutoHeal] Could not sync station ${station.id} to Firestore:`, err);
        });
      } catch (e) {
        console.warn(`[AutoHeal] Error updating station ${station.id}:`, e);
      }
    }
  }

  return healedCount;
}
