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
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

export type ChatChannelType = 'booking' | 'user_driver' | 'user_admin' | 'driver_admin';

export interface ChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderRole: 'customer' | 'driver' | 'admin';
  text: string;
  createdAt: any;
  readBy?: string[];
}

export interface ChatChannel {
  id: string;
  channelType: ChatChannelType;
  participants: string[]; // uids or 'admin'
  participantNames: Record<string, string>;
  participantRoles: Record<string, 'customer' | 'driver' | 'admin'>;
  lastMessage?: string;
  lastMessageTime?: any;
  unreadCounts?: Record<string, number>;
  bookingId?: string;
  title?: string;
  subtitle?: string;
  createdAt?: any;
  updatedAt?: any;
}

// Helper to construct channel IDs
export function getChannelId(
  type: ChatChannelType,
  p1: string,
  p2?: string,
  bookingId?: string
): string {
  if (type === 'booking' && bookingId) {
    return `booking_${bookingId}`;
  }
  if (type === 'user_admin') {
    const userId = p1 === 'admin' ? p2 : p1;
    return `ua_${userId || 'support'}`;
  }
  if (type === 'driver_admin') {
    const driverId = p1 === 'admin' ? p2 : p1;
    return `da_${driverId || 'dispatch'}`;
  }
  if (type === 'user_driver' && p2) {
    const sorted = [p1, p2].sort().join('_');
    return `ud_${sorted}`;
  }
  return `channel_${p1}_${p2 || ''}`;
}

// Local storage fallback keys
const LOCAL_MESSAGES_KEY = 'eshuttle_chat_messages_v1';
const LOCAL_CHANNELS_KEY = 'eshuttle_chat_channels_v1';

