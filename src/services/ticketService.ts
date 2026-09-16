import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { getOrCreateChannel, sendChatMessage } from './chatService';
import { logActivity } from './activityLogService';
import { addAppNotification, playPickupChime } from './notificationService';

export type IncidentCategory =
  | 'safety_emergency'
  | 'accident'
  | 'vehicle_breakdown'
  | 'lost_item'
  | 'driver_behavior'
  | 'passenger_conduct'
  | 'route_delay'
  | 'other';

export type TicketPriority = 'low' | 'medium' | 'high' | 'emergency';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'dismissed';

export interface TripSnapshotInfo {
  bookingId: string;
  bookingRef?: string;
  pickupAddress?: string;
  destinationAddress?: string;
  pickupTime?: string;
  dropoffTime?: string;
  status?: string;
  driverId?: string;
  driverName?: string;
  driverVehicleInfo?: string;
  customerId?: string;
  customerName?: string;
  distanceKm?: number;
  rating?: number;
}

export interface IncidentTicket {
  id: string;
  ticketNumber: string;
  reporterId: string;
  reporterName: string;
  reporterRole: 'customer' | 'driver' | 'admin';
  category: IncidentCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  locationAddress?: string;
  vehicleInfo?: string;
  ebikeId?: string;
  rideId?: string;
  tripSnapshot?: TripSnapshotInfo;
  status: TicketStatus;
  adminNotes?: string;
  dismissReason?: string;
  actionTaken?: 'warning_issued' | 'account_suspended' | 'resolved' | 'dismissed' | 'none';
  channelId?: string;
  createdAt: any;
  updatedAt: any;
  resolvedAt?: any;
  dismissedAt?: any;
}

export function openSupportTicketsModal(ticketId?: string) {
  window.dispatchEvent(
    new CustomEvent('eshuttle_open_support_tickets', {
      detail: { ticketId },
    })
  );
}

/**
 * Recursively strips keys with `undefined` values from an object.
 * Firestore strictly rejects `undefined` values in addDoc, setDoc, and updateDoc.
 */
