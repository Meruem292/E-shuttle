import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import {
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  User,
} from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { UserProfile, DriverProfile, AdminSettings } from '../types';
import { logActivity } from './activityLogService';

export const DEFAULT_PASSWORD_EXPIRY_DAYS = 90; // Default 90-day password rotation interval
export const PRESET_DAY_RANGES = [30, 60, 90, 180] as const;

export interface PasswordAgeStatus {
  lastChangedDate: Date;
  daysSinceChange: number;
  policyDays: number;
  nextChangeDueDate: Date;
  daysRemaining: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  status: 'healthy' | 'expiring_soon' | 'expired';
  progressPercent: number; // 0 to 100% of policy lifespan elapsed
}

/**
 * Normalizes any Firestore timestamp, string, or number to epoch milliseconds.
 */
export function normalizeTimestamp(raw: any): number {
  if (!raw) return Date.now();
  if (typeof raw === 'number') return raw;
  if (typeof raw.toMillis === 'function') return raw.toMillis();
  if (typeof raw.toDate === 'function') return raw.toDate().getTime();
  if (raw instanceof Date) return raw.getTime();
  const parsed = new Date(raw).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
}

/**
 * Calculates the current password age, days remaining, and expiration status based on policy.
 */
export function calculatePasswordAgeStatus(
  profile: UserProfile | DriverProfile | null,
  policyDaysOverride?: number
): PasswordAgeStatus {
  const policyDays =
    policyDaysOverride && policyDaysOverride > 0
      ? policyDaysOverride
      : profile?.passwordExpiryDays && profile.passwordExpiryDays > 0
      ? profile.passwordExpiryDays
      : DEFAULT_PASSWORD_EXPIRY_DAYS;

  // If passwordLastChangedAt exists, use it; otherwise fallback to createdAt or current time
  const rawTimestamp = profile?.passwordLastChangedAt || profile?.createdAt || Date.now();
  const lastChangedMs = normalizeTimestamp(rawTimestamp);
  const lastChangedDate = new Date(lastChangedMs);

  const nowMs = Date.now();
  const elapsedMs = Math.max(0, nowMs - lastChangedMs);
  const daysSinceChange = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));

  const expiryDurationMs = policyDays * 24 * 60 * 60 * 1000;
  const nextChangeDueDate = new Date(lastChangedMs + expiryDurationMs);

  const remainingMs = Math.max(0, lastChangedMs + expiryDurationMs - nowMs);
  const daysRemaining = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));

  const isExpired = daysSinceChange >= policyDays;
  const isExpiringSoon = !isExpired && daysRemaining <= 7;

  let status: 'healthy' | 'expiring_soon' | 'expired' = 'healthy';
  if (isExpired) {
    status = 'expired';
  } else if (isExpiringSoon) {
    status = 'expiring_soon';
  }

  const progressPercent = Math.min(100, Math.max(0, Math.round((daysSinceChange / policyDays) * 100)));

  return {
    lastChangedDate,
    daysSinceChange,
    policyDays,
    nextChangeDueDate,
    daysRemaining,
    isExpired,
    isExpiringSoon,
    status,
    progressPercent,
  };
}

/**
 * Changes user/driver/admin account password with re-authentication and Firestore metadata update.
 */