function getLocalChannels(): ChatChannel[] {
  try {
    const raw = localStorage.getItem(LOCAL_CHANNELS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalChannels(channels: ChatChannel[]) {
  try {
    localStorage.setItem(LOCAL_CHANNELS_KEY, JSON.stringify(channels));
  } catch (e) {
    console.warn('Failed to save local channels', e);
  }
}

function getLocalMessages(channelId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_MESSAGES_KEY}_${channelId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMessages(channelId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(`${LOCAL_MESSAGES_KEY}_${channelId}`, JSON.stringify(messages));
  } catch (e) {
    console.warn('Failed to save local messages', e);
  }
}

// Notify local tab subscribers
const localSubscribers = new Set<() => void>();
function notifyLocalSubscribers() {
  localSubscribers.forEach((cb) => cb());
}

// 1. Get or Create Chat Channel
export async function getOrCreateChannel(
  type: ChatChannelType,
  creator: { id: string; name: string; role: 'customer' | 'driver' | 'admin' },
  target?: { id: string; name: string; role: 'customer' | 'driver' | 'admin' },
  bookingId?: string,
  titleOverride?: string,
  subtitleOverride?: string
): Promise<string> {
  const channelId = getChannelId(type, creator.id, target?.id, bookingId);
  const channelRef = doc(db, 'chatChannels', channelId);

  const participants = [creator.id];
  if (target?.id && target.id !== creator.id) {
    participants.push(target.id);
  }
  if (type === 'user_admin' || type === 'driver_admin') {
    if (!participants.includes('admin')) {
      participants.push('admin');
    }
  }

  const participantNames: Record<string, string> = {
    [creator.id]: creator.name,
  };
  const participantRoles: Record<string, 'customer' | 'driver' | 'admin'> = {
    [creator.id]: creator.role,
  };

  if (target) {
    participantNames[target.id] = target.name;
    participantRoles[target.id] = target.role;
  }
  if (type === 'user_admin' || type === 'driver_admin') {
    participantNames['admin'] = 'E-Shuttle Admin Support';
    participantRoles['admin'] = 'admin';
  }

  let defaultTitle = titleOverride || 'Support Chat';
  let defaultSubtitle = subtitleOverride || '';

  if (type === 'booking') {
    defaultTitle = titleOverride || `Ride Chat #${bookingId?.slice(-6) || ''}`;
    defaultSubtitle = `${creator.name} & ${target?.name || 'Driver'}`;
  } else if (type === 'user_driver') {
    defaultTitle = `${creator.name} & ${target?.name || 'Driver'}`;
    defaultSubtitle = 'Direct Chat';
  } else if (type === 'user_admin') {
    const custName = creator.role === 'admin' ? target?.name || 'Passenger' : creator.name;
    defaultTitle = titleOverride || `Customer Support (${custName})`;
    defaultSubtitle = '2-Way Admin Help Channel';
  } else if (type === 'driver_admin') {
    const drName = creator.role === 'admin' ? target?.name || 'Driver' : creator.name;
    defaultTitle = titleOverride || `Driver Dispatch Support (${drName})`;
    defaultSubtitle = '2-Way Admin Dispatch Channel';
  }

  const unreadCounts: Record<string, number> = {};
  participants.forEach((p) => {
    unreadCounts[p] = 0;
  });

  const payload: ChatChannel = {
    id: channelId,
    channelType: type,
    participants,
    participantNames,
    participantRoles,
    lastMessage: 'Channel opened',
    lastMessageTime: new Date().toISOString(),
    unreadCounts,
    bookingId: bookingId || undefined,
    title: defaultTitle,
    subtitle: defaultSubtitle,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const snap = await getDoc(channelRef);
    if (!snap.exists()) {
      await setDoc(channelRef, {
        ...payload,
        lastMessageTime: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingData = snap.data() as ChatChannel;
      const existingParticipants = existingData.participants || [];
      const missingParticipants = participants.filter((p) => !existingParticipants.includes(p));
      if (missingParticipants.length > 0) {
        await updateDoc(channelRef, {
          participants: [...existingParticipants, ...missingParticipants],
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    console.warn('Firestore channel fetch failed, saving to local cache:', err);
    const localChans = getLocalChannels();
    if (!localChans.some((c) => c.id === channelId)) {
      saveLocalChannels([payload, ...localChans]);
      notifyLocalSubscribers();
    }
  }

  return channelId;
}

// Helper to deduplicate messages by ID and content signature
export function deduplicateMessages(msgs: ChatMessage[]): ChatMessage[] {
  const seenIds = new Set<string>();
  const result: ChatMessage[] = [];

  for (const m of msgs) {
    if (!m || !m.text) continue;
    const msgId = m.id || `${m.senderId}_${m.createdAt}_${m.text}`;
    if (seenIds.has(msgId)) continue;

    // Check if there is already a message with identical sender, text, and within 3000ms
    const msgTime = new Date(m.createdAt || Date.now()).getTime();
    const isDuplicateContent = result.some((existing) => {
      const existingTime = new Date(existing.createdAt || Date.now()).getTime();
      return (
        existing.senderId === m.senderId &&
        existing.text === m.text &&
        Math.abs(existingTime - msgTime) < 3500
      );
    });

    if (isDuplicateContent) {
      continue;
    }

    seenIds.add(msgId);
    result.push(m);
  }

  return result.sort(
    (a, b) =>
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
}

// 2. Send Message
export async function sendChatMessage(
  channelId: string,
  senderId: string,
  senderName: string,
  senderRole: 'customer' | 'driver' | 'admin',
  text: string
): Promise<void> {
  const cleanText = text.trim();
  if (!cleanText) return;

  const nowIso = new Date().toISOString();
  const msgData = {
    channelId,
    senderId,
    senderName,
    senderRole,
    text: cleanText,
    createdAt: serverTimestamp(),
    readBy: [senderId],
  };

  const channelRef = doc(db, 'chatChannels', channelId);
  const messagesColRef = collection(db, 'chatChannels', channelId, 'messages');

  let writeToFirestoreSuccessful = false;

  try {
    await addDoc(messagesColRef, msgData);
    writeToFirestoreSuccessful = true;

    // Update parent channel doc with last message and unread count
    const chanSnap = await getDoc(channelRef);
    if (chanSnap.exists()) {
      const cData = chanSnap.data() as ChatChannel;
      const updatedUnread = { ...(cData.unreadCounts || {}) };
      (cData.participants || []).forEach((p) => {
        if (senderRole === 'admin') {
          if (p !== senderId && p !== 'admin' && cData.participantRoles?.[p] !== 'admin') {
            updatedUnread[p] = (updatedUnread[p] || 0) + 1;
          } else {
            updatedUnread[p] = 0;
          }
        } else {
          if (p !== senderId) {
            updatedUnread[p] = (updatedUnread[p] || 0) + 1;
          }
        }
      });

      await updateDoc(channelRef, {
        lastMessage: cleanText,
        lastMessageTime: serverTimestamp(),
        unreadCounts: updatedUnread,
        updatedAt: serverTimestamp(),
      });
    } else {
      // If parent channel doc does not exist yet in Firestore, create it now
      const isSupport = channelId.startsWith('ua_') || channelId.startsWith('da_');
      const ctype: ChatChannelType = channelId.startsWith('da_')
        ? 'driver_admin'
        : channelId.startsWith('ua_')
        ? 'user_admin'
        : 'user_driver';

      const participants = [senderId];
      if (isSupport && !participants.includes('admin')) {
        participants.push('admin');
      }

      await setDoc(channelRef, {
        id: channelId,
        channelType: ctype,
        participants,
        participantNames: { [senderId]: senderName, admin: 'E-Shuttle Admin Support' },
        participantRoles: { [senderId]: senderRole, admin: 'admin' },
        lastMessage: cleanText,
        lastMessageSenderId: senderId,
        lastMessageTime: serverTimestamp(),
        unreadCounts: { [senderId]: 0, admin: senderRole === 'admin' ? 0 : 1 },
        title: senderRole === 'admin' ? 'Customer Support' : `${senderName} Support`,
        subtitle: '2-Way Live Support',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Firestore send message failed, falling back to local cache:', err);
  }

  // If Firestore write failed, persist locally as fallback
  if (!writeToFirestoreSuccessful) {
    const localMsgs = getLocalMessages(channelId);
    const localMsgObj: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      channelId,
      senderId,
      senderName,
      senderRole,
      text: cleanText,
      createdAt: nowIso,
      readBy: [senderId],
    };
    saveLocalMessages(channelId, deduplicateMessages([...localMsgs, localMsgObj]));

    const localChans = getLocalChannels();
    const existingChanIdx = localChans.findIndex((c) => c.id === channelId);
    if (existingChanIdx >= 0) {
      const chan = localChans[existingChanIdx];
      chan.lastMessage = cleanText;
      chan.lastMessageTime = nowIso;
      const unreads = { ...(chan.unreadCounts || {}) };
      (chan.participants || []).forEach((p) => {
        if (p !== senderId) unreads[p] = (unreads[p] || 0) + 1;
      });
      chan.unreadCounts = unreads;
      localChans[existingChanIdx] = chan;
      saveLocalChannels(localChans);
    }

    notifyLocalSubscribers();
  }
}

// 3. Subscribe to Real-time Messages in a Channel
export function subscribeToMessages(
  channelId: string,
  callback: (messages: ChatMessage[]) => void
): () => void {
  const messagesColRef = collection(db, 'chatChannels', channelId, 'messages');
  const q = query(messagesColRef, orderBy('createdAt', 'asc'));

  let unsubFirestore: (() => void) | null = null;
  let hasFirestoreData = false;

  try {
    unsubFirestore = onSnapshot(
      q,
      (snapshot) => {
        hasFirestoreData = true;
        const msgs: ChatMessage[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const createdTime =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toDate().toISOString()
              : data.createdAt || new Date().toISOString();

          msgs.push({
            id: d.id,
            channelId,
            senderId: data.senderId,
            senderName: data.senderName,
            senderRole: data.senderRole,
            text: data.text,
            createdAt: createdTime,
            readBy: data.readBy || [],
          });
        });

        const cleanMsgs = deduplicateMessages(msgs);
        saveLocalMessages(channelId, cleanMsgs);
        callback(cleanMsgs);
      },
      (err) => {
        if (err.code !== 'permission-denied') {
          console.error('Error listening to chat messages:', err);
        }
        if (!hasFirestoreData) {
          callback(deduplicateMessages(getLocalMessages(channelId)));
        }
      }
    );
  } catch (err) {
    callback(deduplicateMessages(getLocalMessages(channelId)));
  }

  const localHandler = () => {
    if (!hasFirestoreData) {
      callback(deduplicateMessages(getLocalMessages(channelId)));
    }
  };
  localSubscribers.add(localHandler);

  return () => {
    if (unsubFirestore) unsubFirestore();
    localSubscribers.delete(localHandler);
  };
}

// 4. Subscribe to All Channels for User / Driver / Admin
export function subscribeToUserChannels(
  uid: string,
  role: 'customer' | 'driver' | 'admin',
  callback: (channels: ChatChannel[]) => void
): () => void {
  const channelsRef = collection(db, 'chatChannels');
  let q;

  if (role === 'admin') {
    q = query(channelsRef);
  } else {
    q = query(channelsRef, where('participants', 'array-contains', uid));
  }

  let unsubFirestore: (() => void) | null = null;

  try {
    unsubFirestore = onSnapshot(
      q,
      (snapshot) => {
        const chans: ChatChannel[] = [];
        snapshot.forEach((d) => {
          const data = d.data() as ChatChannel;
          const updatedTime =
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate().toISOString()
              : data.updatedAt || new Date().toISOString();

          chans.push({
            ...data,
            id: d.id,
            updatedAt: updatedTime,
          });
        });

        // Merge with local channels so local creations aren't wiped
        const localChans = filterLocalChannels(uid, role);
        const mergedMap = new Map<string, ChatChannel>();
        chans.forEach((c) => mergedMap.set(c.id, c));
        localChans.forEach((lc) => {
          if (!mergedMap.has(lc.id)) {
            mergedMap.set(lc.id, lc);
          }
        });
        const finalChans = Array.from(mergedMap.values()).sort((a, b) => {
          const tA = new Date(a.updatedAt || a.lastMessageTime || 0).getTime();
          const tB = new Date(b.updatedAt || b.lastMessageTime || 0).getTime();
          return tB - tA;
        });

        saveLocalChannels(finalChans);
        callback(finalChans);
      },
      (err) => {
        if (err.code !== 'permission-denied') {
          console.error('Error listening to user channels:', err);
        }
        callback(filterLocalChannels(uid, role));
      }
    );
  } catch {
    callback(filterLocalChannels(uid, role));
  }

  const localHandler = () => {
    callback(filterLocalChannels(uid, role));
  };
  localSubscribers.add(localHandler);

  return () => {
    if (unsubFirestore) unsubFirestore();
    localSubscribers.delete(localHandler);
  };
}

function filterLocalChannels(uid: string, role: 'customer' | 'driver' | 'admin'): ChatChannel[] {
  const all = getLocalChannels();
  if (role === 'admin') return all;
  return all.filter((c) => c.participants && c.participants.includes(uid));
}

// 5. Mark Channel as Read
export async function markChannelAsRead(
  channelId: string,
  uid: string,
  role?: 'customer' | 'driver' | 'admin'
): Promise<void> {
  const channelRef = doc(db, 'chatChannels', channelId);
  const isAdmin = role === 'admin' || uid === 'admin';

  try {
    const snap = await getDoc(channelRef);
    if (snap.exists()) {
      const cData = snap.data() as ChatChannel;
      const unreads = { ...(cData.unreadCounts || {}) };
      unreads[uid] = 0;
      if (isAdmin) {
        unreads['admin'] = 0;
      }
      await updateDoc(channelRef, {
        unreadCounts: unreads,
      });
    }
  } catch (err) {
    console.warn('Firestore mark read error:', err);
  }

  const localChans = getLocalChannels();
  const idx = localChans.findIndex((c) => c.id === channelId);
  if (idx >= 0) {
    localChans[idx].unreadCounts = localChans[idx].unreadCounts || {};
    localChans[idx].unreadCounts![uid] = 0;
    if (isAdmin) {
      localChans[idx].unreadCounts!['admin'] = 0;
    }
    saveLocalChannels(localChans);
    notifyLocalSubscribers();
  }
}
