import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit as firestoreLimit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';

export type ActivityAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'STATUS_CHANGE'
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_REGISTER'
  | 'AUTH_FORGOT_PASSWORD'
  | 'SETTINGS_UPDATE';

export type ActivityEntityType =
  | 'STATION'
  | 'ZONE'
  | 'SHUTTLE'
  | 'RIDE'
  | 'USER'
  | 'DRIVER'
  | 'INCIDENT'
  | 'SETTINGS'
  | 'AUTH'
  | 'ADMIN';

export interface ActivityUser {
  uid: string;
  name: string;
  email?: string;
  role?: string;
}

export interface ActivityLog {
  id: string;
  action: ActivityAction;
  actionLabel: string;
  entityType: ActivityEntityType;
  entityId?: string;
  entityName?: string;
  summary: string;
  details?: {
    summary?: string;
    before?: Record<string, any> | null;
    after?: Record<string, any> | null;
    metadata?: Record<string, any> | null;
  };
  performedBy: ActivityUser;
  timestamp: string; // ISO string
  severity: 'info' | 'success' | 'warning' | 'danger';
}

export const ACTIVITY_LOGS_COLLECTION = 'activityLogs';
const LOCAL_STORAGE_KEY = 'eshuttle_activity_logs_cache';

/**
 * Reads local cached activity logs
 */
export function getLocalActivityLogs(): ActivityLog[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not read local activity logs cache', e);
  }
  return [];
}

/**
 * Saves activity logs to local storage
 */
export function saveLocalActivityLogs(logs: ActivityLog[]) {
  try {
    // Keep max 200 items in local storage cache
    const trimmed = logs.slice(0, 200);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn('Could not write local activity logs cache', e);
  }
}

// In-memory subscribers
const subscribers = new Set<(logs: ActivityLog[]) => void>();

function notifySubscribers() {
  const logs = getLocalActivityLogs();
  subscribers.forEach((cb) => cb(logs));
}

/**
 * Helper to determine default actor if not specified
 */
function resolveCurrentActor(): ActivityUser {
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const email = currentUser.email || '';
      const isAdmin = email.toLowerCase() === 'admin@eshuttle.com' || email.toLowerCase().startsWith('admin');
      return {
        uid: currentUser.uid,
        name: currentUser.displayName || (isAdmin ? 'Platform Administrator' : email.split('@')[0]) || 'Authenticated User',
        email: currentUser.email || undefined,
        role: isAdmin ? 'admin' : 'admin', // fallback default
      };
    }
  } catch {}

  return {
    uid: 'system',
    name: 'System Dispatcher',
    role: 'system',
  };
}

/**
 * Log a new activity / CRUD event to Firestore and local cache
 */
export async function logActivity(entry: {
  action: ActivityAction;
  actionLabel?: string;
  entityType: ActivityEntityType;
  entityId?: string;
  entityName?: string;
  summary: string;
  details?: {
    summary?: string;
    before?: Record<string, any> | null;
    after?: Record<string, any> | null;
    metadata?: Record<string, any> | null;
  };
  performedBy?: Partial<ActivityUser>;
  severity?: 'info' | 'success' | 'warning' | 'danger';
}): Promise<string> {
  const currentActor = resolveCurrentActor();
  const performedBy: ActivityUser = {
    uid: entry.performedBy?.uid || currentActor.uid,
    name: entry.performedBy?.name || currentActor.name,
    email: entry.performedBy?.email || currentActor.email,
    role: entry.performedBy?.role || currentActor.role || 'system',
  };

  const severity: 'info' | 'success' | 'warning' | 'danger' =
    entry.severity ||
    (entry.action === 'DELETE'
      ? 'danger'
      : entry.action === 'CREATE'
      ? 'success'
      : entry.action === 'SETTINGS_UPDATE'
      ? 'warning'
      : 'info');

  const actionLabel =
    entry.actionLabel ||
    `${entry.action.replace('_', ' ')} ${entry.entityType.toLowerCase()}`;

  const timestamp = new Date().toISOString();
  let assignedId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const logPayload = {
    action: entry.action,
    actionLabel,
    entityType: entry.entityType,
    entityId: entry.entityId || null,
    entityName: entry.entityName || null,
    summary: entry.summary,
    details: entry.details || null,
    performedBy: {
      uid: performedBy.uid || 'system',
      name: performedBy.name || 'System Dispatcher',
      ...(performedBy.email ? { email: performedBy.email } : {}),
      ...(performedBy.role ? { role: performedBy.role } : {}),
    },
    timestamp,
    severity,
  };

  try {
    const docRef = await addDoc(collection(db, ACTIVITY_LOGS_COLLECTION), {
      ...logPayload,
      createdAt: serverTimestamp(),
    });
    assignedId = docRef.id;
  } catch (err: any) {
    if (err?.code === 'permission-denied' || String(err?.message || err).includes('permissions')) {
      if (typeof window !== 'undefined' && !(window as any).__eshuttle_activity_perm_warned) {
        (window as any).__eshuttle_activity_perm_warned = true;
        console.info(
          'Firestore activityLogs: Running in local cache mode. Ensure firestore.rules has "match /activityLogs/{logId} { allow read, write: if true; }" deployed in Firebase Console to sync in cloud.'
        );
      }
    } else {
      console.warn('Firestore logActivity fallback to local:', err);
    }
  }

  // Update local memory and cache
  const fullLog: ActivityLog = {
    id: assignedId,
    ...logPayload,
    entityId: entry.entityId,
    entityName: entry.entityName,
    details: entry.details,
  };

  const currentLogs = getLocalActivityLogs();
  const updatedLogs = [fullLog, ...currentLogs.filter((l) => l.id !== assignedId)].slice(0, 300);
  saveLocalActivityLogs(updatedLogs);
  notifySubscribers();

  return assignedId;
}

