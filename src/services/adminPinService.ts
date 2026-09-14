import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { logActivity } from './activityLogService';

export const DEFAULT_ADMIN_ACTION_PIN = '8888';

export interface AdminPinConfig {
  isCustomPinSet: boolean;
  pinHash: string;
  pinLength: number;
  requirePinForDestructiveActions: boolean;
  updatedAt?: any;
  updatedBy?: string;
}

/**
 * Generates a SHA-256 hash for the given PIN with application salt
 */
export async function hashPin(pin: string): Promise<string> {
  const trimmed = pin.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(`eshuttle_admin_secret_salt_${trimmed}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies if the entered PIN matches the configured admin action PIN
 */
export async function verifyAdminActionPin(enteredPin: string): Promise<boolean> {
  const cleanEntered = (enteredPin || '').trim();
  if (!cleanEntered) return false;

  try {
    const pinDocRef = doc(db, 'adminSecurity', 'actionPin');
    const pinSnap = await getDoc(pinDocRef);

    if (!pinSnap.exists()) {
      // Default fallback PIN
      return cleanEntered === DEFAULT_ADMIN_ACTION_PIN;
    }

    const data = pinSnap.data() as Partial<AdminPinConfig>;
    if (!data.pinHash) {
      return cleanEntered === DEFAULT_ADMIN_ACTION_PIN;
    }

    const enteredHash = await hashPin(cleanEntered);
    return enteredHash === data.pinHash;
  } catch (err) {
    console.error('Error verifying admin action PIN:', err);
    // Safe fallback if offline / rules allow
    return cleanEntered === DEFAULT_ADMIN_ACTION_PIN;
  }
}

/**
 * Retrieves the current admin PIN metadata (without exposing the raw PIN)
 */
export async function getAdminPinConfig(): Promise<AdminPinConfig> {
  try {
    const pinDocRef = doc(db, 'adminSecurity', 'actionPin');
    const pinSnap = await getDoc(pinDocRef);

    if (pinSnap.exists()) {
      const data = pinSnap.data();
      return {
        isCustomPinSet: Boolean(data.isCustomPinSet),
        pinHash: data.pinHash || '',
        pinLength: data.pinLength || 4,
        requirePinForDestructiveActions: data.requirePinForDestructiveActions !== false,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
    }
  } catch (err) {
    console.warn('Could not read admin PIN config from Firestore:', err);
  }

  const defaultHash = await hashPin(DEFAULT_ADMIN_ACTION_PIN);
  return {
    isCustomPinSet: false,
    pinHash: defaultHash,
    pinLength: 4,
    requirePinForDestructiveActions: true,
  };
}

/**
 * Subscribes to Admin PIN configuration changes in real-time
 */
export function listenToAdminPinConfig(callback: (config: AdminPinConfig) => void): () => void {
  const pinDocRef = doc(db, 'adminSecurity', 'actionPin');
  return onSnapshot(
    pinDocRef,
    async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        callback({
          isCustomPinSet: Boolean(data.isCustomPinSet),
          pinHash: data.pinHash || '',
          pinLength: data.pinLength || 4,
          requirePinForDestructiveActions: data.requirePinForDestructiveActions !== false,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
        });
      } else {
        const defaultHash = await hashPin(DEFAULT_ADMIN_ACTION_PIN);
        callback({
          isCustomPinSet: false,
          pinHash: defaultHash,
          pinLength: 4,
          requirePinForDestructiveActions: true,
        });
      }
    },
    (err) => {
      console.warn('Admin PIN snapshot subscription warning:', err);
    }
  );
}

/**
 * Updates the admin secret action PIN after validating the current PIN
 */
export async function updateAdminActionPin(
  currentPin: string,
  newPin: string,
  adminUser?: { uid?: string; email?: string; fullName?: string }
): Promise<{ success: boolean; message: string }> {
  const cleanCurrent = (currentPin || '').trim();
  const cleanNew = (newPin || '').trim();

  if (!/^\d{4,6}$/.test(cleanNew)) {
    return {
      success: false,
      message: 'New Secret PIN must be 4 to 6 numeric digits (0-9 only).',
    };
  }

  const isValidCurrent = await verifyAdminActionPin(cleanCurrent);
  if (!isValidCurrent) {
    return {
      success: false,
      message: 'Current Secret PIN is incorrect. Please verify and try again.',
    };
  }

  try {
    const newHash = await hashPin(cleanNew);
    const pinDocRef = doc(db, 'adminSecurity', 'actionPin');

    await setDoc(
      pinDocRef,
      {
        isCustomPinSet: true,
        pinHash: newHash,
        pinLength: cleanNew.length,
        requirePinForDestructiveActions: true,
        updatedAt: serverTimestamp(),
        updatedBy: adminUser?.email || adminUser?.fullName || 'admin',
      },
      { merge: true }
    );

    await logActivity({
      action: 'SETTINGS_UPDATE',
      actionLabel: 'Updated Admin Secret Action PIN',
      entityType: 'SETTINGS',
      entityId: 'admin-action-pin',
      entityName: 'Admin Action Security PIN',
      summary: `Administrator updated the Secret Action PIN (${cleanNew.length}-digit PIN protection active)`,
      details: {
        summary: 'Secret Action PIN updated in database for administrative authorization guard',
        metadata: {
          pinLength: cleanNew.length,
          isCustom: true,
        },
      },
      performedBy: {
        uid: adminUser?.uid || 'admin',
        name: adminUser?.fullName || 'Admin',
        email: adminUser?.email,
        role: 'admin',
      },
      severity: 'warning',
    }).catch(() => {});

    return {
      success: true,
      message: `Secret Action PIN successfully updated (${cleanNew.length} digits). All critical admin actions will require this PIN.`,
    };
  } catch (err: any) {
    console.error('Failed to update admin action PIN in Firestore:', err);
    return {
      success: false,
      message: err.message || 'Failed to save new Secret PIN to database.',
    };
  }
}

/**
 * Resets the admin action PIN back to the default '8888'
 */
export async function resetAdminActionPinToDefault(
  currentPin: string,
  adminUser?: { uid?: string; email?: string; fullName?: string }
): Promise<{ success: boolean; message: string }> {
  const isValidCurrent = await verifyAdminActionPin(currentPin);
  if (!isValidCurrent) {
    return {
      success: false,
      message: 'Current PIN is incorrect. Cannot reset PIN without authorization.',
    };
  }

  try {
    const defaultHash = await hashPin(DEFAULT_ADMIN_ACTION_PIN);
    const pinDocRef = doc(db, 'adminSecurity', 'actionPin');

    await setDoc(
      pinDocRef,
      {
        isCustomPinSet: false,
        pinHash: defaultHash,
        pinLength: 4,
        requirePinForDestructiveActions: true,
        updatedAt: serverTimestamp(),
        updatedBy: adminUser?.email || adminUser?.fullName || 'admin',
      },
      { merge: true }
    );

    await logActivity({
      action: 'SETTINGS_UPDATE',
      actionLabel: 'Reset Admin Secret Action PIN to Default',
      entityType: 'SETTINGS',
      entityId: 'admin-action-pin',
      entityName: 'Admin Action Security PIN',
      summary: 'Administrator reset the Secret Action PIN back to system default (8888)',
      details: {
        summary: 'Action PIN reverted to default 8888',
      },
      severity: 'warning',
    }).catch(() => {});

    return {
      success: true,
      message: `Secret Action PIN has been reset to default (${DEFAULT_ADMIN_ACTION_PIN}).`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to reset PIN.',
    };
  }
}
