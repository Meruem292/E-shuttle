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

export type IncidentCategory =
  | 'accident'
  | 'vehicle_breakdown'
  | 'lost_item'
  | 'fare_dispute'
  | 'driver_behavior'
  | 'route_issue'
  | 'safety_emergency'
  | 'other';

export type TicketPriority = 'low' | 'medium' | 'high' | 'emergency';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

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
  status: TicketStatus;
  adminNotes?: string;
  channelId: string;
  createdAt: any;
  updatedAt: any;
  resolvedAt?: any;
}

export function openSupportTicketsModal(ticketId?: string) {
  window.dispatchEvent(
    new CustomEvent('eshuttle_open_support_tickets', {
      detail: { ticketId },
    })
  );
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
  fare_dispute: { label: 'Fare / Payment Dispute', icon: '💳', color: 'bg-purple-600 text-white' },
  driver_behavior: { label: 'Driver / Staff Issue', icon: '👤', color: 'bg-[#0D47A1] text-white' },
  route_issue: { label: 'Route or Geofence Issue', icon: '📍', color: 'bg-indigo-600 text-white' },
  other: { label: 'General Help & Report', icon: '📝', color: 'bg-slate-600 text-white' },
};

// Create a New Incident Report Ticket
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
}): Promise<IncidentTicket> {
  const ticketNum = `INC-${Math.floor(100000 + Math.random() * 900000)}`;
  const ctype = params.reporterRole === 'driver' ? 'driver_admin' : 'user_admin';

  // 1. Create linked 2-way chat channel with Admin Support
  const channelId = await getOrCreateChannel(
    ctype,
    { id: params.reporterId, name: params.reporterName, role: params.reporterRole },
    { id: 'admin', name: 'E-Shuttle Admin Support', role: 'admin' },
    params.rideId,
    `Ticket #${ticketNum}: ${params.subject}`,
    `Incident: ${INCIDENT_CATEGORIES[params.category]?.label || 'Report'}`
  );

  const nowIso = new Date().toISOString();
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
    status: 'open',
    channelId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  let createdTicket: IncidentTicket;

  try {
    const colRef = collection(db, 'incidentTickets');
    const docRef = await addDoc(colRef, {
      ...ticketData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

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

  // Also post initial automatic ticket summary message to the linked chat channel
  const initialMsg = `📋 [NEW TICKET #${ticketNum}]\nCategory: ${
    INCIDENT_CATEGORIES[params.category]?.label || params.category
  }\nPriority: ${params.priority.toUpperCase()}\n\n${params.description}`;

  try {
    await sendChatMessage(
      channelId,
      params.reporterId,
      params.reporterName,
      params.reporterRole,
      initialMsg
    );
  } catch (e) {
    console.warn('Failed to send auto-ticket chat message:', e);
  }

  // Save to local cache
  const local = getLocalTickets();
  saveLocalTickets([createdTicket, ...local]);
  notifyTicketSubscribers();

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

// Subscribe to User / Driver / Admin Tickets
export function subscribeToTickets(
  uid: string,
  role: 'customer' | 'driver' | 'admin',
  callback: (tickets: IncidentTicket[]) => void
): () => void {
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

        saveLocalTickets(list);
        callback(list);
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
  return all.filter((t) => t.reporterId === uid);
}

// Update Ticket Status (Admin or User)
export async function updateTicketStatus(
  ticketId: string,
  status: TicketStatus,
  adminNotes?: string
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
    if (status === 'resolved' || status === 'closed') {
      updatePayload.resolvedAt = serverTimestamp();
    }

    await updateDoc(ticketRef, updatePayload);
  } catch (err) {
    console.warn('Firestore update ticket status error:', err);
  }

  const local = getLocalTickets();
  const idx = local.findIndex((t) => t.id === ticketId);
  if (idx >= 0) {
    local[idx].status = status;
    if (adminNotes !== undefined) local[idx].adminNotes = adminNotes;
    local[idx].updatedAt = nowIso;
    if (status === 'resolved' || status === 'closed') local[idx].resolvedAt = nowIso;
    saveLocalTickets(local);
    notifyTicketSubscribers();

    // Audit log ticket status update
    logActivity({
      action: 'UPDATE',
      actionLabel: `Ticket ${status.toUpperCase()}`,
      entityType: 'INCIDENT',
      entityId: ticketId,
      entityName: local[idx].ticketNumber || ticketId,
      summary: `Incident ticket "${local[idx].subject || ticketId}" was marked as ${status.toUpperCase()}${adminNotes ? `: "${adminNotes}"` : ''}`,
      details: {
        summary: adminNotes || `Status updated to ${status}`,
        after: { ticketId, status, adminNotes },
      },
      severity: status === 'resolved' ? 'success' : status === 'closed' ? 'info' : 'warning',
    }).catch(() => {});
  }
}
