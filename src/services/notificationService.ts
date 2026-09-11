// Browser audio and native notification service for E-Shuttle pickup alerts

export type PickupNotificationType =
  | 'new_request'        // Driver receives new passenger pickup request
  | 'driver_assigned'    // Passenger's pickup was accepted by driver
  | 'driver_approaching' // Shuttle is within 200m or 2 minutes from pickup
  | 'driver_arrived'     // Shuttle has arrived at passenger's pickup stop
  | 'ride_started';      // Ride has begun from pickup stop

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (e) {
    return null;
  }
}

/**
 * Plays a clean, pleasant synthetic chime using Web Audio API (zero asset loading required)
 */
export function playPickupChime(type: PickupNotificationType) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'new_request') {
      // Attention chime for drivers: 2 crisp pulses (440Hz -> 880Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    } else if (type === 'driver_assigned' || type === 'driver_approaching') {
      // Pleasant rising melody (C5 -> E5): 523Hz -> 659Hz
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.setValueAtTime(659.25, now + 0.15);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.46);
    } else if (type === 'driver_arrived') {
      // Cheerful 3-note arrival fanfare: 523Hz (C5) -> 659Hz (E5) -> 783.99Hz (G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + idx * 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.3);
      });
    }
  } catch (e) {
    // Ignore audio errors if blocked by browser autoplay policies
  }
}

/**
 * Triggers mobile device vibration if supported
 */
export function triggerHapticVibrate(pattern: number[] = [150, 80, 150]) {
  try {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    // Unsupported or permission denied
  }
}

/**
 * Speaks an audio announcement using browser Speech Synthesis (hands-free driver / commuter alert)
 */
export function speakPickupAnnouncement(text: string) {
  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (localStorage.getItem('pickup_sound_muted') === 'true') return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    // Unsupported or blocked
  }
}

/**
 * Requests native browser Notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    return await Notification.requestPermission();
  } catch (e) {
    return 'denied';
  }
}

/**
 * Shows a native OS / browser notification if granted
 */
export function sendNativePickupNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    tag?: string;
  }
) {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body: options?.body || 'E-Shuttle Pickup Update',
        icon: options?.icon || '/pwa-192x192.png',
        tag: options?.tag || 'e-shuttle-pickup',
      });
    }
  } catch (e) {
    // Ignore background permission restrictions
  }
}

export interface AppNotificationItem {
  id: string;
  title: string;
  message: string;
  type:
    | 'driver_approaching'
    | 'driver_assigned'
    | 'driver_arrived'
    | 'ride_started'
    | 'new_request'
    | 'multi_passenger'
    | 'proximity_300m'
    | 'proximity'
    | 'pickup'
    | 'system'
    | 'support';
  timestamp: number;
  read: boolean;
  meta?: {
    bookingId?: string;
    distanceMeters?: number;
    distance?: number;
    driverName?: string;
    pickupAddress?: string;
    passengerCount?: number;
    count?: number;
    [key: string]: any;
  };
}

const NOTIFICATION_EVENT = 'eshuttle_notifications_updated';

function getStorageKey(userId?: string): string {
  return `eshuttle_notifications_${userId || 'guest'}`;
}

export function getStoredNotifications(userId?: string): AppNotificationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading stored notifications:', e);
  }

  // Default initial announcement if empty
  return [
    {
      id: 'welcome-init',
      title: 'Welcome to E-Shuttle Service',
      message: 'Eco-friendly campus and community shuttle transit between designated station stops.',
      type: 'system',
      timestamp: Date.now() - 3600000,
      read: false,
    },
  ];
}

export function addAppNotification(
  item: Omit<AppNotificationItem, 'id' | 'timestamp' | 'read'>,
  userId?: string
): AppNotificationItem {
  const current = getStoredNotifications(userId);
  const newNotif: AppNotificationItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    read: false,
  };

  // Keep latest 50 notifications, prepend new one
  const updated = [newNotif, ...current.filter((n) => n.id !== 'welcome-init')].slice(0, 50);

  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: { userId } }));
  } catch (e) {
    console.warn('Error persisting notification:', e);
  }

  return newNotif;
}

export function markNotificationAsRead(id: string, userId?: string): void {
  const current = getStoredNotifications(userId);
  const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: { userId } }));
  } catch (e) {
    console.warn('Error saving read status:', e);
  }
}

export function markAllNotificationsAsRead(userId?: string): void {
  const current = getStoredNotifications(userId);
  const updated = current.map((n) => ({ ...n, read: true }));
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: { userId } }));
  } catch (e) {
    console.warn('Error saving read all status:', e);
  }
}

export function clearAllNotifications(userId?: string): void {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify([]));
    window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: { userId } }));
  } catch (e) {
    console.warn('Error clearing notifications:', e);
  }
}

export function getUnreadNotificationsCount(userId?: string): number {
  const list = getStoredNotifications(userId);
  return list.filter((n) => !n.read).length;
}

export function openNotificationModal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('eshuttle_open_notifications'));
  }
}

export function subscribeToNotifications(
  userId: string | undefined,
  callback: (items: AppNotificationItem[]) => void
): () => void {
  const handler = () => {
    callback(getStoredNotifications(userId));
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(NOTIFICATION_EVENT, handler);
    window.addEventListener('storage', handler);
  }

  // Initial call
  callback(getStoredNotifications(userId));

  return () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener(NOTIFICATION_EVENT, handler);
      window.removeEventListener('storage', handler);
    }
  };
}