function cleanDataForFirestore<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => (typeof item === 'object' && item !== null && item.constructor === Object ? cleanDataForFirestore(item) : item)) as any;
  }
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    } else if (value !== null && typeof value === 'object' && value.constructor === Object) {
      clean[key] = cleanDataForFirestore(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const LOCAL_TICKETS_KEY = 'eshuttle_incident_tickets_v1';

function getLocalTickets(): IncidentTicket[] {
  try {
    const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalTickets(tickets: IncidentTicket[]) {
  try {
    localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(tickets));
  } catch (e) {
    console.warn('Failed to save local tickets', e);
  }
}

function mergeTickets(remoteList: IncidentTicket[], localList: IncidentTicket[]): IncidentTicket[] {
  const map = new Map<string, IncidentTicket>();
  // 1. Put local items first
  localList.forEach((t) => {
    if (t && t.id) map.set(t.id, t);
    if (t && t.ticketNumber) map.set(t.ticketNumber, t);
  });
  // 2. Overwrite with authoritative remote items
  remoteList.forEach((t) => {
    if (t && t.id) map.set(t.id, t);
  });
  // Filter unique objects by id
  const uniqueMap = new Map<string, IncidentTicket>();
  map.forEach((val) => {
    uniqueMap.set(val.id, val);
  });
  const merged = Array.from(uniqueMap.values());
  merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return merged;
}

const ticketSubscribers = new Set<() => void>();
function notifyTicketSubscribers() {
  ticketSubscribers.forEach((cb) => cb());
}

// Category Human Labels & Badges
export const INCIDENT_CATEGORIES: Record<
  IncidentCategory,
  { label: string; icon: string; color: string }
> = {
  safety_emergency: { label: 'Safety & Emergency', icon: '🚨', color: 'bg-rose-600 text-white' },
  accident: { label: 'Collision / Accident', icon: '💥', color: 'bg-rose-500 text-white' },
  vehicle_breakdown: { label: 'Shuttle Breakdown', icon: '🛠️', color: 'bg-amber-600 text-white' },
  lost_item: { label: 'Lost & Found Item', icon: '🧳', color: 'bg-blue-600 text-white' },
  driver_behavior: { label: 'Driver / Staff Conduct', icon: '👤', color: 'bg-[#0D47A1] text-white' },
  passenger_conduct: { label: 'Passenger Behavior', icon: '👥', color: 'bg-purple-600 text-white' },
  route_delay: { label: 'Route / Station Delay', icon: '⏱️', color: 'bg-indigo-600 text-white' },
  other: { label: 'General Help & Report', icon: '📝', color: 'bg-slate-600 text-white' },
};

// Create a New Incident Report Ticket (Decoupled from Chat)
export async function createIncidentTicket(params: {
  reporterId: string;
  reporterName: string;
  reporterRole: 'customer' | 'driver' | 'admin';
  category: IncidentCategory;
  priority: TicketPriority;
  subject: string;
  description: string;
  locationAddress?: string;
  vehicleInfo?: string;
  ebikeId?: string;
  rideId?: string;
  tripSnapshot?: TripSnapshotInfo;
}): Promise<IncidentTicket> {
  const ticketNum = `INC-${Math.floor(100000 + Math.random() * 900000)}`;
  const nowIso = new Date().toISOString();

  // Report is separate from chat upon creation
  const ticketData: Omit<IncidentTicket, 'id'> = {
    ticketNumber: ticketNum,
    reporterId: params.reporterId,
    reporterName: params.reporterName,
    reporterRole: params.reporterRole,
    category: params.category,
    priority: params.priority,
    subject: params.subject.trim(),
    description: params.description.trim(),
    locationAddress: params.locationAddress?.trim() || undefined,
    vehicleInfo: params.vehicleInfo?.trim() || undefined,
    ebikeId: params.ebikeId || undefined,
    rideId: params.rideId || undefined,
    tripSnapshot: params.tripSnapshot || undefined,
    status: 'open',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  let createdTicket: IncidentTicket;

  try {
    const colRef = collection(db, 'incidentTickets');
    const cleanedDoc = cleanDataForFirestore({
      ...ticketData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const docRef = await addDoc(colRef, cleanedDoc);

    createdTicket = {
      ...ticketData,
      id: docRef.id,
    };
  } catch (err) {
    console.warn('Firestore ticket creation fallback to local:', err);
    createdTicket = {
      ...ticketData,
      id: `ticket_${Date.now()}`,
    };
  }

  // Save to local cache with merge
  const local = getLocalTickets();
  const merged = mergeTickets([createdTicket], local);
  saveLocalTickets(merged);
  notifyTicketSubscribers();

  // Push instant alert notification to Admin & play chime
  try {
    playPickupChime('new_request');
  } catch {}

  addAppNotification(
    {
      title: `🚨 Incident Report #${ticketNum}`,
      message: `${params.reporterName} filed a ${params.priority.toUpperCase()} report [${
        INCIDENT_CATEGORIES[params.category]?.label || params.category
      }]: "${params.subject}". Click to review and resolve.`,
      type: 'support',
      meta: {
        ticketId: createdTicket.id,
        ticketNumber: ticketNum,
        category: params.category,
        priority: params.priority,
        reporterName: params.reporterName,
        reporterRole: params.reporterRole,
        rideId: params.rideId,
      },
    },
    'admin'
  );

  // Audit log incident creation
  logActivity({
    action: 'CREATE',
    actionLabel: 'Reported Incident',
    entityType: 'INCIDENT',
    entityId: createdTicket.id,
    entityName: `Ticket #${ticketNum}`,
    summary: `${params.reporterName} reported ${params.category} incident: "${params.subject}" (${params.priority.toUpperCase()})`,
    details: {
      summary: params.description,
      after: {
        ticketNumber: ticketNum,
        category: params.category,
        priority: params.priority,
        subject: params.subject,
        location: params.locationAddress,
      },
    },
    performedBy: { uid: params.reporterId, name: params.reporterName, role: params.reporterRole },
    severity: params.priority === 'emergency' ? 'danger' : params.priority === 'high' ? 'warning' : 'info',
  }).catch(() => {});

  return createdTicket;
}

// On-demand: Get or Create Follow-Up Chat Channel for a specific Ticket
export async function getOrCreateTicketChatChannel(ticket: IncidentTicket): Promise<string> {
  if (ticket.channelId) {
    return ticket.channelId;
  }

  const ctype = ticket.reporterRole === 'driver' ? 'driver_admin' : 'user_admin';
  const channelId = await getOrCreateChannel(
    ctype,
    { id: ticket.reporterId, name: ticket.reporterName, role: ticket.reporterRole },
    { id: 'admin', name: 'E-Shuttle Admin Support', role: 'admin' },
    ticket.rideId,
    `Ticket #${ticket.ticketNumber}: ${ticket.subject}`,
    `Incident: ${INCIDENT_CATEGORIES[ticket.category]?.label || 'Report'}`
  );

  // Post reference note to chat
  const introMsg = `📋 [FOLLOW-UP FOR TICKET #${ticket.ticketNumber}]\nCategory: ${
    INCIDENT_CATEGORIES[ticket.category]?.label || ticket.category
  }\nStatus: ${ticket.status.toUpperCase()}\nDetails: ${ticket.description}`;

  try {
    await sendChatMessage(
      channelId,
      ticket.reporterId,
      ticket.reporterName,
      ticket.reporterRole,
      introMsg
    );
  } catch (e) {
    console.warn('Failed to send ticket intro chat message:', e);
  }

  // Update ticket with channelId in Firestore & local
  try {
    const tRef = doc(db, 'incidentTickets', ticket.id);
    await updateDoc(tRef, {
      channelId,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Failed to link channelId in Firestore:', err);
  }

  const local = getLocalTickets();
  const idx = local.findIndex((t) => t.id === ticket.id);
  if (idx >= 0) {
    local[idx].channelId = channelId;
    local[idx].updatedAt = new Date().toISOString();
    saveLocalTickets(local);
    notifyTicketSubscribers();
  }

  return channelId;
}

// Subscribe to User / Driver / Admin Tickets
export function subscribeToTickets(
  uid: string,
  role: 'customer' | 'driver' | 'admin',
  callback: (tickets: IncidentTicket[]) => void
): () => void {
  // 1. Immediately emit current cached/local tickets to prevent blank flicker
  callback(filterLocalTickets(uid, role));

  const colRef = collection(db, 'incidentTickets');
  let q;

  if (role === 'admin') {
    q = query(colRef, orderBy('createdAt', 'desc'));
  } else {
    q = query(colRef, where('reporterId', '==', uid));
  }

  let unsubFirestore: (() => void) | null = null;

  try {
    unsubFirestore = onSnapshot(
      q,
      (snapshot) => {
        const list: IncidentTicket[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const cTime =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString();
          const uTime =
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt || new Date().toISOString();

          list.push({
            ...(data as IncidentTicket),
            id: d.id,
            createdAt: cTime,
            updatedAt: uTime,
          });
        });

        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        const existingLocal = getLocalTickets();
        const merged = mergeTickets(list, existingLocal);
        saveLocalTickets(merged);
        callback(filterLocalTickets(uid, role));
      },
      (err) => {
        if (err.code !== 'permission-denied') {
          console.error('Error listening to tickets:', err);
        }
        callback(filterLocalTickets(uid, role));
      }
    );
  } catch {
    callback(filterLocalTickets(uid, role));
  }

  const localHandler = () => {
    callback(filterLocalTickets(uid, role));
  };
  ticketSubscribers.add(localHandler);

  return () => {
    if (unsubFirestore) unsubFirestore();
    ticketSubscribers.delete(localHandler);
  };
}

function filterLocalTickets(uid: string, role: 'customer' | 'driver' | 'admin'): IncidentTicket[] {
  const all = getLocalTickets();
  if (role === 'admin') return all;
  if (!uid) return [];
  return all.filter(
    (t) =>
      t.reporterId === uid ||
      (t.tripSnapshot && (t.tripSnapshot.customerId === uid || t.tripSnapshot.driverId === uid))
  );
}

// Update Ticket Status (Admin or User)
export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  adminNotes?: string,
  dismissReason?: string,
  actionTaken?: IncidentTicket['actionTaken']
): Promise<void> {
  const ticketRef = doc(db, 'incidentTickets', ticketId);
  const nowIso = new Date().toISOString();

  try {
    const updatePayload: any = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (adminNotes !== undefined) {
      updatePayload.adminNotes = adminNotes;
    }
    if (dismissReason !== undefined) {
      updatePayload.dismissReason = dismissReason;
    }
    if (actionTaken !== undefined) {
      updatePayload.actionTaken = actionTaken;
    }
    if (status === 'resolved' || status === 'closed') {
      updatePayload.resolvedAt = serverTimestamp();
    }
    if (status === 'dismissed') {
      updatePayload.dismissedAt = serverTimestamp();
    }

    const cleaned = cleanDataForFirestore(updatePayload);
    await updateDoc(ticketRef, cleaned);
  } catch (err) {
    console.warn('Firestore update ticket status error:', err);
  }

  const local = getLocalTickets();
  const idx = local.findIndex((t) => t.id === ticketId);
  if (idx >= 0) {
    local[idx].status = status;
    if (adminNotes !== undefined) local[idx].adminNotes = adminNotes;
    if (dismissReason !== undefined) local[idx].dismissReason = dismissReason;
    if (actionTaken !== undefined) local[idx].actionTaken = actionTaken;
    local[idx].updatedAt = nowIso;
    if (status === 'resolved' || status === 'closed') local[idx].resolvedAt = nowIso;
    if (status === 'dismissed') local[idx].dismissedAt = nowIso;
    saveLocalTickets(local);
    notifyTicketSubscribers();

    // Notify the reporter about the status update
    addAppNotification(
      {
        title: `Report #${local[idx].ticketNumber} Status: ${status.toUpperCase()}`,
        message: adminNotes
          ? `Admin update: ${adminNotes}`
          : dismissReason
          ? `Report dismissed: ${dismissReason}`
          : `Your report status has been marked as ${status.toUpperCase()}`,
        type: 'support',
        meta: { ticketId, status, adminNotes },
      },
      local[idx].reporterId
    );

    // Audit log ticket status update
    logActivity({
      action: 'UPDATE',
      actionLabel: `Ticket ${status.toUpperCase()}`,
      entityType: 'INCIDENT',
      entityId: ticketId,
      entityName: local[idx].ticketNumber || ticketId,
      summary: `Incident ticket "${local[idx].subject || ticketId}" was marked as ${status.toUpperCase()}${adminNotes ? `: "${adminNotes}"` : ''}`,
      details: {
        summary: adminNotes || dismissReason || `Status updated to ${status}`,
        after: { ticketId, status, adminNotes, dismissReason, actionTaken },
      },
      severity: status === 'resolved' ? 'success' : status === 'dismissed' ? 'info' : 'warning',
    }).catch(() => {});
  }
}

// Issue Official Warning to User or Driver directly from an incident
export async function issueTicketWarning(params: {
  ticketId: string;
  targetUserId: string;
  targetRole: 'customer' | 'driver';
  targetName: string;
  warningReason: string;
  adminUser?: { uid: string; name: string };
}): Promise<void> {
  const { ticketId, targetUserId, targetRole, targetName, warningReason, adminUser } = params;

  // 1. Update Firestore user/driver document with warning log
  try {
    const targetCol = targetRole === 'driver' ? 'drivers' : 'users';
    const targetRef = doc(db, targetCol, targetUserId);
    await updateDoc(targetRef, {
      lastWarningReason: warningReason,
      lastWarningDate: serverTimestamp(),
      lastWarningTicketId: ticketId,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore warning record update error:', err);
  }

  // 2. Notify the user/driver directly via in-app alert
  addAppNotification(
    {
      title: `⚠️ Official Dispatch Warning Issued`,
      message: `Notice from Admin Dispatch: ${warningReason}. Please adhere to community safety guidelines.`,
      type: 'support',
      meta: { ticketId, warningReason },
    },
    targetUserId
  );

  // 3. Mark the incident ticket with actionTaken
  await updateTicketStatus(
    ticketId,
    'in_progress',
    `Official warning issued to ${targetName}: "${warningReason}"`,
    undefined,
    'warning_issued'
  );

  // 4. Log to activity audit log
  logActivity({
    action: 'STATUS_CHANGE',
    actionLabel: 'Warning Issued',
    entityType: targetRole === 'driver' ? 'DRIVER' : 'USER',
    entityId: targetUserId,
    entityName: targetName,
    summary: `Official warning issued to ${targetRole} ${targetName}: "${warningReason}"`,
    details: {
      summary: `Warning issued regarding ticket ${ticketId}`,
      metadata: { warningReason, ticketId },
    },
    performedBy: {
      uid: adminUser?.uid || 'admin',
      name: adminUser?.name || 'E-Shuttle Admin',
      role: 'admin',
    },
    severity: 'warning',
  }).catch(() => {});
}
