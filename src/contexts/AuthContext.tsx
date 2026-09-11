import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  serverTimestamp,
  updateDoc,
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { UserProfile, DriverProfile, UserRole, AccountStatus, EBikeDevice } from '../types';
import { subscribeToEBikes, autoResolveRfidAssignment } from '../services/ebikeService';
import { sanitizeVehicleInfo } from '../utils/sanitizeVehicle';
import { logActivity } from '../services/activityLogService';
import { isValidEmail, isValidPhoneNumber, isValidDriverLicense, isValidFullName } from '../utils/validation';

/**
 * Recursively strips keys with `undefined` values from an object.
 * Firestore strictly rejects `undefined` values in setDoc and updateDoc.
 */
export function sanitizeFirestoreData<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => (typeof item === 'object' && item !== null && item.constructor === Object ? sanitizeFirestoreData(item) : item)) as any;
  }
  const clean: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      continue;
    } else if (value !== null && typeof value === 'object' && value.constructor === Object) {
      clean[key] = sanitizeFirestoreData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  driverProfile: DriverProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signInAdmin: (email: string, pass: string) => Promise<void>;
  signUpCustomer: (fullName: string, email: string, phone: string, pass: string) => Promise<void>;
  signUpDriver: (
    fullName: string,
    email: string,
    phone: string,
    pass: string,
    vehicleType?: string,
    vehicleInfo?: string,
    driverLicenseCardUrl?: string,
    driverLicenseNumber?: string
  ) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // 1. Sync auth state
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setUserProfile(null);
        setDriverProfile(null);
        setRole(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 1b. Global Real-time Hardware RFID Auto-Resolution Listener
  useEffect(() => {
    let globalBikes: EBikeDevice[] = [];
    let globalDrivers: DriverProfile[] = [];

    const checkAndResolve = () => {
      if (globalBikes.length > 0 && globalDrivers.length > 0) {
        globalBikes.forEach((bike) => {
          if (bike.lastRfidCardUid) {
            autoResolveRfidAssignment(bike, globalDrivers);
          }
        });
      }
    };

    const unsubBikes = subscribeToEBikes((bikes) => {
      globalBikes = bikes;
      checkAndResolve();
    });

    const driversRef = collection(db, 'drivers');
    const unsubDrivers = onSnapshot(
      driversRef,
      (snap) => {
        globalDrivers = snap.docs.map((d) => {
          const raw = d.data() as DriverProfile;
          return {
            ...raw,
            uid: d.id,
            vehicleInfo: sanitizeVehicleInfo(raw.vehicleInfo),
          };
        });
        checkAndResolve();
      },
      (err) => {
        if (err.code !== 'permission-denied') {
          console.error('Global driver snapshot error:', err);
        }
      }
    );

    return () => {
      unsubBikes();
      unsubDrivers();
    };
  }, []);

  /**
   * Universal Profile Resolver & Self-Healing Logic
   * Inspects Firestore for the user's document in both `users` and `drivers`.
   * If an authenticated account is missing a Firestore document (e.g. from an interrupted
   * signup or schema failure), this dynamically recovers the account profile so the user
   * is never stranded in a loading or null-role state.
   */
  const syncUserProfile = async (
    user: User
  ): Promise<{ role: UserRole; profile: UserProfile | DriverProfile } | null> => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const uData = userSnap.data() as UserProfile;
        return { role: uData.role, profile: uData };
      }

      const driverDocRef = doc(db, 'drivers', user.uid);
      const driverSnap = await getDoc(driverDocRef);

      if (driverSnap.exists()) {
        const dData = driverSnap.data() as DriverProfile;
        const rawVehicle = dData.vehicleInfo || '';
        const cleanedVehicle = sanitizeVehicleInfo(rawVehicle);
        dData.vehicleInfo = cleanedVehicle;

        if (
          rawVehicle.toLowerCase().includes('fleet') ||
          rawVehicle.toLowerCase().includes('e-bike')
        ) {
          updateDoc(driverDocRef, {
            vehicleInfo: cleanedVehicle,
            vehicleType: 'E-Shuttle Transit',
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        return { role: 'driver', profile: dData };
      }

      // Auto-provision master admin if logging in as admin@eshuttle.com
      const userEmail = (user.email || '').toLowerCase().trim();
      if (userEmail === 'admin@eshuttle.com') {
        const adminDoc: UserProfile = {
          uid: user.uid,
          role: 'admin',
          fullName: 'Platform Administrator',
          email: userEmail,
          username: 'admin',
          phone: '+63 917 000 0000',
          accountStatus: 'APPROVED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(userDocRef, sanitizeFirestoreData(adminDoc));
        return { role: 'admin', profile: adminDoc };
      }

      // Self-Healing for Orphaned Account:
      // Check if registration intent was driver (via localStorage or email prefix)
      let intendedRole: 'customer' | 'driver' = 'customer';
      try {
        const savedRole = localStorage.getItem('eshuttle_last_reg_role');
        if (savedRole === 'driver' || userEmail.includes('driver')) {
          intendedRole = 'driver';
        }
      } catch {}

      if (intendedRole === 'driver') {
        let pendingCardUrl = '';
        let pendingLicenseNum = '';
        try {
          pendingCardUrl = localStorage.getItem('eshuttle_pending_license_url') || '';
          pendingLicenseNum = localStorage.getItem('eshuttle_pending_license_num') || '';
        } catch {}

        const recoveredDriverDoc: DriverProfile = {
          uid: user.uid,
          role: 'driver',
          fullName: user.displayName || userEmail.split('@')[0] || 'E-Shuttle Driver',
          email: userEmail,
          phone: '+63 900 000 0000',
          accountStatus: 'PENDING',
          availability: 'OFFLINE',
          vehicleType: 'E-Shuttle Transit',
          vehicleInfo: 'Unassigned E-Shuttle',
          driverLicenseCardUrl: pendingCardUrl,
          driverLicenseNumber: pendingLicenseNum,
          currentLocation: {
            latitude: 14.5547,
            longitude: 121.0244,
            address: 'Central E-Shuttle Hub',
          },
          activeBookingId: null,
          rating: 5.0,
          totalRides: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(driverDocRef, sanitizeFirestoreData(recoveredDriverDoc));
        try {
          localStorage.removeItem('eshuttle_last_reg_role');
          localStorage.removeItem('eshuttle_pending_license_url');
          localStorage.removeItem('eshuttle_pending_license_num');
        } catch {}

        return { role: 'driver', profile: recoveredDriverDoc };
      } else {
        const recoveredUserDoc: UserProfile = {
          uid: user.uid,
          role: 'customer',
          fullName: user.displayName || userEmail.split('@')[0] || 'Passenger',
          email: userEmail,
          phone: '+63 900 000 0000',
          accountStatus: 'APPROVED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(userDocRef, sanitizeFirestoreData(recoveredUserDoc));
        try {
          localStorage.removeItem('eshuttle_last_reg_role');
        } catch {}

        return { role: 'customer', profile: recoveredUserDoc };
      }
    } catch (err) {
      console.error('Error syncing user profile:', err);
      return null;
    }
  };

  // 2. Load user/driver profile and subscribe to updates
  useEffect(() => {
    if (!currentUser) {
      setUserProfile(null);
      setDriverProfile(null);
      setRole(null);
      setLoading(false);
      return;
    }

    let unsubProfile: (() => void) | null = null;
    let isCancelled = false;

    async function loadProfileAndSubscribe() {
      setLoading(true);
      try {
        const synced = await syncUserProfile(currentUser!);

        if (isCancelled) return;

        if (synced) {
          if (synced.role === 'driver') {
            setDriverProfile(synced.profile as DriverProfile);
            setUserProfile(null);
            setRole('driver');

            unsubProfile = onSnapshot(
              doc(db, 'drivers', currentUser!.uid),
              (snap) => {
                if (snap.exists()) {
                  const updated = snap.data() as DriverProfile;
                  updated.vehicleInfo = sanitizeVehicleInfo(updated.vehicleInfo);
                  setDriverProfile(updated);
                }
              },
              (err) => {
                if (err.code !== 'permission-denied') {
                  console.error('Driver listener error:', err);
                }
              }
            );
          } else {
            setUserProfile(synced.profile as UserProfile);
            setDriverProfile(null);
            setRole(synced.role);

            unsubProfile = onSnapshot(
              doc(db, 'users', currentUser!.uid),
              (snap) => {
                if (snap.exists()) {
                  const updated = snap.data() as UserProfile;
                  setUserProfile(updated);
                  setRole(updated.role);
                }
              },
              (err) => {
                if (err.code !== 'permission-denied') {
                  console.error('User listener error:', err);
                }
              }
            );
          }
        }
      } catch (err: any) {
        if (err?.code !== 'permission-denied' && !err?.message?.includes('permissions')) {
          console.error('Error fetching user context:', err);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadProfileAndSubscribe();

    return () => {
      isCancelled = true;
      if (unsubProfile) {
        unsubProfile();
      }
    };
  }, [currentUser?.uid]);

  const resolveEmailFromIdentifier = async (identifier: string): Promise<string> => {
    const clean = identifier.trim().toLowerCase();
    if (clean.includes('@')) {
      return clean;
    }

    if (clean === 'admin') {
      return 'admin@eshuttle.com';
    }

    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', clean));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const uData = snap.docs[0].data();
        if (uData.email) return uData.email;
      }

      const driversRef = collection(db, 'drivers');
      const qD = query(driversRef, where('username', '==', clean));
      const snapD = await getDocs(qD);
      if (!snapD.empty) {
        const dData = snapD.docs[0].data();
        if (dData.email) return dData.email;
      }
    } catch (err) {
      console.warn('Username lookup error:', err);
    }

    if (clean.startsWith('admin')) {
      return 'admin@eshuttle.com';
    }

    return identifier;
  };

  const signIn = async (emailOrUsername: string, pass: string) => {
    setLoading(true);
    try {
      const resolvedEmail = await resolveEmailFromIdentifier(emailOrUsername);
      const res = await signInWithEmailAndPassword(auth, resolvedEmail, pass);

      // Instantly synchronize user profile and set appropriate role
      const synced = await syncUserProfile(res.user);
      if (synced) {
        if (synced.role === 'admin') {
          await firebaseSignOut(auth);
          setUserProfile(null);
          setDriverProfile(null);
          setRole(null);
          throw new Error('Access Denied: Administrator accounts must sign in using the Administrator Portal.');
        } else if (synced.role === 'driver') {
          setDriverProfile(synced.profile as DriverProfile);
          setUserProfile(null);
          setRole('driver');
        } else {
          setUserProfile(synced.profile as UserProfile);
          setDriverProfile(null);
          setRole(synced.role);
        }
      }

      logActivity({
        action: 'AUTH_LOGIN',
        actionLabel: 'User Signed In',
        entityType: 'AUTH',
        entityId: res.user.uid,
        entityName: resolvedEmail,
        summary: `User "${resolvedEmail}" logged into system`,
        performedBy: { uid: res.user.uid, name: res.user.displayName || resolvedEmail, email: resolvedEmail },
        severity: 'info',
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const signInAdmin = async (emailOrUsername: string, pass: string) => {
    setLoading(true);
    try {
      const resolvedEmail = await resolveEmailFromIdentifier(emailOrUsername);
      const res = await signInWithEmailAndPassword(auth, resolvedEmail, pass);
      const userDocRef = doc(db, 'users', res.user.uid);
      const userSnap = await getDoc(userDocRef);

      const isAdminEmail =
        res.user.email?.toLowerCase() === 'admin@eshuttle.com' ||
        resolvedEmail.trim().toLowerCase() === 'admin@eshuttle.com';
      const isRoleAdmin = userSnap.exists() && userSnap.data()?.role === 'admin';

      if (!isAdminEmail && !isRoleAdmin) {
        await firebaseSignOut(auth);
        setUserProfile(null);
        setDriverProfile(null);
        setRole(null);
        throw new Error('Access Denied: Account does not have administrator privileges.');
      }

      if (isAdminEmail && !userSnap.exists()) {
        const adminDoc: UserProfile = {
          uid: res.user.uid,
          role: 'admin',
          fullName: 'Platform Administrator',
          email: res.user.email || resolvedEmail,
          username: 'admin',
          phone: '+63 917 000 0000',
          accountStatus: 'APPROVED',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(userDocRef, sanitizeFirestoreData(adminDoc));
        setUserProfile(adminDoc);
        setDriverProfile(null);
        setRole('admin');

        logActivity({
          action: 'CREATE',
          actionLabel: 'Provisioned Master Admin',
          entityType: 'ADMIN',
          entityId: res.user.uid,
          entityName: 'Platform Administrator',
          summary: `Master administrator profile initialized for "${resolvedEmail}"`,
          details: {
            summary: 'Initial master admin profile document created in Firestore',
            after: { uid: res.user.uid, email: resolvedEmail, role: 'admin', username: 'admin' },
          },
          performedBy: { uid: res.user.uid, name: 'Platform Administrator', email: resolvedEmail, role: 'admin' },
          severity: 'success',
        }).catch(() => {});
      } else if (userSnap.exists()) {
        const uData = userSnap.data() as UserProfile;
        setUserProfile(uData);
        setDriverProfile(null);
        setRole('admin');
      }

      logActivity({
        action: 'AUTH_LOGIN',
        actionLabel: 'Admin Signed In',
        entityType: 'AUTH',
        entityId: res.user.uid,
        entityName: resolvedEmail,
        summary: `Administrator "${resolvedEmail}" authenticated into Admin Console`,
        performedBy: { uid: res.user.uid, name: 'Platform Administrator', email: resolvedEmail, role: 'admin' },
        severity: 'info',
      }).catch(() => {});
    } catch (err) {
      setUserProfile(null);
      setDriverProfile(null);
      setRole(null);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signUpCustomer = async (
    fullName: string,
    email: string,
    phone: string,
    pass: string
  ) => {
    setLoading(true);
    try {
      localStorage.setItem('eshuttle_last_reg_role', 'customer');
    } catch {}

    try {
      const cleanFullName = fullName.trim();
      if (!isValidFullName(cleanFullName)) {
        throw new Error('Please enter a valid full name with letters only (e.g., Maria Santos). Numbers and special symbols are not allowed.');
      }
      const cleanEmail = email.trim().toLowerCase();
      if (!isValidEmail(cleanEmail)) {
        throw new Error('Please enter a valid email address with a domain (e.g., name@example.com).');
      }
      if (!isValidPhoneNumber(phone)) {
        throw new Error('Please enter a valid mobile phone number without alphabet characters (e.g., 0917 123 4567).');
      }
      let userUid: string;

      try {
        const res = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        userUid = res.user.uid;
      } catch (authErr: any) {
        // Self-healing: If user already exists in Firebase Auth, sign in and complete profile
        if (authErr?.code === 'auth/email-already-in-use') {
          try {
            const signInRes = await signInWithEmailAndPassword(auth, cleanEmail, pass);
            userUid = signInRes.user.uid;
          } catch {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

      const userDoc: UserProfile = {
        uid: userUid,
        role: 'customer',
        fullName: fullName.trim(),
        email: cleanEmail,
        phone: phone.trim() || '+63 900 000 0000',
        accountStatus: 'APPROVED',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'users', userUid), sanitizeFirestoreData(userDoc));
      setUserProfile(userDoc);
      setDriverProfile(null);
      setRole('customer');

      try {
        localStorage.removeItem('eshuttle_last_reg_role');
      } catch {}

      logActivity({
        action: 'AUTH_REGISTER',
        actionLabel: 'Registered Passenger Account',
        entityType: 'USER',
        entityId: userUid,
        entityName: fullName.trim(),
        summary: `New passenger registered: "${fullName.trim()}" (${cleanEmail})`,
        details: {
          summary: `Customer registered account with phone ${phone.trim()}`,
          after: { uid: userUid, fullName: fullName.trim(), email: cleanEmail, phone: phone.trim(), role: 'customer' },
        },
        performedBy: { uid: userUid, name: fullName.trim(), email: cleanEmail, role: 'customer' },
        severity: 'success',
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const signUpDriver = async (
    fullName: string,
    email: string,
    phone: string,
    pass: string,
    vehicleType: string = 'E-Shuttle Transit',
    vehicleInfo: string = 'Unassigned E-Shuttle',
    driverLicenseCardUrl?: string,
    driverLicenseNumber?: string
  ) => {
    setLoading(true);
    // Cache pending driver intent
    try {
      localStorage.setItem('eshuttle_last_reg_role', 'driver');
      if (driverLicenseCardUrl) localStorage.setItem('eshuttle_pending_license_url', driverLicenseCardUrl);
      if (driverLicenseNumber) localStorage.setItem('eshuttle_pending_license_num', driverLicenseNumber);
    } catch {}

    try {
      const cleanFullName = fullName.trim();
      if (!isValidFullName(cleanFullName)) {
        throw new Error('Please enter a valid full name with letters only (e.g., Maria Santos). Numbers and special symbols are not allowed.');
      }
      const cleanEmail = email.trim().toLowerCase();
      if (!isValidEmail(cleanEmail)) {
        throw new Error('Please enter a valid email address with a domain (e.g., name@example.com).');
      }
      if (!isValidPhoneNumber(phone)) {
        throw new Error('Please enter a valid mobile phone number without alphabet characters (e.g., 0917 123 4567).');
      }
      if (driverLicenseNumber && !isValidDriverLicense(driverLicenseNumber)) {
        throw new Error('Must follow legitimate LTO format: Letter + 2 digits - 2 digits - 6 digits (e.g., N01-23-456789).');
      }
      let userUid: string;

      try {
        const res = await createUserWithEmailAndPassword(auth, cleanEmail, pass);
        userUid = res.user.uid;
      } catch (authErr: any) {
        // Self-healing: If user already exists in Firebase Auth (e.g. earlier failed setDoc attempt),
        // sign in with the password and proceed to save the driver profile document
        if (authErr?.code === 'auth/email-already-in-use') {
          try {
            const signInRes = await signInWithEmailAndPassword(auth, cleanEmail, pass);
            userUid = signInRes.user.uid;
          } catch {
            throw authErr;
          }
        } else {
          throw authErr;
        }
      }

      const driverDoc: DriverProfile = {
        uid: userUid,
        role: 'driver',
        fullName: fullName.trim(),
        email: cleanEmail,
        phone: phone.trim() || '+63 900 000 0000',
        accountStatus: 'PENDING', // Drivers start as PENDING requiring Admin approval
        availability: 'OFFLINE',
        vehicleType: vehicleType || 'E-Shuttle Transit',
        vehicleInfo: vehicleInfo || 'Unassigned E-Shuttle',
        driverLicenseCardUrl: (driverLicenseCardUrl || '').trim(),
        driverLicenseNumber: (driverLicenseNumber || '').trim(),
        currentLocation: {
          latitude: 14.5547,
          longitude: 121.0244,
          address: 'Central E-Shuttle Hub',
        },
        activeBookingId: null,
        rating: 5.0,
        totalRides: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, 'drivers', userUid), sanitizeFirestoreData(driverDoc));
      try {
        await deleteDoc(doc(db, 'users', userUid));
      } catch {}

      try {
        localStorage.removeItem('eshuttle_last_reg_role');
        localStorage.removeItem('eshuttle_pending_license_url');
        localStorage.removeItem('eshuttle_pending_license_num');
      } catch {}

      setDriverProfile(driverDoc);
      setUserProfile(null);
      setRole('driver');

      logActivity({
        action: 'AUTH_REGISTER',
        actionLabel: 'Applied as Driver',
        entityType: 'DRIVER',
        entityId: userUid,
        entityName: fullName.trim(),
        summary: `New driver registered application: "${fullName.trim()}" (${cleanEmail}) - Pending Admin Verification`,
        details: {
          summary: `Driver application submitted with license ${driverLicenseNumber?.trim() || 'N/A'}`,
          after: { uid: userUid, fullName: fullName.trim(), email: cleanEmail, phone: phone.trim(), role: 'driver', accountStatus: 'PENDING' },
        },
        performedBy: { uid: userUid, name: fullName.trim(), email: cleanEmail, role: 'driver' },
        severity: 'warning',
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmail(cleanEmail)) {
      throw new Error('Please enter a valid email address with a domain (e.g., name@example.com).');
    }
    await sendPasswordResetEmail(auth, cleanEmail);
  };

  const logout = async () => {
    const prevUser = currentUser;
    const prevProfile = userProfile || driverProfile;
    setLoading(true);
    try {
      try {
        localStorage.removeItem('eshuttle_last_reg_role');
        localStorage.removeItem('eshuttle_pending_license_url');
        localStorage.removeItem('eshuttle_pending_license_num');
      } catch {}
      await firebaseSignOut(auth);
      setUserProfile(null);
      setDriverProfile(null);
      setRole(null);
    } finally {
      setLoading(false);
    }

    if (prevUser) {
      const isAdmin = prevProfile?.role === 'admin' || prevUser.email === 'admin@eshuttle.com';
      logActivity({
        action: 'AUTH_LOGOUT',
        actionLabel: isAdmin ? 'Admin Signed Out' : 'User Signed Out',
        entityType: 'AUTH',
        entityId: prevUser.uid,
        entityName: prevProfile?.fullName || prevUser.email || prevUser.uid,
        summary: isAdmin
          ? `Administrator "${prevProfile?.fullName || prevUser.email}" signed out of Admin Console`
          : `User "${prevProfile?.fullName || prevUser.email || prevUser.uid}" signed out of session`,
        performedBy: {
          uid: prevUser.uid,
          name: prevProfile?.fullName || (isAdmin ? 'Platform Administrator' : 'User'),
          email: prevUser.email || undefined,
          role: isAdmin ? 'admin' : (prevProfile?.role || 'customer'),
        },
        severity: 'info',
      }).catch(() => {});
    }
  };

  const refreshProfile = async () => {
    if (!currentUser) return;
    if (role === 'customer' || role === 'admin') {
      const uSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (uSnap.exists()) setUserProfile(uSnap.data() as UserProfile);
    } else if (role === 'driver') {
      const dSnap = await getDoc(doc(db, 'drivers', currentUser.uid));
      if (dSnap.exists()) setDriverProfile(dSnap.data() as DriverProfile);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        driverProfile,
        role,
        loading,
        signIn,
        signInAdmin,
        signUpCustomer,
        signUpDriver,
        resetPassword,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