/**
 * Real-time listener for activity and audit logs
 */
export function listenToActivityLogs(
  callback: (logs: ActivityLog[]) => void,
  maxRecords: number = 200
): () => void {
  // Return cached immediately for fast UI rendering
  const initial = getLocalActivityLogs();
  callback(initial);

  subscribers.add(callback);

  let isUnsubscribed = false;
  let unsubscribeFirestore = () => {};

  try {
    const q = query(
      collection(db, ACTIVITY_LOGS_COLLECTION),
      orderBy('timestamp', 'desc'),
      firestoreLimit(maxRecords)
    );

    unsubscribeFirestore = onSnapshot(
      q,
      (snapshot) => {
        if (isUnsubscribed) return;
        const list: ActivityLog[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            action: data.action || 'UPDATE',
            actionLabel: data.actionLabel || 'Activity Event',
            entityType: data.entityType || 'SYSTEM',
            entityId: data.entityId || undefined,
            entityName: data.entityName || undefined,
            summary: data.summary || 'System activity occurred',
            details: data.details || undefined,
            performedBy: data.performedBy || { uid: 'system', name: 'System Dispatcher', role: 'system' },
            timestamp: data.timestamp || (data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString()),
            severity: data.severity || 'info',
          };
        });

        // Merge with any local logs that may not have synced yet
        const localList = getLocalActivityLogs();
        const firestoreIds = new Set(list.map((l) => l.id));
        const unsyncedLocal = localList.filter((l) => !firestoreIds.has(l.id));
        const merged = [...list, ...unsyncedLocal].sort((a, b) => {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

        saveLocalActivityLogs(merged);
        callback(merged);
      },
      (err: any) => {
        if (err?.code === 'permission-denied' || String(err?.message || err).includes('permissions')) {
          if (typeof window !== 'undefined' && !(window as any).__eshuttle_listener_perm_warned) {
            (window as any).__eshuttle_listener_perm_warned = true;
            console.info('Firestore activity logs listener using local cache fallback.');
          }
        } else {
          console.warn('Firestore activity logs listener fallback to local:', err);
        }
        if (!isUnsubscribed) {
          callback(getLocalActivityLogs());
        }
      }
    );
  } catch (err) {
    console.warn('Error setting up activity log listener:', err);
    callback(getLocalActivityLogs());
  }

  return () => {
    isUnsubscribed = true;
    subscribers.delete(callback);
    try {
      unsubscribeFirestore();
    } catch {}
  };
}

/**
 * Clear or purge activity logs (Admin function with back-tracking notice)
 */
export async function clearAllActivityLogs(): Promise<void> {
  try {
    const snap = await getDocs(query(collection(db, ACTIVITY_LOGS_COLLECTION), firestoreLimit(100)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.warn('Error purging Firestore activity logs:', err);
  }

  localStorage.removeItem(LOCAL_STORAGE_KEY);
  notifySubscribers();

  // Record a log that logs were cleared
  await logActivity({
    action: 'DELETE',
    actionLabel: 'Audit Logs Purged',
    entityType: 'SETTINGS',
    summary: 'Administrator cleared historical audit and activity logs cache',
    severity: 'warning',
  });
}

/**
 * Export logs to CSV file for archiving and compliance backtracking
 */
export function exportLogsToCSV(logs: ActivityLog[]) {
  if (!logs || logs.length === 0) return;

  const headers = [
    'Log ID',
    'Timestamp (UTC)',
    'Action',
    'Entity Type',
    'Entity ID',
    'Entity Name',
    'Summary',
    'Severity',
    'Actor Name',
    'Actor Role',
    'Actor UID',
    'Actor Email',
    'Changes Details (JSON)',
  ];

  const rows = logs.map((log) => {
    const escapeCsv = (str: string | undefined | null) => {
      if (str === undefined || str === null) return '""';
      const clean = String(str).replace(/"/g, '""');
      return `"${clean}"`;
    };

    const detailsJson = log.details ? JSON.stringify(log.details) : '';

    return [
      escapeCsv(log.id),
      escapeCsv(log.timestamp),
      escapeCsv(log.action),
      escapeCsv(log.entityType),
      escapeCsv(log.entityId || ''),
      escapeCsv(log.entityName || ''),
      escapeCsv(log.summary),
      escapeCsv(log.severity),
      escapeCsv(log.performedBy.name),
      escapeCsv(log.performedBy.role || ''),
      escapeCsv(log.performedBy.uid),
      escapeCsv(log.performedBy.email || ''),
      escapeCsv(detailsJson),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `e-shuttle-activity-logs-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export logs to structured JSON format
 */
export function exportLogsToJSON(logs: ActivityLog[]) {
  if (!logs || logs.length === 0) return;
  const jsonContent = JSON.stringify(logs, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `e-shuttle-activity-logs-${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