export async function changeAccountPassword(params: {
  currentUser: User;
  currentPassword: string;
  newPassword: string;
  role: 'customer' | 'driver' | 'admin';
  userProfile?: UserProfile | null;
  driverProfile?: DriverProfile | null;
}): Promise<{ success: boolean; message: string }> {
  const { currentUser, currentPassword, newPassword, role, userProfile, driverProfile } = params;

  if (!currentUser || !currentUser.email) {
    throw new Error('Authentication session is invalid. Please sign in again.');
  }

  if (newPassword.length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  if (currentPassword === newPassword) {
    throw new Error('New password cannot be the same as your current password.');
  }

  // 1. Re-authenticate user with current password
  const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
  try {
    await reauthenticateWithCredential(currentUser, credential);
  } catch (err: any) {
    console.error('Re-authentication error during password change:', err);
    if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
      throw new Error('Current password is incorrect. Please verify and try again.');
    }
    if (err?.code === 'auth/too-many-requests') {
      throw new Error('Too many failed attempts. Please wait a few minutes before trying again.');
    }
    throw new Error(err?.message || 'Current password verification failed.');
  }

  // 2. Update Firebase Auth password
  await updatePassword(currentUser, newPassword);

  // 3. Update Firestore Document with password change timestamp
  const targetCollection = role === 'driver' ? 'drivers' : 'users';
  const nowMs = Date.now();

  try {
    await updateDoc(doc(db, targetCollection, currentUser.uid), {
      passwordLastChangedAt: nowMs,
      updatedAt: serverTimestamp(),
    });
  } catch (firestoreErr) {
    console.warn('Could not update password timestamp in Firestore:', firestoreErr);
  }

  // 4. Log Security Activity
  const profileName =
    role === 'driver'
      ? driverProfile?.fullName || currentUser.email
      : userProfile?.fullName || currentUser.email;

  logActivity({
    action: 'UPDATE',
    actionLabel: 'Changed Password',
    entityType: role === 'admin' ? 'ADMIN' : role === 'driver' ? 'DRIVER' : 'USER',
    entityId: currentUser.uid,
    entityName: profileName || currentUser.email,
    summary: `${role.toUpperCase()} "${currentUser.email}" updated account password (Rotation policy tracked)`,
    details: {
      summary: 'Security credentials rotated successfully',
      metadata: {
        passwordLastChangedAt: nowMs,
      },
    },
    performedBy: {
      uid: currentUser.uid,
      name: profileName || 'User',
      email: currentUser.email,
      role,
    },
    severity: role === 'admin' ? 'warning' : 'info',
  }).catch(() => {});

  return {
    success: true,
    message: 'Password updated successfully! Your password rotation schedule has been refreshed.',
  };
}

/**
 * Updates the global password expiration day range in admin settings.
 */
export async function updateGlobalPasswordExpiryPolicy(
  days: number,
  adminUser?: { uid: string; email?: string; name?: string }
): Promise<void> {
  const validatedDays = Math.max(1, Math.min(365, Math.round(days)));
  const settingsDocRef = doc(db, 'adminSettings', 'default');
  
  const snap = await getDoc(settingsDocRef);
  const currentData = snap.exists() ? snap.data() : {};

  await setDoc(
    settingsDocRef,
    {
      ...currentData,
      passwordExpiryDays: validatedDays,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (adminUser) {
    logActivity({
      action: 'SETTINGS_UPDATE',
      actionLabel: 'Updated Password Rotation Policy',
      entityType: 'SETTINGS',
      entityId: 'adminSettings/default',
      entityName: 'Password Expiry Day Range',
      summary: `Administrator updated global password rotation schedule to every ${validatedDays} days`,
      details: {
        summary: `Global password rotation policy updated to ${validatedDays} days`,
        metadata: {
          previousDays: currentData.passwordExpiryDays || DEFAULT_PASSWORD_EXPIRY_DAYS,
          newDays: validatedDays,
        },
      },
      performedBy: {
        uid: adminUser.uid,
        name: adminUser.name || 'Platform Administrator',
        email: adminUser.email,
        role: 'admin',
      },
      severity: 'warning',
    }).catch(() => {});
  }
}

/**
 * Subscribes to real-time password policy updates in admin settings.
 */
export function subscribeToPasswordPolicy(
  callback: (policyDays: number) => void
): () => void {
  return onSnapshot(
    doc(db, 'adminSettings', 'default'),
    (snap) => {
      if (snap.exists() && typeof snap.data().passwordExpiryDays === 'number') {
        callback(snap.data().passwordExpiryDays);
      } else {
        callback(DEFAULT_PASSWORD_EXPIRY_DAYS);
      }
    },
    (err) => {
      console.warn('Password policy listener error:', err);
      callback(DEFAULT_PASSWORD_EXPIRY_DAYS);
    }
  );
}
